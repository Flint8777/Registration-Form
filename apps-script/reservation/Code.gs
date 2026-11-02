// 申込フォームの受付口．幹部のアカウントの独立型プロジェクトとして，ウェブアプリで公開する
// スクリプト プロパティ:
//   SPREADSHEET_ID      予約のシートの ID
//   TURNSTILE_SECRET    Turnstile の秘密鍵
//   TURNSTILE_HOSTNAMES フォームを置くホスト名（カンマ区切り）．本番に localhost を入れない
//   TEST_MODE           'true' の間は試験モード．startTestMode / endTestMode で切り替える

const SHEET_NAME = '予約データ';
const TIME_ZONE = 'Asia/Tokyo';

// GAS とシートのタイムゾーンの設定に左右されないよう，日本時間の文字列にして書く
function nowText() {
    return Utilities.formatDate(new Date(), TIME_ZONE, 'yyyy/MM/dd HH:mm:ss');
}
// SHEET_COLUMNS は Logic.gs にあり，ファイルの読み込み順に頼らないよう関数にする
function emailStatusColumn() {
    return SHEET_COLUMNS.indexOf('確認メール送信') + 1;
}

const MESSAGES = {
    turnstile: '送信を確認できませんでした。ページを再読み込みして、もう一度お試しください。',
    invalid: '入力内容に誤りがあります。',
    busy: '申込が混み合っています。少し時間をおいて、もう一度お試しください。',
    server: '予約の処理中にエラーが発生しました。時間をおいて、もう一度お試しください。'
};

function doGet(e) {
    const action = e && e.parameter ? e.parameter.action : '';
    try {
        if (action === 'getParts' || action === 'getWorkshopParts') {
            return json({ success: true, data: loadSeats(getSheet()).workshop });
        }
        if (action === 'getPlanetariumParts') {
            return json({ success: true, data: loadSeats(getSheet()).planetarium });
        }
        if (action === 'status') {
            const acceptance = checkAcceptance(EVENT, new Date());
            return json({ success: true, accepting: acceptance.open, message: acceptance.message });
        }
        return json({ success: false, error: '不明な要求です。' });
    } catch (error) {
        console.error('残席の取得に失敗: ' + error.message);
        return json({ success: false, error: '残席を取得できませんでした。' });
    }
}

function doPost(e) {
    try {
        const params = (e && e.parameter) || {};
        const acceptance = checkAcceptance(EVENT, new Date());
        if (!acceptance.open) {
            return json({ success: false, error: acceptance.message });
        }
        if (!verifyTurnstile(params['cf-turnstile-response'])) {
            return json({ success: false, error: MESSAGES.turnstile });
        }
        const result = validateReservation(params, EVENT);
        if (!result.ok) {
            return json({ success: false, error: MESSAGES.invalid, errors: result.errors });
        }
        const saved = saveReservation(result.data);
        if (!saved.ok) {
            return json({ success: false, error: saved.errors.join('\n'), errors: saved.errors });
        }
        const emailSent = sendConfirmation(result.data);
        saved.sheet.getRange(saved.row, emailStatusColumn()).setValue(emailSent ? nowText() : '失敗');
        return json({ success: true, emailSent });
    } catch (error) {
        console.error('申込の処理に失敗: ' + error.message);
        return json({ success: false, error: MESSAGES.server });
    }
}

function json(value) {
    return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
}

function getProperty(key) {
    const value = PropertiesService.getScriptProperties().getProperty(key);
    if (!value) {
        throw new Error(`スクリプト プロパティ ${key} が未設定です`);
    }
    return value;
}

function getSheet() {
    const sheet = SpreadsheetApp.openById(getProperty('SPREADSHEET_ID')).getSheetByName(SHEET_NAME);
    if (!sheet) {
        throw new Error(`シート「${SHEET_NAME}」がありません．setupSheet を実行してください`);
    }
    return sheet;
}

function readRows(sheet) {
    const lastRow = sheet.getLastRow();
    return lastRow < 2 ? [] : sheet.getRange(2, 1, lastRow - 1, SHEET_COLUMNS.length).getValues();
}

function loadSeats(sheet) {
    const rows = readRows(sheet);
    return {
        workshop: summarizeSeats(EVENT.workshopParts, bookingsFromRows(rows, 'workshop')),
        planetarium: summarizeSeats(EVENT.planetariumParts, bookingsFromRows(rows, 'planetarium'))
    };
}

