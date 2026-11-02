// Logic.gs の純粋な関数を Node で確かめる．実行: node --test "apps-script/reservation/test/*.test.mjs"
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const dir = new URL('..', import.meta.url);
const context = vm.createContext({});
for (const file of ['Event.gs', 'Logic.gs']) {
    vm.runInContext(readFileSync(new URL(file, dir), 'utf8'), context, { filename: file });
}
// .gs のトップレベルの const は context のプロパティにならないので，同じ context で式として取り出す
const {
    EVENT, SHEET_COLUMNS, validateReservation, summarizeSeats, bookingsFromRows,
    findCapacityErrors, toSheetRow, escapeForSheet, buildConfirmationEmail, checkAcceptance
} = vm.runInContext(
    '({ EVENT, SHEET_COLUMNS, validateReservation, summarizeSeats, bookingsFromRows, findCapacityErrors, toSheetRow, escapeForSheet, buildConfirmationEmail, checkAcceptance })',
    context
);

const W1 = EVENT.workshopParts[0].name;
const P1 = EVENT.planetariumParts[0].name;

function baseInput(overrides = {}) {
    return {
        来場人数: '3',
        代表者氏名: '気仙沼 太郎',
        来場地域: '気仙沼市内',
        メールアドレス: 'taro@example.com',
        当日の交通手段: '徒歩',
        ワークショップ参加: 'いいえ',
        プラネタリウム鑑賞: 'いいえ',
        ...overrides
    };
}

function errorsOf(input) {
    const result = validateReservation(input, EVENT);
    assert.equal(result.ok, false, '検査を通ってしまった');
    return result.errors;
}

test('最小の正しい申込は通り，数値は整数になる', () => {
    const result = validateReservation(baseInput(), EVENT);
    assert.equal(result.ok, true);
    assert.equal(result.data.来場人数, 3);
    assert.equal(result.data.代表者氏名, '気仙沼 太郎');
});

test('前後の空白は落とす', () => {
    const result = validateReservation(baseInput({ 代表者氏名: '  気仙沼 太郎　', メールアドレス: ' taro@example.com ' }), EVENT);
    assert.equal(result.ok, true);
    assert.equal(result.data.代表者氏名, '気仙沼 太郎');
    assert.equal(result.data.メールアドレス, 'taro@example.com');
});

test('記号は変換せずそのまま残す', () => {
    const result = validateReservation(baseInput({ イベント認知経路: 'SNS（Twitter/X）', 代表者氏名: "O'Brien" }), EVENT);
    assert.equal(result.ok, true);
    assert.equal(result.data.イベント認知経路, 'SNS（Twitter/X）');
    assert.equal(result.data.代表者氏名, "O'Brien");
});

test('必須の項目が欠けたら断る', () => {
    for (const key of ['来場人数', '代表者氏名', '来場地域', 'メールアドレス', '当日の交通手段', 'ワークショップ参加', 'プラネタリウム鑑賞']) {
        const input = baseInput();
        delete input[key];
        assert.ok(errorsOf(input).length > 0, `${key} が無くても通った`);
    }
});

test('選択肢にない値は断る', () => {
    errorsOf(baseInput({ 来場地域: '北海道' }));
    errorsOf(baseInput({ 当日の交通手段: '飛行機' }));
    errorsOf(baseInput({ イベント認知経路: '夢のお告げ' }));
    errorsOf(baseInput({ ワークショップ参加: '参加する' }));
    errorsOf(baseInput({ プラネタリウム鑑賞: 'yes' }));
});

test('来場人数は 1〜100 の整数', () => {
    errorsOf(baseInput({ 来場人数: '0' }));
    errorsOf(baseInput({ 来場人数: '101' }));
    errorsOf(baseInput({ 来場人数: '2.5' }));
    errorsOf(baseInput({ 来場人数: '三' }));
    assert.equal(validateReservation(baseInput({ 来場人数: '100' }), EVENT).ok, true);
});

test('氏名は 50 文字まで，制御文字は断る', () => {
    assert.equal(validateReservation(baseInput({ 代表者氏名: 'あ'.repeat(50) }), EVENT).ok, true);
    errorsOf(baseInput({ 代表者氏名: 'あ'.repeat(51) }));
    errorsOf(baseInput({ 代表者氏名: '太郎\n次郎' }));
});

test('メールアドレスの形と長さを確かめる', () => {
    errorsOf(baseInput({ メールアドレス: 'taro' }));
    errorsOf(baseInput({ メールアドレス: 'taro@example.com\nBcc: x@example.com' }));
    errorsOf(baseInput({ メールアドレス: `${'a'.repeat(95)}@example.com` }));
});

