// Google のサービスに依存しない処理．test/logic.test.mjs で Node から確かめる

// フォーム（index.html）の選択肢と同じ値だけを受け付ける
const FORM_CHOICES = {
    regions: ['気仙沼市内', '宮城県内（気仙沼市以外）', '岩手県', '福島県', 'その他東北地方', '関東地方', 'その他'],
    transports: ['車', '徒歩', '自転車', 'バス', 'タクシー', 'その他'],
    awareness: ['チラシ・ポスター', 'SNS（Twitter/X）', 'SNS（Instagram）', 'SNS（Facebook）', '知人の紹介', '学校からのお知らせ', 'ウェブサイト', '地域の広報誌', '新聞', 'その他'],
    yesNo: ['はい', 'いいえ']
};

const LIMITS = { attendees: 100, nameLength: 50, emailLength: 100, cars: 10, workshop: 5, planetarium: 30 };

// 予約データのシートの列．順番を変えると既存の行とずれる
const SHEET_COLUMNS = [
    'タイムスタンプ', '来場人数', '代表者氏名', '来場地域', 'メールアドレス', '当日の交通手段', 'お車台数',
    'イベント認知経路', 'ワークショップ参加', 'ワークショップ参加人数', '予約する部',
    'プラネタリウム鑑賞', 'プラネタリウム参加人数', 'プラネタリウム予約部', '確認メール送信'
];

const EMAIL_PATTERN = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

// 申込の入力を検査し，知っている項目だけを整えて返す．値は変換せずそのまま残す
function validateReservation(input, event) {
    const errors = [];
    const data = {};
    const text = key => (typeof input[key] === 'string' ? input[key].trim() : '');

    const requireChoice = (key, choices) => {
        const value = text(key);
        if (!choices.includes(value)) {
            errors.push(`${key}を選択肢から選んでください。`);
            return '';
        }
        data[key] = value;
        return value;
    };
    const requireInteger = (key, min, max) => {
        const value = text(key);
        const number = /^\d+$/.test(value) ? Number(value) : NaN;
        if (!(number >= min && number <= max)) {
            errors.push(`${key}は${min}〜${max}の数で選んでください。`);
            return 0;
        }
        data[key] = number;
        return number;
    };
    const requirePart = (key, parts) => {
        const value = text(key);
        if (!parts.some(part => part.name === value)) {
            errors.push(`${key}を選択肢から選んでください。`);
            return;
        }
        data[key] = value;
    };

    const attendees = requireInteger('来場人数', 1, LIMITS.attendees);

    const name = text('代表者氏名');
    if (!name || name.length > LIMITS.nameLength || CONTROL_CHARS.test(name)) {
        errors.push(`代表者氏名は${LIMITS.nameLength}文字以内で入力してください。`);
    } else {
        data.代表者氏名 = name;
    }

    requireChoice('来場地域', FORM_CHOICES.regions);

    const email = text('メールアドレス');
    if (!email || email.length > LIMITS.emailLength || !EMAIL_PATTERN.test(email)) {
        errors.push('メールアドレスを正しく入力してください。');
    } else {
        data.メールアドレス = email;
    }

    if (requireChoice('当日の交通手段', FORM_CHOICES.transports) === '車') {
        requireInteger('お車台数', 1, LIMITS.cars);
    }

    if (text('イベント認知経路')) {
        requireChoice('イベント認知経路', FORM_CHOICES.awareness);
    }

    if (requireChoice('ワークショップ参加', FORM_CHOICES.yesNo) === 'はい') {
        const count = requireInteger('ワークショップ参加人数', 1, LIMITS.workshop);
        if (count && attendees && count > attendees) {
            errors.push('ワークショップ参加人数は来場人数以下にしてください。');
        }
        requirePart('予約する部', event.workshopParts);
    }

    if (requireChoice('プラネタリウム鑑賞', FORM_CHOICES.yesNo) === 'はい') {
        const count = requireInteger('プラネタリウム参加人数', 1, LIMITS.planetarium);
        if (count && attendees && count > attendees) {
            errors.push('プラネタリウム参加人数は来場人数以下にしてください。');
        }
        requirePart('プラネタリウム予約部', event.planetariumParts);
    }

    return errors.length ? { ok: false, errors } : { ok: true, data };
}

// 部ごとの残席．定員にない部への予約は数えない
function summarizeSeats(parts, bookings) {
    return parts.map(part => {
        const reserved = bookings
            .filter(booking => booking.part === part.name)
            .reduce((sum, booking) => sum + booking.count, 0);
        return { name: part.name, capacity: part.capacity, remaining: Math.max(0, part.capacity - reserved) };
    });
}

