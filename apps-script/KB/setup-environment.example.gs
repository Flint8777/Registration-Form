/**
 * 環境変数設定用スクリプト（テンプレート）
 *
 * 使い方:
 *   1. このファイルをコピーして setup-environment.gs にリネームする（setup-environment.gs は .gitignore で除外済み）
 *   2. SPREADSHEET_ID など、各値を実環境の値に書き換える
 *   3. Apps Script エディタで setupEnvironmentVariables() を一度だけ実行する
 *   4. 以後の運用では Apps Script の「プロジェクトの設定 → スクリプト プロパティ」から直接編集してよい
 *
 * 注意: SPREADSHEET_ID や個人メールアドレスは絶対にコミットしないこと（記事「シークレットと鍵を、コードに書くな」）
 */

function setupEnvironmentVariables() {
    const properties = PropertiesService.getScriptProperties();

    // XSS入力時にブロックする危険パターン（カンマ区切り）
    // 各要素は dangerous_html / inline event handler / dynamic code execution の典型
    const blockedPatterns = [
        '<script>',
        'javascript:',
        'onload=',
        'onerror=',
        'eval' + '(',     // 文字列分割でリテラル一致を回避
        'alert' + '('
    ].join(',');

    properties.setProperties({
        // 必須: 予約データを書き込むスプレッドシートのID
        'SPREADSHEET_ID': 'YOUR_SPREADSHEET_ID_HERE',

        // フロントエンド配信元（埋め込みドメイン）
        'ALLOWED_ORIGINS': 'your-domain.example.com',
        'FRONTEND_URL': 'https://your-domain.example.com/',
        'ALLOWED_REFERRERS': 'https://your-domain.example.com,https://localhost',
        'ENABLE_REFERRER_CHECK': 'true',
        'ALLOW_DIRECT_ACCESS': 'false',

        // レート制限設定
        'ENABLE_RATE_LIMIT': 'true',
        'RATE_LIMIT_PER_HOUR': '20',
        'RATE_LIMIT_PER_DAY': '200',
        'RESERVATION_LIMIT_PER_DAY': '10',
        'RATE_LIMIT_EXCLUDE_ACTIONS': 'validateEmail',

        // 入力検証設定
        'ENABLE_INPUT_VALIDATION': 'true',
        'MAX_NAME_LENGTH': '50',
        'MAX_EMAIL_LENGTH': '100',
        'ENABLE_XSS_PROTECTION': 'true',
        'ENABLE_SQL_INJECTION_PROTECTION': 'true',
        'BLOCKED_PATTERNS': blockedPatterns,

        // メール設定
        'EMAIL_FROM_NAME': '気仙沼星空観望会実行委員会',
        'EMAIL_REPLY_TO': 'YOUR_PROJECT_CONTACT@example.com',

        // 管理者通知（個人メールが入る場合は必ずプロパティ経由で設定）
        'ADMIN_EMAIL': 'YOUR_ADMIN_EMAIL@example.com'
    });

    console.log('環境変数を設定しました。スクリプトプロパティを確認してください。');
}

function checkEnvironmentVariables() {
    const properties = PropertiesService.getScriptProperties();
    const keys = [
        'SPREADSHEET_ID', 'ALLOWED_ORIGINS', 'FRONTEND_URL', 'ALLOWED_REFERRERS',
        'ENABLE_REFERRER_CHECK', 'ALLOW_DIRECT_ACCESS',
        'ENABLE_RATE_LIMIT', 'RATE_LIMIT_PER_HOUR', 'RATE_LIMIT_PER_DAY',
        'RESERVATION_LIMIT_PER_DAY', 'RATE_LIMIT_EXCLUDE_ACTIONS',
        'ENABLE_INPUT_VALIDATION', 'MAX_NAME_LENGTH', 'MAX_EMAIL_LENGTH',
        'ENABLE_XSS_PROTECTION', 'ENABLE_SQL_INJECTION_PROTECTION', 'BLOCKED_PATTERNS',
        'EMAIL_FROM_NAME', 'EMAIL_REPLY_TO', 'ADMIN_EMAIL'
    ];
    keys.forEach(k => {
        const v = properties.getProperty(k);
        const isSecret = (k === 'SPREADSHEET_ID' || k.endsWith('EMAIL'));
        console.log(`${k}:`, v === null ? '(未設定)' : (isSecret ? '(設定済み)' : v));
    });
}

function disableReferrerCheckForTesting() {
    PropertiesService.getScriptProperties().setProperty('ENABLE_REFERRER_CHECK', 'false');
    console.log('リファラーチェックを無効化しました（テスト用）');
}

function enableReferrerCheck() {
    PropertiesService.getScriptProperties().setProperty('ENABLE_REFERRER_CHECK', 'true');
    console.log('リファラーチェックを有効化しました');
}

function allowDirectAccessForTesting() {
    PropertiesService.getScriptProperties().setProperty('ALLOW_DIRECT_ACCESS', 'true');
    console.log('直接アクセスを許可しました（テスト用）');
}

function disallowDirectAccess() {
    PropertiesService.getScriptProperties().setProperty('ALLOW_DIRECT_ACCESS', 'false');
    console.log('直接アクセスを禁止しました');
}

function disableRateLimitForTesting() {
    PropertiesService.getScriptProperties().setProperty('ENABLE_RATE_LIMIT', 'false');
    console.log('レート制限を無効化しました（テスト用）');
}

function enableRateLimit() {
    PropertiesService.getScriptProperties().setProperty('ENABLE_RATE_LIMIT', 'true');
    console.log('レート制限を有効化しました');
}

function adjustRateLimit(hourlyLimit = 10, dailyLimit = 100, reservationLimit = 1) {
    PropertiesService.getScriptProperties().setProperties({
        'RATE_LIMIT_PER_HOUR': hourlyLimit.toString(),
        'RATE_LIMIT_PER_DAY': dailyLimit.toString(),
        'RESERVATION_LIMIT_PER_DAY': reservationLimit.toString()
    });
    console.log(`レート制限を調整: 時間=${hourlyLimit}, 日=${dailyLimit}, 予約=${reservationLimit}`);
}

function disableInputValidationForTesting() {
    PropertiesService.getScriptProperties().setProperty('ENABLE_INPUT_VALIDATION', 'false');
    console.log('入力検証を無効化しました（テスト用）');
}

function enableInputValidation() {
    PropertiesService.getScriptProperties().setProperty('ENABLE_INPUT_VALIDATION', 'true');
    console.log('入力検証を有効化しました');
}

function adjustSecuritySettings(enableXSS = true, enableSQLInjection = true, maxNameLength = 50, maxEmailLength = 100) {
    PropertiesService.getScriptProperties().setProperties({
        'ENABLE_XSS_PROTECTION': enableXSS.toString(),
        'ENABLE_SQL_INJECTION_PROTECTION': enableSQLInjection.toString(),
        'MAX_NAME_LENGTH': maxNameLength.toString(),
        'MAX_EMAIL_LENGTH': maxEmailLength.toString()
    });
    console.log(`セキュリティ設定: XSS=${enableXSS}, SQLi=${enableSQLInjection}, 名前=${maxNameLength}, メール=${maxEmailLength}`);
}