test('車のときだけお車台数（1〜10）が要り，車でなければ捨てる', () => {
    errorsOf(baseInput({ 当日の交通手段: '車' }));
    errorsOf(baseInput({ 当日の交通手段: '車', お車台数: '11' }));
    const car = validateReservation(baseInput({ 当日の交通手段: '車', お車台数: '2' }), EVENT);
    assert.equal(car.ok, true);
    assert.equal(car.data.お車台数, 2);
    const walk = validateReservation(baseInput({ お車台数: '2' }), EVENT);
    assert.equal(walk.ok, true);
    assert.equal(walk.data.お車台数, undefined);
});

test('ワークショップに参加するなら人数（1〜5，来場人数以下）と部が要る', () => {
    errorsOf(baseInput({ ワークショップ参加: 'はい' }));
    errorsOf(baseInput({ ワークショップ参加: 'はい', ワークショップ参加人数: '2' }));
    errorsOf(baseInput({ ワークショップ参加: 'はい', ワークショップ参加人数: '2', 予約する部: '第99部' }));
    errorsOf(baseInput({ ワークショップ参加: 'はい', ワークショップ参加人数: '6', 予約する部: W1, 来場人数: '10' }));
    errorsOf(baseInput({ ワークショップ参加: 'はい', ワークショップ参加人数: '4', 予約する部: W1 }));
    const ok = validateReservation(baseInput({ ワークショップ参加: 'はい', ワークショップ参加人数: '2', 予約する部: W1 }), EVENT);
    assert.equal(ok.ok, true);
    assert.equal(ok.data.ワークショップ参加人数, 2);
    assert.equal(ok.data.予約する部, W1);
});

test('ワークショップに参加しないなら人数と部は捨てる', () => {
    const result = validateReservation(baseInput({ ワークショップ参加人数: '2', 予約する部: W1 }), EVENT);
    assert.equal(result.ok, true);
    assert.equal(result.data.ワークショップ参加人数, undefined);
    assert.equal(result.data.予約する部, undefined);
});

test('プラネタリウムを見るなら人数（1〜30，来場人数以下）と部が要る', () => {
    errorsOf(baseInput({ プラネタリウム鑑賞: 'はい' }));
    errorsOf(baseInput({ プラネタリウム鑑賞: 'はい', プラネタリウム参加人数: '2', プラネタリウム予約部: '第99部' }));
    errorsOf(baseInput({ プラネタリウム鑑賞: 'はい', プラネタリウム参加人数: '31', プラネタリウム予約部: P1, 来場人数: '40' }));
    errorsOf(baseInput({ プラネタリウム鑑賞: 'はい', プラネタリウム参加人数: '4', プラネタリウム予約部: P1 }));
    const ok = validateReservation(baseInput({ プラネタリウム鑑賞: 'はい', プラネタリウム参加人数: '3', プラネタリウム予約部: P1 }), EVENT);
    assert.equal(ok.ok, true);
    assert.equal(ok.data.プラネタリウム参加人数, 3);
});

test('知らない項目は捨てる', () => {
    const result = validateReservation(baseInput({ 余計な項目: 'x', 'cf-turnstile-response': 'token' }), EVENT);
    assert.equal(result.ok, true);
    assert.equal(result.data.余計な項目, undefined);
    assert.equal(result.data['cf-turnstile-response'], undefined);
});

test('残席は部ごとに定員から予約人数を引き，0 未満にしない', () => {
    const parts = [{ name: 'A', capacity: 5 }, { name: 'B', capacity: 5 }];
    const seats = summarizeSeats(parts, [{ part: 'A', count: 2 }, { part: 'A', count: 1 }, { part: 'B', count: 7 }, { part: 'Z', count: 1 }]);
    assert.deepEqual(JSON.parse(JSON.stringify(seats)), [
        { name: 'A', capacity: 5, remaining: 2 },
        { name: 'B', capacity: 5, remaining: 0 }
    ]);
});

test('シートの行から，参加する行の部と人数だけを拾う', () => {
    const row = (values) => SHEET_COLUMNS.map(column => values[column] ?? '');
    const rows = [
        row({ ワークショップ参加: 'はい', ワークショップ参加人数: 2, 予約する部: W1, プラネタリウム鑑賞: 'いいえ' }),
        row({ ワークショップ参加: 'いいえ', プラネタリウム鑑賞: 'はい', プラネタリウム参加人数: '3', プラネタリウム予約部: P1 }),
        row({ ワークショップ参加: 'はい', ワークショップ参加人数: '1', 予約する部: W1, プラネタリウム鑑賞: 'はい', プラネタリウム参加人数: 1, プラネタリウム予約部: P1 })
    ];
    assert.deepEqual(JSON.parse(JSON.stringify(bookingsFromRows(rows, 'workshop'))), [
        { part: W1, count: 2 }, { part: W1, count: 1 }
    ]);
    assert.deepEqual(JSON.parse(JSON.stringify(bookingsFromRows(rows, 'planetarium'))), [
        { part: P1, count: 3 }, { part: P1, count: 1 }
    ]);
});