const BOOKING_COLUMNS = {
    workshop: { flag: 'ワークショップ参加', count: 'ワークショップ参加人数', part: '予約する部' },
    planetarium: { flag: 'プラネタリウム鑑賞', count: 'プラネタリウム参加人数', part: 'プラネタリウム予約部' }
};

// シートの行（見出しを除く）から，参加する行の部と人数を拾う
function bookingsFromRows(rows, kind) {
    const columns = BOOKING_COLUMNS[kind];
    const flag = SHEET_COLUMNS.indexOf(columns.flag);
    const count = SHEET_COLUMNS.indexOf(columns.count);
    const part = SHEET_COLUMNS.indexOf(columns.part);
    return rows
        .filter(row => row[flag] === 'はい' && row[part] !== '')
        .map(row => ({ part: String(row[part]), count: parseInt(row[count], 10) || 0 }));
}

function findCapacityErrors(data, workshopSeats, planetariumSeats) {
    const errors = [];
    const check = (seats, partName, count) => {
        const seat = seats.find(item => item.name === partName);
        if (!seat || seat.remaining < count) {
            errors.push(`${partName}の残席が不足しています（残り${seat ? seat.remaining : 0}席）。別の部を選んでください。`);
        }
    };
    if (data.ワークショップ参加 === 'はい') {
        check(workshopSeats, data.予約する部, data.ワークショップ参加人数);
    }
    if (data.プラネタリウム鑑賞 === 'はい') {
        check(planetariumSeats, data.プラネタリウム予約部, data.プラネタリウム参加人数);
    }
    return errors;
}

// 先頭が = + - @ タブ 改行の文字列は，シートで数式として読まれないよう ' を前に付ける
function escapeForSheet(value) {
    return typeof value === 'string' && /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

function toSheetRow(data, timestamp) {
    return SHEET_COLUMNS.map(column => {
        if (column === 'タイムスタンプ') return timestamp;
        if (column === '確認メール送信') return '';
        return data[column] === undefined ? '' : escapeForSheet(data[column]);
    });
}

function buildConfirmationEmail(data, event) {
    const lines = [
        `${data.代表者氏名} 様`,
        '',
        `${event.title}へのお申し込みありがとうございます。`,
        '以下の内容で予約を承りました。',
        '',
        '■予約内容',
        `・来場人数: ${data.来場人数}名`,
        `・代表者: ${data.代表者氏名}`,
        `・来場地域: ${data.来場地域}`,
        `・交通手段: ${data.当日の交通手段}${data.お車台数 ? ` (${data.お車台数}台)` : ''}`
    ];
    if (data.イベント認知経路) {
        lines.push(`・きっかけ: ${data.イベント認知経路}`);
    }
    lines.push(`・ワークショップ: ${data.ワークショップ参加}`);
    if (data.ワークショップ参加 === 'はい') {
        lines.push(`  参加人数: ${data.ワークショップ参加人数}名`, `  予約部: ${data.予約する部}`);
    }
    lines.push(`・プラネタリウム: ${data.プラネタリウム鑑賞}`);
    if (data.プラネタリウム鑑賞 === 'はい') {
        lines.push(`  鑑賞人数: ${data.プラネタリウム参加人数}名`, `  予約部: ${data.プラネタリウム予約部}`);
    }
    lines.push(
        '',
        '■開催情報',
        `日時: ${event.dateText}`,
        `場所: ${event.venue}`,
        `住所: ${event.address}`,
        '',
        '■重要事項',
        ...event.notes.map(note => `・${note}`),
        '',
        '■お問い合わせ',
        event.contact,
        '',
        '当日お会いできることを楽しみにしております。',
        '',
        event.senderName
    );
    return { subject: `${event.title} 予約確認`, body: lines.join('\n') };
}

// 受付期間の判定．acceptFrom / acceptUntil は '2027-08-01T10:00:00+09:00' の形．開始が空なら受け付けない
function checkAcceptance(event, now) {
    if (!event.acceptFrom) {
        return { open: false, message: '現在、申込は受け付けていません。' };
    }
    const from = new Date(event.acceptFrom);
    if (now < from) {
        // 日本時間で表すため 9 時間ずらして UTC として読む
        const jst = new Date(from.getTime() + 9 * 60 * 60 * 1000);
        const minutes = String(jst.getUTCMinutes()).padStart(2, '0');
        return {
            open: false,
            message: `申込の受付は ${jst.getUTCMonth() + 1}月${jst.getUTCDate()}日 ${jst.getUTCHours()}:${minutes} からです。`
        };
    }
    if (event.acceptUntil && now > new Date(event.acceptUntil)) {
        return { open: false, message: '申込の受付は終了しました。' };
    }
    return { open: true, message: '' };
}