// 残席の確認から書き込みまでを排他にして，同時の申込で定員を超えないようにする
function saveReservation(data) {
    const lock = LockService.getScriptLock();
    if (!lock.tryLock(20000)) {
        return { ok: false, errors: [MESSAGES.busy] };
    }
    try {
        const sheet = getSheet();
        const seats = loadSeats(sheet);
        const errors = findCapacityErrors(data, seats.workshop, seats.planetarium);
        if (errors.length) {
            return { ok: false, errors };
        }
        sheet.appendRow(toSheetRow(data, nowText()));
        SpreadsheetApp.flush();
        return { ok: true, sheet, row: sheet.getLastRow() };
    } finally {
        lock.releaseLock();
    }
}

function verifyTurnstile(token) {
    if (typeof token !== 'string' || !token || token.length > 2048) {
        return false;
    }
    const response = UrlFetchApp.fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method: 'post',
        payload: { secret: getProperty('TURNSTILE_SECRET'), response: token },
        muteHttpExceptions: true
    });
    if (response.getResponseCode() !== 200) {
        console.error('Turnstile の確認に失敗: HTTP ' + response.getResponseCode());
        return false;
    }
    const result = JSON.parse(response.getContentText());
    const hostnames = getProperty('TURNSTILE_HOSTNAMES').split(',').map(name => name.trim());
    return result.success === true && hostnames.includes(result.hostname);
}

function isTestMode() {
    return PropertiesService.getScriptProperties().getProperty('TEST_MODE') === 'true';
}

// 差出人と返信先はチームのアドレス．BCC でチームに控えを残す
// 試験モードの間は BCC を付けず，件名の頭に【試験】を付ける
// 宛先が入るので，失敗しても例外の文面はログに出さない
function sendConfirmation(data) {
    try {
        const { subject, body } = buildConfirmationEmail(data, EVENT);
        const testMode = isTestMode();
        const options = { from: EVENT.contact, name: EVENT.senderName, replyTo: EVENT.contact };
        if (!testMode) {
            options.bcc = EVENT.contact;
        }
        GmailApp.sendEmail(data.メールアドレス, testMode ? `【試験】${subject}` : subject, body, options);
        return true;
    } catch (error) {
        console.error('確認メールの送信に失敗: ' + error.name);
        return false;
    }
}

// 以下はエディタから手で実行する

// 試験モードに入る．公開中の版にもすぐ効く（デプロイし直さなくてよい）
function startTestMode() {
    PropertiesService.getScriptProperties().setProperty('TEST_MODE', 'true');
    console.log('試験モードにしました．確認メールに BCC を付けず，件名に【試験】を付けます．終わったら endTestMode を実行してください');
}

function endTestMode() {
    PropertiesService.getScriptProperties().deleteProperty('TEST_MODE');
    console.log('本番に戻しました．確認メールは BCC 付きで送ります');
}

// 初回に 1 度だけ実行し，予約データのシートと見出しを作る
function setupSheet() {
    const spreadsheet = SpreadsheetApp.openById(getProperty('SPREADSHEET_ID'));
    // シートのタイムゾーンはアカウントの地域で決まるので，日本に固定する
    spreadsheet.setSpreadsheetTimeZone(TIME_ZONE);
    const sheet = spreadsheet.getSheetByName(SHEET_NAME) || spreadsheet.insertSheet(SHEET_NAME, 0);
    sheet.getRange(1, 1, 1, SHEET_COLUMNS.length).setValues([SHEET_COLUMNS]).setFontWeight('bold');
    sheet.setFrozenRows(1);
    spreadsheet.getSheets()
        .filter(other => other.getName() !== SHEET_NAME && other.getLastRow() === 0)
        .forEach(other => spreadsheet.deleteSheet(other));
}

// 「確認メール送信」が「失敗」の行に送り直す．1 日の送信上限に当たった翌日などに使う
function resendFailedConfirmations() {
    const sheet = getSheet();
    readRows(sheet).forEach((row, index) => {
        if (row[emailStatusColumn() - 1] !== '失敗') return;
        const data = {};
        SHEET_COLUMNS.forEach((column, i) => {
            if (row[i] !== '') data[column] = row[i];
        });
        const sent = sendConfirmation(data);
        sheet.getRange(index + 2, emailStatusColumn()).setValue(sent ? nowText() : '失敗');
    });
}