test('残席が足りなければ部の名前と残りを示して断る', () => {
    const data = validateReservation(baseInput({
        ワークショップ参加: 'はい', ワークショップ参加人数: '3', 予約する部: W1,
        プラネタリウム鑑賞: 'はい', プラネタリウム参加人数: '3', プラネタリウム予約部: P1
    }), EVENT).data;
    const workshopSeats = [{ name: W1, capacity: 5, remaining: 2 }];
    const planetariumSeats = [{ name: P1, capacity: 20, remaining: 3 }];
    const errors = findCapacityErrors(data, workshopSeats, planetariumSeats);
    assert.equal(errors.length, 1);
    assert.match(errors[0], new RegExp(W1.replace(/[()]/g, '\\$&')));
    assert.match(errors[0], /2/);
    assert.deepEqual(findCapacityErrors(baseInput(), workshopSeats, planetariumSeats).length, 0);
});

test('数式として読まれうる先頭の文字には，先頭に引用符を付ける', () => {
    for (const head of ['=', '+', '-', '@', '\t', '\r']) {
        assert.equal(escapeForSheet(`${head}SUM(A1)`), `'${head}SUM(A1)`);
    }
    assert.equal(escapeForSheet('気仙沼 太郎'), '気仙沼 太郎');
    assert.equal(escapeForSheet(3), 3);
});

test('シートの行は列の順に並び，空の項目は空文字，確認メール送信の列は空で始まる', () => {
    const data = validateReservation(baseInput({ 代表者氏名: '=HYPERLINK("x")' }), EVENT).data;
    const timestamp = new Date('2027-01-01T00:00:00Z');
    const row = toSheetRow(data, timestamp);
    assert.equal(row.length, SHEET_COLUMNS.length);
    assert.equal(row[SHEET_COLUMNS.indexOf('タイムスタンプ')], timestamp);
    assert.equal(row[SHEET_COLUMNS.indexOf('代表者氏名')], '\'=HYPERLINK("x")');
    assert.equal(row[SHEET_COLUMNS.indexOf('来場人数')], 3);
    assert.equal(row[SHEET_COLUMNS.indexOf('お車台数')], '');
    assert.equal(row[SHEET_COLUMNS.indexOf('確認メール送信')], '');
});

test('確認メールには予約内容と開催情報が入り，参加しないプログラムの人数と部は書かない', () => {
    const data = validateReservation(baseInput({
        当日の交通手段: '車', お車台数: '1',
        ワークショップ参加: 'はい', ワークショップ参加人数: '2', 予約する部: W1
    }), EVENT).data;
    const { subject, body } = buildConfirmationEmail(data, EVENT);
    assert.equal(subject, `${EVENT.title} 予約確認`);
    assert.match(body, /^気仙沼 太郎 様/);
    assert.ok(body.includes('・来場人数: 3名'));
    assert.ok(body.includes('・交通手段: 車 (1台)'));
    assert.ok(body.includes(`  予約部: ${W1}`));
    assert.ok(body.includes('・プラネタリウム: いいえ'));
    assert.ok(!body.includes('鑑賞人数'));
    assert.ok(body.includes(EVENT.dateText));
    assert.ok(body.includes(EVENT.contact));
});

test('受付期間が決まっていなければ受け付けない', () => {
    const result = checkAcceptance({ acceptFrom: '', acceptUntil: '' }, new Date('2027-08-01T00:00:00+09:00'));
    assert.equal(result.open, false);
    assert.equal(result.message, '現在、申込は受け付けていません。');
});

test('受付の開始前は，開始の日時（日本時間）を示して断る', () => {
    const event = { acceptFrom: '2027-08-01T10:00:00+09:00', acceptUntil: '2027-09-20T23:59:59+09:00' };
    const result = checkAcceptance(event, new Date('2027-08-01T09:59:00+09:00'));
    assert.equal(result.open, false);
    assert.equal(result.message, '申込の受付は 8月1日 10:00 からです。');
});

test('受付期間の中は受け付ける．終わりが空なら開始後はずっと受け付ける', () => {
    const event = { acceptFrom: '2027-08-01T10:00:00+09:00', acceptUntil: '2027-09-20T23:59:59+09:00' };
    assert.equal(checkAcceptance(event, new Date('2027-08-01T10:00:00+09:00')).open, true);
    assert.equal(checkAcceptance(event, new Date('2027-09-20T23:59:59+09:00')).open, true);
    assert.equal(checkAcceptance({ acceptFrom: event.acceptFrom, acceptUntil: '' }, new Date('2030-01-01T00:00:00+09:00')).open, true);
});

test('受付の終了後は断る', () => {
    const event = { acceptFrom: '2027-08-01T10:00:00+09:00', acceptUntil: '2027-09-20T23:59:59+09:00' };
    const result = checkAcceptance(event, new Date('2027-09-21T00:00:00+09:00'));
    assert.equal(result.open, false);
    assert.equal(result.message, '申込の受付は終了しました。');
});
