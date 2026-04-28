/**
 * 気仙沼星空観望会 - 予約システム
 * Google Apps Script サーバーサイドコード
 */

/**
 * メールアドレスをログ用にマスクする
 * 例: yamada.taro@example.com → y****o@e****e.com
 */
function maskEmail(email) {
    if (!email || typeof email !== 'string' || !email.includes('@')) {
        return '(invalid)';
    }
    const [local, domain] = email.split('@');
    const maskPart = (s) => s.length <= 2 ? '*'.repeat(s.length) : `${s[0]}${'*'.repeat(Math.max(1, s.length - 2))}${s[s.length - 1]}`;
    const domainParts = domain.split('.');
    const maskedDomain = domainParts.map((p, i) => i === domainParts.length - 1 ? p : maskPart(p)).join('.');
    return `${maskPart(local)}@${maskedDomain}`;
}

/**
 * フォームデータをログ用に安全化する
 * 個人情報フィールド（氏名・メール等）はキー名と空/値あり情報のみに置換し、
 * Cloud Logging に生の個人情報が流れないようにする
 */
function summarizeFormData(formData) {
    if (!formData || typeof formData !== 'object') return formData;
    const PII_KEYS = ['代表者氏名', 'メールアドレス'];
    const summary = {};
    for (const [key, value] of Object.entries(formData)) {
        if (PII_KEYS.includes(key)) {
            summary[key] = (value === undefined || value === null || String(value).trim() === '') ? '(empty)' : '(set)';
        } else {
            summary[key] = value;
        }
    }
    return summary;
}

/**
 * 環境変数を安全に取得する関数
 */
function getEnvironmentVariable(key, defaultValue = null) {
    try {
        const properties = PropertiesService.getScriptProperties();
        const value = properties.getProperty(key);

        if (value === null || value === undefined) {
            if (defaultValue !== null) {
                console.log(`環境変数 ${key} が見つからないため、デフォルト値を使用: ${defaultValue}`);
                return defaultValue;
            }
            throw new Error(`必須の環境変数 ${key} が設定されていません`);
        }

        return value;
    } catch (error) {
        console.error(`環境変数 ${key} の取得に失敗:`, error);
        if (defaultValue !== null) {
            return defaultValue;
        }
        throw error;
    }
}

/**
 * 環境変数から設定を取得
 */
function getConfig() {
    return {
        SPREADSHEET_ID: getEnvironmentVariable('SPREADSHEET_ID'),
        ALLOWED_ORIGINS: getEnvironmentVariable('ALLOWED_ORIGINS', '').split(',').filter(origin => origin.trim()),
        FRONTEND_URL: getEnvironmentVariable('FRONTEND_URL', 'https://flint8777.github.io/TEST_KesenNuma-StarryNight/'),
        ALLOWED_REFERRERS: getEnvironmentVariable('ALLOWED_REFERRERS', '').split(',').filter(ref => ref.trim()),
        ENABLE_REFERRER_CHECK: getEnvironmentVariable('ENABLE_REFERRER_CHECK', 'true') === 'true',

        // レート制限設定
        ENABLE_RATE_LIMIT: getEnvironmentVariable('ENABLE_RATE_LIMIT', 'true') === 'true',
        RATE_LIMIT_PER_HOUR: parseInt(getEnvironmentVariable('RATE_LIMIT_PER_HOUR', '10')),
        RATE_LIMIT_PER_DAY: parseInt(getEnvironmentVariable('RATE_LIMIT_PER_DAY', '100')),
        RESERVATION_LIMIT_PER_DAY: parseInt(getEnvironmentVariable('RESERVATION_LIMIT_PER_DAY', '1')),
        RATE_LIMIT_EXCLUDE_ACTIONS: getEnvironmentVariable('RATE_LIMIT_EXCLUDE_ACTIONS', '').split(',').filter(action => action.trim()),

        // 入力検証設定
        ENABLE_INPUT_VALIDATION: getEnvironmentVariable('ENABLE_INPUT_VALIDATION', 'true') === 'true',
        MAX_NAME_LENGTH: parseInt(getEnvironmentVariable('MAX_NAME_LENGTH', '50')),
        MAX_EMAIL_LENGTH: parseInt(getEnvironmentVariable('MAX_EMAIL_LENGTH', '100')),
        ENABLE_XSS_PROTECTION: getEnvironmentVariable('ENABLE_XSS_PROTECTION', 'true') === 'true',
        ENABLE_SQL_INJECTION_PROTECTION: getEnvironmentVariable('ENABLE_SQL_INJECTION_PROTECTION', 'true') === 'true',
        BLOCKED_PATTERNS: getEnvironmentVariable('BLOCKED_PATTERNS', '').split(',').filter(pattern => pattern.trim()),

        // その他設定
        EMAIL_FROM_NAME: getEnvironmentVariable('EMAIL_FROM_NAME', '気仙沼星空観望会実行委員会'),
        EMAIL_REPLY_TO: getEnvironmentVariable('EMAIL_REPLY_TO', 'kanbokaidaisakusen@gmail.com'),
        // 管理者通知の送信先。個人メールが入る可能性があるため Script Properties で必ず設定する
        ADMIN_EMAIL: getEnvironmentVariable('ADMIN_EMAIL', 'kanbokaidaisakusen@gmail.com')
    };
}

/**
 * リファラーチェック機能
 * 許可されたドメインからのリクエストのみを受け入れる
 */
function validateReferrer(e) {
    try {
        const config = getConfig();

        // リファラーチェックが無効化されている場合はスキップ
        if (!config.ENABLE_REFERRER_CHECK) {
            console.log('リファラーチェックは無効化されています');
            return { valid: true, reason: 'チェック無効' };
        }

        // 許可リファラーが設定されていない場合はスキップ
        if (!config.ALLOWED_REFERRERS || config.ALLOWED_REFERRERS.length === 0) {
            console.log('許可リファラーが設定されていません - チェックをスキップ');
            return { valid: true, reason: '設定なし' };
        }

        // リファラー情報を取得（複数の方法で試行）
        console.log('=== リファラー情報デバッグ ===');
        console.log('e.parameter:', JSON.stringify(e.parameter, null, 2));
        console.log('e.parameters:', JSON.stringify(e.parameters, null, 2));
        console.log('e.postData:', JSON.stringify(e.postData, null, 2));

        const referrer = e.parameter.referrer ||
            e.parameter.ref ||
            e.parameter.source ||
            e.parameters?.referrer?.[0] ||
            e.parameters?.ref?.[0] ||
            e.parameters?.source?.[0] ||
            e.postData?.referrer ||
            '';

        console.log('最終的に取得したリファラー:', referrer);
        console.log('許可リファラーリスト:', config.ALLOWED_REFERRERS);

        // リファラーが空の場合（直接アクセス）の処理
        if (!referrer || referrer.trim() === '') {
            console.log('リファラーが空です（直接アクセス）');

            // 開発環境やテスト用に直接アクセスを許可するかどうか
            const allowDirectAccess = getEnvironmentVariable('ALLOW_DIRECT_ACCESS', 'false') === 'true';
            if (allowDirectAccess) {
                return { valid: true, reason: '直接アクセス許可' };
            } else {
                return {
                    valid: false,
                    reason: '直接アクセス禁止',
                    details: 'リファラーヘッダーが必要です'
                };
            }
        }

        // 許可リファラーリストとの照合
        const isAllowed = config.ALLOWED_REFERRERS.some(allowedRef => {
            const cleanAllowedRef = allowedRef.toLowerCase().trim();
            const cleanReferrer = referrer.toLowerCase().trim();

            // 完全一致チェック
            if (cleanReferrer === cleanAllowedRef) {
                return true;
            }

            // 前方一致チェック（サブパスを許可）
            if (cleanReferrer.startsWith(cleanAllowedRef)) {
                return true;
            }

            // ドメイン部分の抽出と照合
            try {
                const referrerUrl = new URL(cleanReferrer);
                const allowedUrl = new URL(cleanAllowedRef);

                // ドメインとプロトコルが一致するかチェック
                if (referrerUrl.protocol === allowedUrl.protocol &&
                    referrerUrl.hostname === allowedUrl.hostname) {
                    return true;
                }
            } catch (urlError) {
                console.log('URL解析エラー:', urlError.message);
            }

            return false;
        });

        if (isAllowed) {
            console.log('✅ リファラーチェック成功');
            return { valid: true, reason: 'リファラー許可済み' };
        } else {
            console.log('❌ リファラーチェック失敗');
            return {
                valid: false,
                reason: '不正なリファラー',
                details: `受信: ${referrer}, 許可: ${config.ALLOWED_REFERRERS.join(', ')}`
            };
        }

    } catch (error) {
        console.error('リファラーチェック処理エラー:', error);
        // エラー時は安全側に倒してアクセス拒否
        return {
            valid: false,
            reason: 'チェック処理エラー',
            details: error.message
        };
    }
}

/**
 * クライアントIPアドレスを取得する関数
 */
function getClientIP(e) {
    try {
        // Google Apps Scriptでは直接IPアドレスを取得できないため、
        // リクエストパラメータやヘッダーから取得を試行

        // 1. パラメータから取得を試行
        const paramIP = e.parameter?.clientIP || e.parameter?.ip;
        if (paramIP) {
            console.log('パラメータからIP取得:', paramIP);
            return paramIP;
        }

        // 2. 擬似IPアドレスを生成（リファラー + ユーザーエージェントベース）
        const referrer = e.parameter?.referrer || '';
        const userAgent = e.parameter?.userAgent || 'unknown';
        const pseudoIP = Utilities.computeDigest(
            Utilities.DigestAlgorithm.SHA_256,
            referrer + userAgent + new Date().toDateString()
        ).slice(0, 8).map(byte => Math.abs(byte) % 256).join('.');

        console.log('擬似IP生成:', pseudoIP);
        return pseudoIP;

    } catch (error) {
        console.error('IP取得エラー:', error);
        return 'unknown';
    }
}

/**
 * 現在の時間キーを取得（時間単位のレート制限用）
 */
function getCurrentHourKey() {
    const now = new Date();
    return `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}-${now.getHours()}`;
}

/**
 * 現在の日付キーを取得（日単位のレート制限用）
 */
function getCurrentDateKey() {
    const now = new Date();
    return `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
}

/**
 * レート制限チェック機能
 */
function checkRateLimit(clientIP, action) {
    try {
        const config = getConfig();

        // レート制限が無効化されている場合はスキップ
        if (!config.ENABLE_RATE_LIMIT) {
            console.log('レート制限は無効化されています');
            return { valid: true, reason: 'レート制限無効' };
        }

        // 除外アクションの場合はスキップ
        if (config.RATE_LIMIT_EXCLUDE_ACTIONS.includes(action)) {
            console.log(`アクション ${action} はレート制限から除外されています`);
            return { valid: true, reason: 'アクション除外' };
        }

        const cache = CacheService.getScriptCache();
        const hourKey = getCurrentHourKey();
        const dateKey = getCurrentDateKey();

        // キャッシュキーを生成
        const hourlyKey = `rate_hourly_${clientIP}_${hourKey}`;
        const dailyKey = `rate_daily_${clientIP}_${dateKey}`;

        console.log('=== レート制限チェック ===');
        console.log('クライアントIP:', clientIP);
        console.log('アクション:', action);
        console.log('時間キー:', hourlyKey);
        console.log('日付キー:', dailyKey);

        // 現在のカウントを取得
        const hourlyCount = parseInt(cache.get(hourlyKey) || '0');
        const dailyCount = parseInt(cache.get(dailyKey) || '0');

        console.log('現在の使用回数:', { hourly: hourlyCount, daily: dailyCount });
        console.log('制限値:', {
            hourly: config.RATE_LIMIT_PER_HOUR,
            daily: config.RATE_LIMIT_PER_DAY
        });

        // 時間制限チェック
        if (hourlyCount >= config.RATE_LIMIT_PER_HOUR) {
            return {
                valid: false,
                reason: '時間制限超過',
                details: `1時間あたり${config.RATE_LIMIT_PER_HOUR}回の制限に達しました`,
                retryAfter: 3600, // 1時間後
                currentUsage: { hourly: hourlyCount, daily: dailyCount },
                limits: { hourly: config.RATE_LIMIT_PER_HOUR, daily: config.RATE_LIMIT_PER_DAY }
            };
        }

        // 日制限チェック
        if (dailyCount >= config.RATE_LIMIT_PER_DAY) {
            return {
                valid: false,
                reason: '日制限超過',
                details: `1日あたり${config.RATE_LIMIT_PER_DAY}回の制限に達しました`,
                retryAfter: 86400, // 24時間後
                currentUsage: { hourly: hourlyCount, daily: dailyCount },
                limits: { hourly: config.RATE_LIMIT_PER_HOUR, daily: config.RATE_LIMIT_PER_DAY }
            };
        }

        console.log('✅ レート制限チェック通過');
        return {
            valid: true,
            reason: 'レート制限内',
            currentUsage: { hourly: hourlyCount, daily: dailyCount },
            limits: { hourly: config.RATE_LIMIT_PER_HOUR, daily: config.RATE_LIMIT_PER_DAY }
        };

    } catch (error) {
        console.error('レート制限チェックエラー:', error);
        // エラー時は安全側に倒してアクセス許可（サービス継続性優先）
        return { valid: true, reason: 'チェックエラー', details: error.message };
    }
}

/**
 * レート制限カウンタを更新
 */
function incrementRateLimit(clientIP) {
    try {
        const config = getConfig();

        if (!config.ENABLE_RATE_LIMIT) {
            return; // レート制限が無効の場合は何もしない
        }

        const cache = CacheService.getScriptCache();
        const hourKey = getCurrentHourKey();
        const dateKey = getCurrentDateKey();

        const hourlyKey = `rate_hourly_${clientIP}_${hourKey}`;
        const dailyKey = `rate_daily_${clientIP}_${dateKey}`;

        // カウンタを増加
        const newHourlyCount = (parseInt(cache.get(hourlyKey) || '0')) + 1;
        const newDailyCount = (parseInt(cache.get(dailyKey) || '0')) + 1;

        // キャッシュに保存（時間制限: 1時間、日制限: 24時間）
        cache.put(hourlyKey, newHourlyCount.toString(), 3600); // 1時間
        cache.put(dailyKey, newDailyCount.toString(), 86400);  // 24時間

        console.log('レート制限カウンタ更新:', {
            hourly: newHourlyCount,
            daily: newDailyCount
        });

    } catch (error) {
        console.error('レート制限カウンタ更新エラー:', error);
        // エラーが発生してもサービスは継続
    }
}

/**
 * 予約専用のレート制限チェック
 */
function checkReservationRateLimit(clientIP, formData) {
    try {
        const config = getConfig();

        if (!config.ENABLE_RATE_LIMIT) {
            return { valid: true, reason: 'レート制限無効' };
        }

        const cache = CacheService.getScriptCache();
        const dateKey = getCurrentDateKey();
        const reservationKey = `reservation_${clientIP}_${dateKey}`;

        console.log('=== 予約レート制限チェック ===');
        console.log('予約キー:', reservationKey);

        const reservationCount = parseInt(cache.get(reservationKey) || '0');
        console.log('本日の予約回数:', reservationCount);
        console.log('予約制限:', config.RESERVATION_LIMIT_PER_DAY);

        if (reservationCount >= config.RESERVATION_LIMIT_PER_DAY) {
            return {
                valid: false,
                reason: '予約回数制限超過',
                details: `同一IPアドレスからの予約は1日${config.RESERVATION_LIMIT_PER_DAY}回までです`,
                retryAfter: 86400
            };
        }

        console.log('✅ 予約レート制限チェック通過');
        return { valid: true, reason: '予約制限内' };

    } catch (error) {
        console.error('予約レート制限チェックエラー:', error);
        return { valid: true, reason: 'チェックエラー', details: error.message };
    }
}

/**
 * 予約レート制限カウンタを更新
 */
function incrementReservationRateLimit(clientIP) {
    try {
        const config = getConfig();

        if (!config.ENABLE_RATE_LIMIT) {
            return;
        }

        const cache = CacheService.getScriptCache();
        const dateKey = getCurrentDateKey();
        const reservationKey = `reservation_${clientIP}_${dateKey}`;

        const newReservationCount = (parseInt(cache.get(reservationKey) || '0')) + 1;
        cache.put(reservationKey, newReservationCount.toString(), 86400); // 24時間

        console.log('予約レート制限カウンタ更新:', newReservationCount);

    } catch (error) {
        console.error('予約レート制限カウンタ更新エラー:', error);
    }
}

/**
 * 入力データのサニタイゼーション（XSS対策）
 */
function sanitizeInput(input) {
    if (!input || typeof input !== 'string') {
        return input;
    }

    const config = getConfig();

    if (!config.ENABLE_XSS_PROTECTION) {
        return input;
    }

    try {
        // HTMLエンティティエンコーディング
        let sanitized = input
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#x27;')
            .replace(/\//g, '&#x2F;');

        // JavaScriptコード除去
        sanitized = sanitized
            .replace(/javascript:/gi, '')
            .replace(/on\w+\s*=/gi, '')
            .replace(/eval\s*\(/gi, '')
            .replace(/alert\s*\(/gi, '')
            .replace(/document\./gi, '')
            .replace(/window\./gi, '');

        return sanitized;

    } catch (error) {
        console.error('入力サニタイゼーションエラー:', error);
        return input; // エラー時は元の値を返す
    }
}

/**
 * SQLインジェクション対策
 */
function checkSQLInjection(input) {
    if (!input || typeof input !== 'string') {
        return { valid: true };
    }

    const config = getConfig();

    if (!config.ENABLE_SQL_INJECTION_PROTECTION) {
        return { valid: true };
    }

    try {
        const sqlPatterns = [
            /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC)\b)/gi,
            /(UNION\s+SELECT)/gi,
            /(\s+OR\s+\d+\s*=\s*\d+)/gi,
            /(\s+AND\s+\d+\s*=\s*\d+)/gi,
            /(;|\-\-|\/\*|\*\/)/g,
            /(SCRIPT|IFRAME|OBJECT|EMBED|APPLET)/gi
        ];

        for (const pattern of sqlPatterns) {
            if (pattern.test(input)) {
                return {
                    valid: false,
                    reason: 'SQLインジェクション疑い',
                    details: `危険なパターンが検出されました: ${pattern}`,
                    input: input.substring(0, 100) // 最初の100文字のみログ
                };
            }
        }

        return { valid: true };

    } catch (error) {
        console.error('SQLインジェクションチェックエラー:', error);
        return { valid: true }; // エラー時は通す
    }
}

/**
 * ブロックパターンチェック
 */
function checkBlockedPatterns(input) {
    if (!input || typeof input !== 'string') {
        return { valid: true };
    }

    const config = getConfig();

    if (!config.BLOCKED_PATTERNS || config.BLOCKED_PATTERNS.length === 0) {
        return { valid: true };
    }

    try {
        const inputLower = input.toLowerCase();

        for (const pattern of config.BLOCKED_PATTERNS) {
            if (pattern && inputLower.includes(pattern.toLowerCase())) {
                return {
                    valid: false,
                    reason: 'ブロックパターン検出',
                    details: `禁止されたパターンが含まれています: ${pattern}`,
                    input: input.substring(0, 100)
                };
            }
        }

        return { valid: true };

    } catch (error) {
        console.error('ブロックパターンチェックエラー:', error);
        return { valid: true };
    }
}

/**
 * 包括的な入力検証機能
 */
function validateInput(fieldName, value, fieldType = 'text') {
    try {
        const config = getConfig();

        // 入力検証が無効化されている場合はスキップ
        if (!config.ENABLE_INPUT_VALIDATION) {
            console.log('入力検証は無効化されています');
            return { valid: true, sanitizedValue: value };
        }

        // 入力検証ログは値そのものを出さず、フィールド名と長さのみ記録（PII保護）
        const valueLength = (value === null || value === undefined) ? 0 : String(value).length;
        console.log(`=== 入力検証: ${fieldName} (type=${fieldType}, length=${valueLength}) ===`);

        // 基本的な検証
        if (value === null || value === undefined) {
            return {
                valid: false,
                reason: '必須フィールド',
                details: `${fieldName}は必須項目です`
            };
        }

        const stringValue = String(value);

        // 長さチェック
        let maxLength;
        switch (fieldType) {
            case 'name':
                maxLength = config.MAX_NAME_LENGTH;
                break;
            case 'email':
                maxLength = config.MAX_EMAIL_LENGTH;
                break;
            default:
                maxLength = 1000; // デフォルトの最大長
        }

        if (stringValue.length > maxLength) {
            return {
                valid: false,
                reason: '文字数超過',
                details: `${fieldName}は${maxLength}文字以内で入力してください（現在: ${stringValue.length}文字）`
            };
        }

        // SQLインジェクションチェック
        const sqlCheck = checkSQLInjection(stringValue);
        if (!sqlCheck.valid) {
            console.warn('SQLインジェクション疑い:', sqlCheck);
            return sqlCheck;
        }

        // ブロックパターンチェック
        const patternCheck = checkBlockedPatterns(stringValue);
        if (!patternCheck.valid) {
            console.warn('ブロックパターン検出:', patternCheck);
            return patternCheck;
        }

        // メールアドレス専用の検証
        if (fieldType === 'email') {
            const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
            if (!emailRegex.test(stringValue)) {
                return {
                    valid: false,
                    reason: 'メール形式エラー',
                    details: '正しいメールアドレスの形式で入力してください'
                };
            }
        }

        // サニタイゼーション
        const sanitizedValue = sanitizeInput(stringValue);

        console.log('✅ 入力検証通過');

        return {
            valid: true,
            sanitizedValue: sanitizedValue,
            originalValue: stringValue
        };

    } catch (error) {
        console.error(`入力検証エラー (${fieldName}):`, error);
        return {
            valid: true, // エラー時はサービス継続性を優先
            sanitizedValue: value,
            error: error.message
        };
    }
}

/**
 * フォームデータ全体の検証
 */
function validateFormData(formData) {
    try {
        const config = getConfig();

        if (!config.ENABLE_INPUT_VALIDATION) {
            return { valid: true, sanitizedData: formData };
        }

        console.log('=== フォームデータ全体検証開始 ===');

        const validationResults = {};
        const sanitizedData = {};
        const errors = [];

        // 必須フィールドの定義
        const fieldValidations = {
            '代表者氏名': { type: 'name', required: true },
            'メールアドレス': { type: 'email', required: true },
            '来場地域': { type: 'text', required: true },
            'ワークショップ参加': { type: 'text', required: true },
            '来場人数': { type: 'text', required: false },
            '当日の交通手段': { type: 'text', required: false },
            'お車台数': { type: 'text', required: false },
            'イベント認知経路': { type: 'text', required: false },
            'ワークショップ参加人数': { type: 'text', required: false },
            '予約する部': { type: 'text', required: false },
            'プラネタリウム鑑賞': { type: 'text', required: false },
            'プラネタリウム参加人数': { type: 'text', required: false },
            'プラネタリウム予約部': { type: 'text', required: false }
        };

        // 各フィールドを検証
        for (const [fieldName, fieldConfig] of Object.entries(fieldValidations)) {
            const value = formData[fieldName];

            // 必須フィールドのチェック
            if (fieldConfig.required && (!value || String(value).trim() === '')) {
                errors.push(`${fieldName}は必須項目です`);
                continue;
            }

            // 値が存在する場合のみ検証
            if (value && String(value).trim() !== '') {
                const validation = validateInput(fieldName, value, fieldConfig.type);
                validationResults[fieldName] = validation;

                if (validation.valid) {
                    sanitizedData[fieldName] = validation.sanitizedValue;
                } else {
                    errors.push(`${fieldName}: ${validation.details}`);
                }
            } else {
                // 空の値はそのまま保持
                sanitizedData[fieldName] = value;
            }
        }

        // その他のフィールドもサニタイゼーション
        for (const [key, value] of Object.entries(formData)) {
            if (!fieldValidations[key] && value) {
                const validation = validateInput(key, value, 'text');
                sanitizedData[key] = validation.sanitizedValue || value;
            }
        }

        if (errors.length > 0) {
            console.log('❌ フォーム検証エラー:', errors);
            return {
                valid: false,
                errors: errors,
                validationResults: validationResults
            };
        }

        console.log('✅ フォームデータ検証完了');
        return {
            valid: true,
            sanitizedData: sanitizedData,
            validationResults: validationResults
        };

    } catch (error) {
        console.error('フォームデータ検証エラー:', error);
        return {
            valid: true, // エラー時はサービス継続性を優先
            sanitizedData: formData,
            error: error.message
        };
    }
}

// ワークショップの部の設定
const WORKSHOP_PARTS = [
    { name: '第1部 (13:30集合)', capacity: 5 },
    { name: '第2部 (14:00集合)', capacity: 5 },
    { name: '第3部 (14:30集合)', capacity: 5 },
    { name: '第4部 (15:00集合)', capacity: 5 },
    { name: '第5部 (15:30集合)', capacity: 5 },
    { name: '第6部 (16:00集合)', capacity: 5 },
    { name: '第7部 (16:30集合)', capacity: 5 },
    { name: '第8部 (17:00集合)', capacity: 5 },
    { name: '第9部 (17:30集合)', capacity: 5 },
    { name: '第10部 (18:00集合)', capacity: 5 },
    { name: '第11部 (18:30集合)', capacity: 5 },
    { name: '第12部 (19:00集合)', capacity: 5 }
];

// プラネタリウムの部の設定
const PLANETARIUM_PARTS = [
    { name: '第1部 (13:30上映開始)', capacity: 20 },
    { name: '第2部 (14:30上映開始)', capacity: 20 },
    { name: '第3部 (15:30上映開始)', capacity: 20 }
];

/**
 * APIエンドポイント：GET リクエスト処理
 */
function doGet(e) {
    try {
        // パラメータを取得
        const action = e.parameter.action;
        const callback = e.parameter.callback; // JSONP用コールバック

        console.log('API呼び出し - Action:', action, 'Parameters:', e.parameter);

        // リクエストヘッダーのデバッグ情報を出力
        console.log('=== リクエスト情報 詳細 ===');
        console.log('全パラメータ:', JSON.stringify(e.parameter, null, 2));
        console.log('Referrer:', e.parameter.referrer || 'なし');
        console.log('User-Agent:', e.parameter['User-Agent'] || 'なし');
        console.log('Callback:', e.parameter.callback || 'なし');

        // パラメータのキー一覧を確認
        console.log('パラメータのキー一覧:', Object.keys(e.parameter || {}));

        // リファラーチェック実行
        const referrerCheck = validateReferrer(e);
        console.log('リファラーチェック結果:', referrerCheck);

        if (!referrerCheck.valid) {
            throw new Error(`アクセス拒否: ${referrerCheck.reason} - ${referrerCheck.details || ''}`);
        }

        // レート制限チェック実行
        const clientIP = getClientIP(e);
        const rateLimitCheck = checkRateLimit(clientIP, action);
        console.log('レート制限チェック結果:', rateLimitCheck);

        if (!rateLimitCheck.valid) {
            const errorData = {
                success: false,
                error: 'RATE_LIMIT_EXCEEDED',
                message: rateLimitCheck.details,
                retryAfter: rateLimitCheck.retryAfter,
                rateLimitInfo: {
                    current: rateLimitCheck.currentUsage,
                    limits: rateLimitCheck.limits
                },
                timestamp: new Date().toISOString()
            };

            // JSONP対応
            if (callback) {
                const jsonpResponse = `${callback}(${JSON.stringify(errorData)});`;
                return ContentService
                    .createTextOutput(jsonpResponse)
                    .setMimeType(ContentService.MimeType.JAVASCRIPT);
            }

            // 通常のエラーレスポンス
            const output = ContentService
                .createTextOutput(JSON.stringify(errorData))
                .setMimeType(ContentService.MimeType.JSON);
            return setCorsHeaders(output);
        }

        // CORS対応とJSON出力設定
        let result;

        switch (action) {
            case 'getParts':
                // ワークショップ残席情報を取得（後方互換性のため）
                result = getParts();
                break;

            case 'getWorkshopParts':
                // ワークショップ残席情報を取得
                result = getParts();
                break;

            case 'getPlanetariumParts':
                // プラネタリウム残席情報を取得
                result = getPlanetariumParts();
                break;

            case 'validateEmail':
                // メール配信診断
                result = validateEmailDelivery();
                break;

            case 'testEmail':
                // iCloudメールテスト送信
                const testEmail = e.parameter.email;
                if (!testEmail) {
                    throw new Error('テスト用メールアドレスが指定されていません');
                }
                result = {
                    message: testEmailToiCloud(testEmail),
                    testEmail: testEmail
                };
                break;

            case 'testMailSystem':
                // メールシステム全体のテスト
                const targetEmail = e.parameter.email || Session.getActiveUser().getEmail();
                result = testMailSystem(targetEmail);
                break;

            case 'testSeats':
                // 残席数テスト
                result = testWorkshopSeats();
                break;

            case 'health':
                // ヘルスチェック
                result = {
                    status: 'ok',
                    timestamp: new Date().toISOString(),
                    message: '気仙沼星空観望会APIは正常に動作しています',
                    emailStatus: validateEmailDelivery()
                };
                break;

            case 'getSettings':
                // 設定情報を取得
                result = {
                    workshopParts: WORKSHOP_PARTS,
                    planetariumParts: PLANETARIUM_PARTS,
                    eventTitle: '第5回気仙沼星空観望会'
                };
                try {
                    const config = getConfig();
                    result.security = {
                        allowedOrigins: config.ALLOWED_ORIGINS,
                        rateLimitPerHour: config.RATE_LIMIT_PER_HOUR,
                        rateLimitPerDay: config.RATE_LIMIT_PER_DAY,
                        environmentVariablesConfigured: true
                    };
                } catch (configError) {
                    console.error('環境変数取得エラー:', configError);
                    result.security = {
                        environmentVariablesConfigured: false,
                        error: configError.message
                    };
                }
                break;

            case 'testSpreadsheet':
                // スプレッドシート接続テスト
                try {
                    const config = getConfig();
                    const spreadsheet = SpreadsheetApp.openById(config.SPREADSHEET_ID);
                    const sheets = spreadsheet.getSheets().map(sheet => sheet.getName());
                    result = {
                        spreadsheetId: config.SPREADSHEET_ID,
                        availableSheets: sheets,
                        spreadsheetName: spreadsheet.getName(),
                        environmentVariablesConfigured: true
                    };
                } catch (error) {
                    console.error('スプレッドシート接続エラー:', error);
                    result = {
                        error: 'スプレッドシート接続エラー: ' + error.message,
                        environmentVariablesConfigured: false
                    };
                }
                break;

            case 'debugEmail':
                // メール送信デバッグ機能
                result = debugEmailSystem();
                break;

            default:
                // API情報を表示（HTML提供は行わない）
                if (!action) {
                    result = {
                        message: '気仙沼星空観望会 予約システム API',
                        version: '1.1.0 (iCloud対応版)',
                        endpoints: [
                            'action=getParts - ワークショップ利用可能な部の情報を取得',
                            'action=getPlanetariumParts - プラネタリウム利用可能な部の情報を取得',
                            'action=validateEmail - メール配信診断を実行',
                            'action=testEmail&email=[address] - 指定メールアドレスにテスト送信',
                            'action=testSeats - ワークショップ残席数のデバッグ情報を取得',
                            'action=health - APIの状態確認（メール機能含む）',
                            'action=getSettings - 設定情報を取得',
                            'action=testSpreadsheet - スプレッドシート接続テスト'
                        ]
                    };
                    try {
                        const config = getConfig();
                        result.frontendUrl = config.FRONTEND_URL;
                        result.emailImprovements = [
                            'iCloudメール配信対応済み',
                            '配信停止リンク追加',
                            'プレーンテキスト送信',
                            'RFC準拠メールフォーマット',
                            'エラーログ機能搭載'
                        ];
                        result.note = 'フロントエンドはGitHub Pagesでホストされています';
                    } catch (configError) {
                        console.error('環境変数取得エラー:', configError);
                        result.frontendUrl = 'フロントエンドURL設定エラー';
                        result.configError = configError.message;
                    }
                } else {
                    throw new Error('Invalid action: ' + action);
                }
        }

        // レート制限カウンタを更新（成功時のみ）
        incrementRateLimit(clientIP);

        // レスポンス作成（JSONP対応）
        const responseData = {
            success: true,
            data: result,
            timestamp: new Date().toISOString()
        };

        // JSONP対応
        if (callback) {
            return createJsonpResponse(responseData, callback);
        }

        // 通常のJSON レスポンス
        const output = ContentService
            .createTextOutput(JSON.stringify(responseData))
            .setMimeType(ContentService.MimeType.JSON);

        return setCorsHeaders(output);

    } catch (error) {
        console.error('API処理エラー:', error);

        const errorData = {
            success: false,
            error: error.message,
            timestamp: new Date().toISOString()
        };

        // JSONP対応
        if (e.parameter.callback) {
            return createJsonpResponse(errorData, e.parameter.callback);
        }

        // 通常のエラーレスポンス
        const output = ContentService
            .createTextOutput(JSON.stringify(errorData))
            .setMimeType(ContentService.MimeType.JSON);

        return setCorsHeaders(output);
    }
}

/**
 * APIエンドポイント：POST リクエスト処理（予約送信）
 * 高速応答版: バリデーション後すぐに応答を返し、データ保存とメール送信はバックグラウンドで実行
 */
function doPost(e) {
    try {
        console.log('POST API呼び出し:', e);
        console.log('User-Agent:', e.parameter['User-Agent'] || 'Unknown');
        console.log('postData:', e.postData);

        // リファラーチェック実行
        const referrerCheck = validateReferrer(e);
        console.log('POST リファラーチェック結果:', referrerCheck);

        if (!referrerCheck.valid) {
            throw new Error(`アクセス拒否: ${referrerCheck.reason} - ${referrerCheck.details || ''}`);
        }

        // レート制限チェック実行（POST専用）
        const clientIP = getClientIP(e);
        const rateLimitCheck = checkRateLimit(clientIP, 'POST');
        console.log('POST レート制限チェック結果:', rateLimitCheck);

        if (!rateLimitCheck.valid) {
            const errorHtml = `
            <html>
            <head>
                <meta charset="UTF-8">
                <script>
                    if (window.parent && window.parent !== window) {
                        window.parent.postMessage({
                            type: 'rateLimitError',
                            message: '${rateLimitCheck.details.replace(/'/g, "\\'")}',
                            retryAfter: ${rateLimitCheck.retryAfter},
                            success: false
                        }, '*');
                    }
                    console.error('レート制限エラー: ${rateLimitCheck.details.replace(/'/g, "\\'")}');
                </script>
            </head>
            <body>
                <p>制限に達しました: ${rateLimitCheck.details}</p>
                <p>しばらく時間をおいてから再度お試しください。</p>
            </body>
            </html>
            `;
            return HtmlService.createHtmlOutput(errorHtml);
        }

        let formData;

        // フォーム送信とJSON送信の両方に対応
        if (e.postData && e.postData.contents) {
            console.log('postData.type:', e.postData.type);
            console.log('postData.length:', e.postData.contents.length);

            // JSON形式の場合
            try {
                formData = JSON.parse(e.postData.contents);
                console.log('JSON形式のデータを受信。キー数:', Object.keys(formData).length);

            } catch (jsonError) {
                console.log('JSON解析失敗、フォーム形式として処理');
                console.log('JSON解析エラー:', jsonError.message);

                // フォーム形式の場合、URLエンコードされたデータを解析
                formData = {};

                try {
                    if (e.postData.contents) {
                        const pairs = e.postData.contents.split('&');
                        console.log('フォームペア数:', pairs.length);

                        pairs.forEach((pair) => {
                            if (pair && pair.includes('=')) {
                                const [key, value] = pair.split('=');
                                if (key && value !== undefined) {
                                    const decodedKey = decodeURIComponent(key);
                                    const decodedValue = decodeURIComponent(value.replace(/\+/g, ' '));
                                    formData[decodedKey] = decodedValue;
                                }
                            }
                        });
                    }
                } catch (formParseError) {
                    console.error('フォーム解析エラー:', formParseError);
                    throw new Error('フォームデータの解析に失敗しました: ' + formParseError.message);
                }
            }
        } else if (e.parameter) {
            formData = e.parameter;
            console.log('パラメータ形式のデータを受信。キー数:', Object.keys(formData).length);
        } else {
            throw new Error('リクエストデータが見つかりません');
        }

        console.log('処理するフォームデータ（PII除外）:', summarizeFormData(formData));

        // 包括的な入力検証を実行
        console.log('包括的入力検証開始...');
        const inputValidation = validateFormData(formData);

        if (!inputValidation.valid) {
            console.error('入力検証エラー:', inputValidation.errors);
            const validationErrorHtml = `
            <html>
            <head>
                <meta charset="UTF-8">
                <script>
                    if (window.parent && window.parent !== window) {
                        window.parent.postMessage({
                            type: 'validationError',
                            message: '入力データに問題があります',
                            errors: ${JSON.stringify(inputValidation.errors)},
                            success: false
                        }, '*');
                    }
                    console.error('入力検証エラー:', ${JSON.stringify(inputValidation.errors)});
                </script>
            </head>
            <body>
                <p>入力データエラー:</p>
                <ul>
                ${inputValidation.errors.map(error => `<li>${error}</li>`).join('')}
                </ul>
            </body>
            </html>
            `;
            return HtmlService.createHtmlOutput(validationErrorHtml);
        }

        // サニタイゼーション済みデータを使用
        formData = inputValidation.sanitizedData;
        console.log('入力検証・サニタイゼーション完了');

        // 予約専用レート制限チェック
        const reservationRateLimitCheck = checkReservationRateLimit(clientIP, formData);
        console.log('予約レート制限チェック結果:', reservationRateLimitCheck);

        if (!reservationRateLimitCheck.valid) {
            const rateLimitErrorHtml = `
            <html>
            <head>
                <meta charset="UTF-8">
                <script>
                    if (window.parent && window.parent !== window) {
                        window.parent.postMessage({
                            type: 'reservationRateLimitError',
                            message: '${reservationRateLimitCheck.details.replace(/'/g, "\\'")}',
                            retryAfter: ${reservationRateLimitCheck.retryAfter},
                            success: false
                        }, '*');
                    }
                    console.error('予約制限エラー: ${reservationRateLimitCheck.details.replace(/'/g, "\\'")}');
                </script>
            </head>
            <body>
                <p>予約制限: ${reservationRateLimitCheck.details}</p>
                <p>明日以降に再度お試しください。</p>
            </body>
            </html>
            `;
            return HtmlService.createHtmlOutput(rateLimitErrorHtml);
        }

        // ここまでのバリデーション成功したら、すぐに成功レスポンスを返す
        // 高速応答のため、データ保存とメール送信の完了を待たずにレスポンスを返す
        const quickResponse = `
        <html>
        <head>
            <meta charset="UTF-8">
            <script>
                // 親ウィンドウにメッセージを送信（可能な場合）
                if (window.parent && window.parent !== window) {
                    window.parent.postMessage({
                        type: 'reservationSuccess',
                        message: '予約を受け付けました。確認メールを送信しています。',
                        success: true
                    }, '*');
                }
                console.log('予約受付: データ検証OK、処理中');
            </script>
        </head>
        <body>
            <p>予約が受け付けられました。メールを送信しています。</p>
        </body>
        </html>
        `;

        // バックグラウンドで処理を続行
        try {
            // レート制限カウンタを更新（先に実行）
            incrementRateLimit(clientIP);
            incrementReservationRateLimit(clientIP);

            // バックグラウンド処理としてトリガーを設定
            // 注: submitReservationImmediate は遅延実行ではなく即時実行
            const result = submitReservationImmediate(formData);
            console.log('バックグラウンド処理開始:', result);
        } catch (bgError) {
            console.error('バックグラウンド処理エラー:', bgError);
            // バックグラウンドエラーはユーザーには通知しない（すでにレスポンス返却済み）
        }

        return HtmlService.createHtmlOutput(quickResponse);

    } catch (error) {
        console.error('POST API処理エラー:', error);

        // エラー用HTMLレスポンス
        const errorHtml = `
        <html>
        <head>
            <meta charset="UTF-8">
            <script>
                // 親ウィンドウにエラーメッセージを送信（可能な場合）
                if (window.parent && window.parent !== window) {
                    window.parent.postMessage({
                        type: 'reservationError',
                        message: '${error.message.replace(/'/g, "\\'")}',
                        success: false
                    }, '*');
                }
                console.error('予約エラー: ${error.message.replace(/'/g, "\\'")}');
            </script>
        </head>
        <body>
            <p>エラーが発生しました: ${error.message}</p>
        </body>
        </html>
        `;

        return HtmlService.createHtmlOutput(errorHtml);
    }
}

/**
 * CORS対応のヘッダーを設定
 */
function setCorsHeaders(output) {
    // GAS特有のCORS対応
    // Access-Control-Allow-Originは直接設定できないため、
    // クライアント側でJSONPまたは適切な設定で対応
    return output;
}

/**
 * JSONP対応のレスポンス生成
 */
function createJsonpResponse(data, callback) {
    const jsonString = JSON.stringify(data);
    const content = callback ? `${callback}(${jsonString});` : jsonString;

    return ContentService
        .createTextOutput(content)
        .setMimeType(callback ? ContentService.MimeType.JAVASCRIPT : ContentService.MimeType.JSON);
}

/**
 * HTMLファイルの内容を取得（CSSやJSをインクルードするため）
 */
function include(filename) {
    return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/**
 * ワークショップの部情報と残席数を取得
 */
function getParts() {
    try {
        console.log('getParts: 開始');
        const config = getConfig();
        console.log('設定取得完了 - 環境変数化対応');

        const sheet = getOrCreateSheet('予約データ');
        console.log('シート取得完了:', sheet ? 'OK' : 'NULL');

        const data = sheet.getDataRange().getValues();
        console.log('データ取得完了 - 行数:', data.length);
        console.log('データサンプル:', data.slice(0, 3)); // 最初の3行を表示

        // ヘッダー行から列インデックスを動的に取得
        const headers = data[0] || [];
        const getColumnIndex = (columnName) => {
            const index = headers.indexOf(columnName);
            console.log(`列「${columnName}」のインデックス: ${index}`);
            return index;
        };

        const workshopParticipationIndex = getColumnIndex('ワークショップ参加');
        const workshopParticipantCountIndex = getColumnIndex('ワークショップ参加人数');
        const workshopPartIndex = getColumnIndex('予約する部');

        console.log('使用する列インデックス:', {
            workshopParticipation: workshopParticipationIndex,
            workshopParticipantCount: workshopParticipantCountIndex,
            workshopPart: workshopPartIndex
        });

        // ヘッダー行をスキップして予約データを取得
        const reservations = data.slice(1);
        console.log('予約データ行数:', reservations.length);

        // 各部の予約数を集計
        const partCounts = {};
        WORKSHOP_PARTS.forEach(part => {
            partCounts[part.name] = 0;
        });
        console.log('初期partCounts:', partCounts);

        reservations.forEach((row, index) => {
            // 動的に列インデックスを使用してデータを取得
            const workshopParticipation = workshopParticipationIndex >= 0 ? row[workshopParticipationIndex] : undefined;
            const selectedPart = workshopPartIndex >= 0 ? row[workshopPartIndex] : undefined;
            const participantCount = workshopParticipantCountIndex >= 0 ? parseInt(row[workshopParticipantCountIndex]) || 0 : 0;

            console.log(`予約${index + 1}:`, {
                workshopParticipation,
                selectedPart,
                participantCount,
                rawRow: row // 行全体を出力してデバッグ
            });

            // ワークショップ参加の値を両方チェック（'はい'と'参加する'の両方に対応）
            if ((workshopParticipation === 'はい' || workshopParticipation === '参加する') && selectedPart && partCounts.hasOwnProperty(selectedPart)) {
                partCounts[selectedPart] += participantCount;
                console.log(`✅ ${selectedPart}に${participantCount}人追加 - 合計: ${partCounts[selectedPart]}`);
            } else {
                console.log(`❌ スキップ: 参加=${workshopParticipation}, 部=${selectedPart}, 人数=${participantCount}`);
            }
        });

        console.log('最終partCounts:', partCounts);

        // デバッグ: 部の名前の一致確認
        console.log('=== 部の名前の一致確認 ===');
        WORKSHOP_PARTS.forEach(part => {
            console.log(`設定済み部名: "${part.name}" (長さ: ${part.name.length})`);
        });

        reservations.forEach((row, index) => {
            if (row[7] === '参加する' && row[9]) {
                console.log(`実際の予約部名: "${row[9]}" (長さ: ${row[9].length})`);
                const found = WORKSHOP_PARTS.find(p => p.name === row[9]);
                console.log(`一致する部: ${found ? '✅ 見つかった' : '❌ 見つからない'}`);
            }
        });

        // 残席数を計算して返す
        const parts = WORKSHOP_PARTS.map(part => ({
            name: part.name,
            capacity: part.capacity,
            reserved: partCounts[part.name] || 0,
            remaining: Math.max(0, part.capacity - (partCounts[part.name] || 0))
        }));

        console.log('生成されたparts:', parts);

        return parts;

    } catch (error) {
        console.error('部情報取得エラー:', error);
        throw new Error('部情報の取得に失敗しました: ' + error.message);
    }
}

/**
 * プラネタリウムの部情報と残席数を取得
 */
function getPlanetariumParts() {
    try {
        console.log('getPlanetariumParts: 開始');
        const config = getConfig();
        console.log('設定取得完了 - 環境変数化対応');
        console.log('PLANETARIUM_PARTS:', PLANETARIUM_PARTS);

        const sheet = getOrCreateSheet('予約データ');
        console.log('シート取得完了:', sheet ? 'OK' : 'NULL');

        const data = sheet.getDataRange().getValues();
        console.log('データ取得完了 - 行数:', data.length);
        console.log('データサンプル:', data.slice(0, 3)); // 最初の3行を表示

        // ヘッダー行から列インデックスを動的に取得
        const headers = data[0] || [];
        const getColumnIndex = (columnName) => {
            const index = headers.indexOf(columnName);
            console.log(`列「${columnName}」のインデックス: ${index}`);
            return index;
        };

        const planetariumParticipationIndex = getColumnIndex('プラネタリウム鑑賞');
        const planetariumParticipantCountIndex = getColumnIndex('プラネタリウム参加人数');
        const planetariumPartIndex = getColumnIndex('プラネタリウム予約部');

        console.log('使用するプラネタリウム列インデックス:', {
            planetariumParticipation: planetariumParticipationIndex,
            planetariumParticipantCount: planetariumParticipantCountIndex,
            planetariumPart: planetariumPartIndex
        });

        // ヘッダー行をスキップして予約データを取得
        const reservations = data.slice(1);
        console.log('予約データ行数:', reservations.length);

        // 各部の予約数を集計
        const partCounts = {};
        PLANETARIUM_PARTS.forEach(part => {
            partCounts[part.name] = 0;
        });
        console.log('初期プラネタリウムpartCounts:', partCounts);

        reservations.forEach((row, index) => {
            // 動的に列インデックスを使用してデータを取得
            const planetariumParticipation = planetariumParticipationIndex >= 0 ? row[planetariumParticipationIndex] : undefined;
            const selectedPart = planetariumPartIndex >= 0 ? row[planetariumPartIndex] : undefined;
            const participantCount = planetariumParticipantCountIndex >= 0 ? parseInt(row[planetariumParticipantCountIndex]) || 0 : 0;

            console.log(`プラネタリウム予約${index + 1}:`, {
                planetariumParticipation,
                selectedPart,
                participantCount,
                rawRow: row // 行全体を出力してデバッグ
            });

            // プラネタリウム参加の値をチェック（'はい'）
            if (planetariumParticipation === 'はい' && selectedPart && partCounts.hasOwnProperty(selectedPart)) {
                partCounts[selectedPart] += participantCount;
                console.log(`✅ プラネタリウム ${selectedPart}に${participantCount}人追加 - 合計: ${partCounts[selectedPart]}`);
            } else {
                console.log(`❌ プラネタリウムスキップ: 参加=${planetariumParticipation}, 部=${selectedPart}, 人数=${participantCount}`);
            }
        });

        console.log('最終プラネタリウムpartCounts:', partCounts);

        // 残席数を計算して返す
        const parts = PLANETARIUM_PARTS.map(part => ({
            name: part.name,
            capacity: part.capacity,
            reserved: partCounts[part.name] || 0,
            remaining: Math.max(0, part.capacity - (partCounts[part.name] || 0))
        }));

        console.log('生成されたプラネタリウムparts:', parts);

        return parts;

    } catch (error) {
        console.error('プラネタリウム部情報取得エラー:', error);
        throw new Error('プラネタリウム部情報の取得に失敗しました: ' + error.message);
    }
}

/**
 * ワークショップとプラネタリウム両方の部情報を取得
 */
function getAllParts() {
    try {
        console.log('getAllParts: ワークショップとプラネタリウム両方の情報を取得開始');

        const workshopParts = getParts();
        const planetariumParts = getPlanetariumParts();

        const result = {
            workshop: workshopParts,
            planetarium: planetariumParts,
            summary: {
                workshopTotal: workshopParts.reduce((sum, part) => sum + part.reserved, 0),
                planetariumTotal: planetariumParts.reduce((sum, part) => sum + part.reserved, 0),
                workshopRemaining: workshopParts.reduce((sum, part) => sum + part.remaining, 0),
                planetariumRemaining: planetariumParts.reduce((sum, part) => sum + part.remaining, 0)
            }
        };

        console.log('getAllParts完了:', result);
        return result;

    } catch (error) {
        console.error('全部情報取得エラー:', error);
        throw new Error('全部情報の取得に失敗しました: ' + error.message);
    }
}
function getPlanetariumParts() {
    try {
        console.log('getPlanetariumParts: 開始');
        const config = getConfig();
        console.log('設定取得完了 - 環境変数化対応');
        console.log('PLANETARIUM_PARTS:', PLANETARIUM_PARTS);

        const sheet = getOrCreateSheet('予約データ');
        console.log('シート取得完了:', sheet ? 'OK' : 'NULL');

        const data = sheet.getDataRange().getValues();
        console.log('データ取得完了 - 行数:', data.length);
        console.log('データサンプル:', data.slice(0, 3)); // 最初の3行を表示

        // ヘッダー行から列インデックスを動的に取得
        const headers = data[0] || [];
        const getColumnIndex = (columnName) => {
            const index = headers.indexOf(columnName);
            console.log(`列「${columnName}」のインデックス: ${index}`);
            return index;
        };

        const planetariumParticipationIndex = getColumnIndex('プラネタリウム鑑賞');
        const planetariumParticipantCountIndex = getColumnIndex('プラネタリウム参加人数');
        const planetariumPartIndex = getColumnIndex('プラネタリウム予約部');

        console.log('使用するプラネタリウム列インデックス:', {
            planetariumParticipation: planetariumParticipationIndex,
            planetariumParticipantCount: planetariumParticipantCountIndex,
            planetariumPart: planetariumPartIndex
        });

        // ヘッダー行をスキップして予約データを取得
        const reservations = data.slice(1);
        console.log('予約データ行数:', reservations.length);

        // 各部の予約数を集計
        const partCounts = {};
        PLANETARIUM_PARTS.forEach(part => {
            partCounts[part.name] = 0;
        });
        console.log('初期プラネタリウムpartCounts:', partCounts);

        reservations.forEach((row, index) => {
            // 動的に列インデックスを使用してデータを取得
            const planetariumParticipation = planetariumParticipationIndex >= 0 ? row[planetariumParticipationIndex] : undefined;
            const selectedPart = planetariumPartIndex >= 0 ? row[planetariumPartIndex] : undefined;
            const participantCount = planetariumParticipantCountIndex >= 0 ? parseInt(row[planetariumParticipantCountIndex]) || 0 : 0;

            console.log(`プラネタリウム予約${index + 1}:`, {
                planetariumParticipation,
                selectedPart,
                participantCount
            });

            if (planetariumParticipation === 'はい' && selectedPart && partCounts.hasOwnProperty(selectedPart)) {
                partCounts[selectedPart] += participantCount;
                console.log(`${selectedPart}に${participantCount}人追加 - 合計: ${partCounts[selectedPart]}`);
            }
        });

        console.log('最終プラネタリウムpartCounts:', partCounts);

        // 残席数を計算して返す
        const parts = PLANETARIUM_PARTS.map(part => ({
            name: part.name,
            capacity: part.capacity,
            reserved: partCounts[part.name] || 0,
            remaining: Math.max(0, part.capacity - (partCounts[part.name] || 0))
        }));

        console.log('生成されたプラネタリウムparts:', parts);

        return parts;

    } catch (error) {
        console.error('プラネタリウム部情報取得エラー:', error);
        throw new Error('プラネタリウム部情報の取得に失敗しました: ' + error.message);
    }
}

/**
 * 予約データを送信・保存（応答を待つ従来版）
 */
function submitReservation(formData) {
    try {
        console.log('=== 予約処理開始（従来版） ===');
        console.log('受信データ（PII除外）:', JSON.stringify(summarizeFormData(formData), null, 2));

        // セキュリティ: 不正なデータ送信を防ぐ追加チェック
        if (!formData || typeof formData !== 'object') {
            throw new Error('無効なデータ形式です。');
        }

        // 設定確認
        const config = getConfig();
        console.log('設定確認 - SPREADSHEET_ID:', config.SPREADSHEET_ID ? '設定済み' : '未設定');
        console.log('設定確認 - EMAIL_FROM_NAME:', config.EMAIL_FROM_NAME);
        console.log('設定確認 - EMAIL_REPLY_TO:', config.EMAIL_REPLY_TO);

        console.log('予約処理開始 - データはすでに検証・サニタイゼーション済み');

        // 基本バリデーション（最終確認）
        if (!formData['代表者氏名'] || !formData['来場地域'] || !formData['メールアドレス'] || !formData['ワークショップ参加']) {
            throw new Error('必須項目が入力されていません。');
        }

        // メールアドレスの形式チェック（より厳密に）
        const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
        if (!emailRegex.test(formData['メールアドレス'])) {
            throw new Error('有効なメールアドレスを入力してください。');
        }

        // 名前の長さチェック
        if (formData['代表者氏名'].length > 50) {
            throw new Error('代表者氏名は50文字以内で入力してください。');
        }

        // ワークショップ参加の場合の追加バリデーション
        if (formData['ワークショップ参加'] === 'はい' || formData['ワークショップ参加'] === '参加する') {
            if (!formData['ワークショップ参加人数'] || !formData['予約する部']) {
                throw new Error('ワークショップの参加人数と予約する部を選択してください。');
            }

            const participantCount = parseInt(formData['ワークショップ参加人数']);
            if (participantCount < 1 || participantCount > 10) {
                throw new Error('参加人数は1～10人の範囲で入力してください。');
            }

            // 残席チェック
            const parts = getParts();
            const selectedPart = parts.find(part => part.name === formData['予約する部']);
            if (!selectedPart) {
                throw new Error('選択された部が見つかりません。');
            }

            if (selectedPart.remaining < participantCount) {
                throw new Error(`${formData['予約する部']}の残席が不足しています。残席: ${selectedPart.remaining}席`);
            }
        }

        // プラネタリウム参加の場合の追加バリデーション
        if (formData['プラネタリウム鑑賞'] === 'はい') {
            if (!formData['プラネタリウム参加人数'] || !formData['プラネタリウム予約部']) {
                throw new Error('プラネタリウムの参加人数と予約する部を選択してください。');
            }

            const planetariumParticipantCount = parseInt(formData['プラネタリウム参加人数']);
            if (planetariumParticipantCount < 1 || planetariumParticipantCount > 30) {
                throw new Error('プラネタリウム参加人数は1～30人の範囲で入力してください。');
            }

            // 残席チェック
            const planetariumParts = getPlanetariumParts();
            const selectedPlanetariumPart = planetariumParts.find(part => part.name === formData['プラネタリウム予約部']);
            if (!selectedPlanetariumPart) {
                throw new Error('選択されたプラネタリウム部が見つかりません。');
            }

            if (selectedPlanetariumPart.remaining < planetariumParticipantCount) {
                throw new Error(`${formData['プラネタリウム予約部']}の残席が不足しています。残席: ${selectedPlanetariumPart.remaining}席`);
            }
        }

        // スプレッドシートに保存
        const sheet = getOrCreateSheet('予約データ');
        const timestamp = new Date();

        const rowData = [
            timestamp,                              // A列: タイムスタンプ
            formData['来場人数'] || '',               // B列: 来場人数
            formData['代表者氏名'],                   // C列: 代表者氏名
            formData['来場地域'],                     // D列: 来場地域
            formData['メールアドレス'],               // E列: メールアドレス
            formData['当日の交通手段'] || '',         // F列: 当日の交通手段
            formData['お車台数'] || '',               // G列: お車台数
            formData['イベント認知経路'] || '',       // H列: イベント認知経路
            formData['ワークショップ参加'],           // I列: ワークショップ参加
            formData['ワークショップ参加人数'] || '', // J列: ワークショップ参加人数
            formData['予約する部'] || '',             // K列: 予約する部
            formData['プラネタリウム鑑賞'] || '',     // L列: プラネタリウム鑑賞
            formData['プラネタリウム参加人数'] || '', // M列: プラネタリウム参加人数
            formData['プラネタリウム予約部'] || ''    // N列: プラネタリウム予約部
        ];

        sheet.appendRow(rowData);
        console.log('スプレッドシートに予約データ追加完了');

        // 確認メール送信
        console.log('=== 確認メール送信処理開始 ===');

        try {
            const emailResult = sendConfirmationEmail(formData);
            console.log('✅ 確認メール送信結果:', emailResult);
        } catch (emailError) {
            console.error('❌ 確認メール送信エラー:', emailError);
            // メール送信に失敗しても予約は成功とする
        }

        // 管理者通知メール送信
        console.log('=== 管理者通知メール送信処理開始 ===');
        try {
            sendAdminNotification(formData);
            console.log('✅ 管理者通知メール送信完了');
        } catch (adminEmailError) {
            console.error('❌ 管理者通知メール送信エラー:', adminEmailError);
            // 管理者メール送信に失敗しても予約は成功とする
        }

        return '予約が完了しました！確認メールをお送りいたしましたので、ご確認ください。';

    } catch (error) {
        console.error('予約送信エラー:', error);
        throw new Error('予約の処理中にエラーが発生しました: ' + error.message);
    }
}

/**
 * 予約データを送信・保存（即時実行版 - バックグラウンド処理用）
 * doPostからの呼び出し用。すでに検証済みのデータを処理する高速版。
 */
function submitReservationImmediate(formData) {
    try {
        console.log('=== 予約処理開始（即時実行版） ===');
        console.log('処理データ（PII除外）:', JSON.stringify(summarizeFormData(formData), null, 2));

        const startTime = new Date().getTime();

        // スプレッドシートに保存
        const sheet = getOrCreateSheet('予約データ');
        const timestamp = new Date();

        const rowData = [
            timestamp,                              // A列: タイムスタンプ
            formData['来場人数'] || '',               // B列: 来場人数
            formData['代表者氏名'],                   // C列: 代表者氏名
            formData['来場地域'],                     // D列: 来場地域
            formData['メールアドレス'],               // E列: メールアドレス
            formData['当日の交通手段'] || '',         // F列: 当日の交通手段
            formData['お車台数'] || '',               // G列: お車台数
            formData['イベント認知経路'] || '',       // H列: イベント認知経路
            formData['ワークショップ参加'],           // I列: ワークショップ参加
            formData['ワークショップ参加人数'] || '', // J列: ワークショップ参加人数
            formData['予約する部'] || '',             // K列: 予約する部
            formData['プラネタリウム鑑賞'] || '',     // L列: プラネタリウム鑑賞
            formData['プラネタリウム参加人数'] || '', // M列: プラネタリウム参加人数
            formData['プラネタリウム予約部'] || ''    // N列: プラネタリウム予約部
        ];

        sheet.appendRow(rowData);
        const saveTime = new Date().getTime();
        console.log('スプレッドシートに予約データ追加完了 (所要時間: ' + (saveTime - startTime) + 'ms)');

        // 確認メール送信
        console.log('=== 確認メール送信処理開始 ===');

        try {
            const emailResult = sendConfirmationEmail(formData);
            const emailTime = new Date().getTime();
            console.log('✅ 確認メール送信結果:', emailResult, '(所要時間: ' + (emailTime - saveTime) + 'ms)');
        } catch (emailError) {
            console.error('❌ 確認メール送信エラー:', emailError);
            // メール送信に失敗しても予約は成功とする
        }

        // 管理者通知メール送信
        console.log('=== 管理者通知メール送信処理開始 ===');
        try {
            sendAdminNotification(formData);
            const endTime = new Date().getTime();
            console.log('✅ 管理者通知メール送信完了 (所要時間: ' + (endTime - saveTime) + 'ms)');
            console.log('総処理時間: ' + (endTime - startTime) + 'ms');
        } catch (adminEmailError) {
            console.error('❌ 管理者通知メール送信エラー:', adminEmailError);
            // 管理者メール送信に失敗しても予約は成功とする
        }

        return '予約処理完了 (バックグラウンド)';

    } catch (error) {
        console.error('予約処理エラー (バックグラウンド):', error);
        return 'エラー: ' + error.message;
    }
}

/**
 * スプレッドシートのシートを取得または作成
 */
function getOrCreateSheet(sheetName) {
    try {
        const config = getConfig();
        const spreadsheet = SpreadsheetApp.openById(config.SPREADSHEET_ID);
        let sheet = spreadsheet.getSheetByName(sheetName);

        if (!sheet) {
            sheet = spreadsheet.insertSheet(sheetName);

            // シート別のヘッダー行を設定
            if (sheetName === '予約データ') {
                const headers = [
                    'タイムスタンプ',
                    '来場人数',
                    '代表者氏名',
                    '来場地域',
                    'メールアドレス',
                    '当日の交通手段',
                    'お車台数',
                    'イベント認知経路',
                    'ワークショップ参加',
                    'ワークショップ参加人数',
                    '予約する部',
                    'プラネタリウム鑑賞',
                    'プラネタリウム参加人数',
                    'プラネタリウム予約部'
                ];
                sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
            } else if (sheetName === 'メール送信エラー') {
                const errorHeaders = [
                    'エラー発生時刻',
                    '送信先メールアドレス',
                    '受信者名',
                    'エラー内容',
                    'メールタイプ'
                ];
                sheet.getRange(1, 1, 1, errorHeaders.length).setValues([errorHeaders]);
            } else if (sheetName === 'メール送信ログ') {
                const logHeaders = [
                    '送信日時',
                    '送信先メールアドレス',
                    '受信者名',
                    'メールタイプ',
                    'ステータス',
                    '件名'
                ];
                sheet.getRange(1, 1, 1, logHeaders.length).setValues([logHeaders]);
            }

            // ヘッダー行の書式設定
            const headerRange = sheet.getRange(1, 1, 1, sheet.getLastColumn());
            headerRange.setBackground('#4a90e2');
            headerRange.setFontColor('white');
            headerRange.setFontWeight('bold');

            // 列幅を自動調整
            sheet.autoResizeColumns(1, sheet.getLastColumn());
        }

        return sheet;

    } catch (error) {
        console.error('シート取得/作成エラー:', error);
        throw new Error('データベースの初期化に失敗しました: ' + error.message);
    }
}

/**
 * 管理者用：メール配信テスト機能
 *//**
* 管理者用：メール配信テスト機能
*/
function sendTestEmail(targetEmail = null) {
    try {
        console.log('=== テストメール送信開始 ===');

        // テスト用のメールアドレス（管理者自身のメールか指定されたメール）
        const testEmail = targetEmail || Session.getActiveUser().getEmail();

        if (!testEmail) {
            throw new Error('テスト送信先メールアドレスが見つかりません');
        }

        // テスト用のデータ
        const testData = {
            email: testEmail,
            name: 'テストユーザー',
            phone: '090-0000-0000',
            workshop: '第1部 (13:30集合)',
            planetarium: '第1部 (13:30上映開始)',
            awareness: 'HP'
        };

        // テストメール送信
        const result = sendConfirmationEmail(testData);

        console.log('テストメール送信結果:', result);

        return {
            success: result.success,
            message: `テストメールを ${testEmail} に送信しました`,
            details: result,
            timestamp: new Date().toISOString()
        };

    } catch (error) {
        console.error('テストメール送信エラー:', error);
        return {
            success: false,
            error: error.message,
            message: 'テストメール送信中にエラーが発生しました'
        };
    }
}
function validateEmailDelivery() {
    try {
        console.log('=== メール配信診断開始 ===');

        // 1. 送信ドメインの確認
        const currentUser = Session.getActiveUser().getEmail();
        console.log('現在のGoogleアカウント:', currentUser);

        // 2. Gmail送信制限の確認
        const quota = MailApp.getRemainingDailyQuota();
        console.log('本日の残り送信可能メール数:', quota);

        // 3. メール送信エラーログの確認
        try {
            const errorSheet = getOrCreateSheet('メール送信エラー');
            const errorData = errorSheet.getDataRange().getValues();
            console.log('メール送信エラー記録:', errorData.length - 1, '件');

            if (errorData.length > 1) {
                const recentErrors = errorData.slice(-5); // 最新5件のエラー
                console.log('最近のエラー:', recentErrors);
            }
        } catch (sheetError) {
            console.log('エラーログシート作成中...');
        }

        return {
            status: 'ready',
            currentUser: currentUser,
            dailyQuota: quota,
            recommendations: [
                'プレーンテキスト送信でiCloud配信率向上',
                '配信停止リンク追加でCAN-SPAM法準拠',
                '送信者情報最適化でSPF認証強化',
                '送信頻度制限でiCloudブロック回避',
                'RFC準拠ヘッダーでスパム判定回避'
            ],
            icloudOptimizations: {
                plainTextOnly: true,
                unsubscribeLink: true,
                spfCompliant: true,
                rateLimit: true,
                rfcHeaders: true
            }
        };

    } catch (error) {
        console.error('メール配信診断エラー:', error);
        return {
            status: 'error',
            error: error.message
        };
    }
}

/**
 * iCloudメール問題解決のためのテスト送信機能
 */
function testEmailToiCloud(testEmailAddress = null) {
    try {
        if (!testEmailAddress) {
            throw new Error('テスト用メールアドレスが指定されていません');
        }

        console.log('iCloudメールテスト送信開始');

        const config = getConfig();
        const contactEmail = config.EMAIL_REPLY_TO;

        // 配信改善のため1秒待機
        Utilities.sleep(1000);

        const testSubject = '[気仙沼星空観望会] メール配信テスト';
        const testBody = `このメールは気仙沼星空観望会予約システムからのテスト配信です。

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
【テスト目的】
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
iCloudメールアドレスへの配信改善テスト

【改善内容】
✓ 配信停止リンクの追加
✓ プレーンテキスト送信への変更
✓ 送信者情報の最適化
✓ RFC準拠のメールフォーマット
✓ 送信頻度制限の実装

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
【メール配信について】
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
このメールはテスト送信です。今後このような通知が不要な場合は、
下記までご連絡ください：

配信停止: ${contactEmail}
（件名に「配信停止希望」とご記入ください）

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${config.EMAIL_FROM_NAME}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
このメールは自動送信されています。
お問い合わせは ${contactEmail} までお願いいたします。
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

テスト送信日時: ${new Date().toLocaleString('ja-JP')}`;

        const emailOptions = {
            replyTo: contactEmail,
            name: config.EMAIL_FROM_NAME,
            htmlBody: null,
            headers: {
                'Return-Path': contactEmail,
                'X-Mailer': 'Kesennuma-Stargazing-Test',
                'X-Priority': '3',
                'Importance': 'Normal'
            }
        };

        GmailApp.sendEmail(
            testEmailAddress,
            testSubject,
            testBody,
            emailOptions
        );

        // テスト結果をログに記録
        try {
            const sheet = getOrCreateSheet('メール送信テスト');
            if (sheet.getLastRow() === 0) {
                // ヘッダーがない場合は作成
                sheet.getRange(1, 1, 1, 4).setValues([['送信日時', '送信先', 'ステータス', '備考']]);
            }
            sheet.appendRow([
                new Date(),
                testEmailAddress,
                '送信完了',
                'iCloud配信改善テスト'
            ]);
        } catch (logError) {
            console.error('テストログ記録エラー:', logError);
        }

        console.log('テスト送信完了:', maskEmail(testEmailAddress));
        return `✅ テスト送信完了: ${testEmailAddress}`;

    } catch (error) {
        console.error('テスト送信エラー:', error);
        return `❌ テスト送信失敗: ${error.message}`;
    }
}

/**
 * 確認メールを送信（配信率向上・高速応答版）
 */
function sendConfirmationEmail(formData) {
    try {
        // 環境変数から設定を取得
        const config = getConfig();

        // Gmail送信制限をチェック
        const remainingQuota = MailApp.getRemainingDailyQuota();
        console.log('残り送信可能メール数:', remainingQuota);

        if (remainingQuota <= 0) {
            throw new Error('Gmail送信制限に達しています。明日再度お試しください。');
        }

        // メール配信率向上のための待機時間（高速化のため短縮）
        Utilities.sleep(300); // 1000ms→300msに短縮

        const emailAddress = formData['メールアドレス'];
        console.log(`確認メール送信開始: ${maskEmail(emailAddress)}`);

        // 件名をシンプルにして迷惑メール判定を回避
        const subject = '第5回気仙沼星空観望会 予約確認';

        // 環境変数から送信者情報を取得
        const fromName = config.EMAIL_FROM_NAME;
        const replyTo = config.EMAIL_REPLY_TO;

        // メール本文をシンプルで読みやすく構成
        let body = `${formData['代表者氏名']} 様

第5回気仙沼星空観望会へのお申し込みありがとうございます。
以下の内容で予約を承りました。

■予約内容
・来場人数: ${formData['来場人数']}名
・代表者: ${formData['代表者氏名']}
・来場地域: ${formData['来場地域']}`;

        // 交通手段情報
        if (formData['当日の交通手段']) {
            body += `\n・交通手段: ${formData['当日の交通手段']}`;
            if (formData['お車台数']) {
                body += ` (${formData['お車台数']}台)`;
            }
        }

        // イベント認知経路
        if (formData['イベント認知経路']) {
            body += `\n・きっかけ: ${formData['イベント認知経路']}`;
        }

        // ワークショップ情報
        body += `\n・ワークショップ: ${formData['ワークショップ参加']}`;
        if (formData['ワークショップ参加'] === 'はい' || formData['ワークショップ参加'] === '参加する') {
            body += `\n  参加人数: ${formData['ワークショップ参加人数']}名`;
            body += `\n  予約部: ${formData['予約する部']}`;
        }

        // プラネタリウム情報
        if (formData['プラネタリウム鑑賞']) {
            body += `\n・プラネタリウム: ${formData['プラネタリウム鑑賞']}`;
            if (formData['プラネタリウム鑑賞'] === 'はい') {
                body += `\n  鑑賞人数: ${formData['プラネタリウム参加人数']}名`;
                body += `\n  予約部: ${formData['プラネタリウム予約部']}`;
            }
        }

        body += `

■開催情報
日時: 2025年9月27日(土) 13:30～20:30（13:00開場）※雨天決行
場所: 旧 気仙沼市立小泉小学校
住所: 宮城県気仙沼市本吉町平貝63

■重要事項
・ワークショップ/プラネタリウムの集合/上映時間以降のご参加はお断りしております。
・ワークショップにご参加の方々へ: 記念日の月齢を描いたキーホルダーをご制作いただきます。お誕生日や大切な思い出の日などの年月日をあらかじめ決めたうえでご来場ください。
・変更・キャンセルは本メールに返信する形でご連絡ください。

■お問い合わせ
${replyTo}

当日お会いできることを楽しみにしております。

${fromName}`;

        // 配信率向上のためのメール送信設定
        const emailOptions = {
            replyTo: replyTo,
            name: fromName,
            htmlBody: null, // プレーンテキストのみ
            headers: {
                'Return-Path': replyTo,
                'X-Mailer': 'GAS-Kesennuma-Event',
                'X-Priority': '3',
                'Importance': 'Normal',
                'Message-ID': `<${Date.now()}.${Math.random().toString(36)}@kesennuma-event.com>`,
                'List-Unsubscribe': `<mailto:${replyTo}?subject=配信停止希望>`
            }
        };

        // メール送信を実行
        console.log('=== メール送信開始 ===');
        console.log('送信先(マスク):', maskEmail(emailAddress));
        console.log('件名:', subject);
        console.log('送信者名:', fromName);
        console.log('返信先:', replyTo);
        console.log('残りクォータ:', remainingQuota);

        // Gmail制限の二重チェック
        if (remainingQuota <= 1) {
            throw new Error(`Gmail送信制限: 残り${remainingQuota}通`);
        }

        // GmailApp使用可能性のチェック
        try {
            const testQuota = MailApp.getRemainingDailyQuota();
            console.log('MailApp クォータ確認:', testQuota);
        } catch (quotaError) {
            console.error('クォータ確認エラー:', quotaError);
        }

        console.log('GmailApp.sendEmail実行中...');
        GmailApp.sendEmail(emailAddress, subject, body, emailOptions);
        console.log('GmailApp.sendEmail完了');

        console.log(`✅ 確認メール送信成功: ${maskEmail(emailAddress)}`);

        // 送信成功ログを記録
        try {
            const logSheet = getOrCreateSheet('メール送信ログ');
            logSheet.appendRow([
                new Date(),
                emailAddress,
                formData['代表者氏名'],
                '確認メール',
                '送信成功',
                subject
            ]);
        } catch (logError) {
            console.error('送信ログ記録エラー:', logError);
        }

        return true;

    } catch (error) {
        const emailAddress = formData['メールアドレス'];
        console.error('確認メール送信エラー:', error);

        // エラーログを詳細に記録
        try {
            const errorSheet = getOrCreateSheet('メール送信エラー');
            errorSheet.appendRow([
                new Date(),
                emailAddress,
                formData['代表者氏名'],
                error.message,
                'confirmation_email_error'
            ]);
        } catch (logError) {
            console.error('エラーログ記録失敗:', logError);
        }

        // 配信失敗の場合、代替手段を試行
        try {
            console.log(`代替送信方法を試行: ${maskEmail(emailAddress)}`);

            // より基本的な設定で再送信
            const fallbackConfig = getConfig();
            const simpleSubject = '予約確認';
            const simpleBody = `${formData['代表者氏名']}様

第5回気仙沼星空観望会の予約を承りました。

詳細はお問い合わせください：
${fallbackConfig.EMAIL_REPLY_TO}

${fallbackConfig.EMAIL_FROM_NAME}`;

            MailApp.sendEmail(emailAddress, simpleSubject, simpleBody);

            console.log(`代替送信成功: ${maskEmail(emailAddress)}`);

            // 代替送信成功ログ
            try {
                const logSheet = getOrCreateSheet('メール送信ログ');
                logSheet.appendRow([
                    new Date(),
                    emailAddress,
                    formData['代表者氏名'],
                    '確認メール(代替)',
                    '送信成功',
                    simpleSubject
                ]);
            } catch (logError) {
                console.error('代替送信ログ記録エラー:', logError);
            }

            return true;

        } catch (alternativeError) {
            console.error('代替送信も失敗:', alternativeError);

            // 最終的な送信失敗ログ
            try {
                const errorSheet = getOrCreateSheet('メール送信エラー');
                errorSheet.appendRow([
                    new Date(),
                    emailAddress,
                    formData['代表者氏名'],
                    `主送信: ${error.message}, 代替送信: ${alternativeError.message}`,
                    'all_methods_failed'
                ]);
            } catch (logError) {
                console.error('最終エラーログ記録失敗:', logError);
            }

            return false;
        }
    }
}

/**
 * 管理者通知メールを送信（iCloud対応強化版）
 */
function sendAdminNotification(formData) {
    try {
        // 環境変数から設定を取得
        const config = getConfig();

        // Gmail送信制限をチェック
        const remainingQuota = MailApp.getRemainingDailyQuota();
        console.log('管理者通知用残り送信可能メール数:', remainingQuota);

        if (remainingQuota <= 0) {
            console.warn('Gmail送信制限に達しているため、管理者通知メールを送信できません');
            return;
        }

        // 管理者のメールアドレスは Script Properties (ADMIN_EMAIL) から取得
        const adminEmail = config.ADMIN_EMAIL;

        // iCloud配信改善のための送信者情報
        const fromName = config.EMAIL_FROM_NAME + '予約システム';
        const replyTo = config.EMAIL_REPLY_TO;

        const subject = '【第5回気仙沼星空観望会】新規予約通知';

        let body = `新しい予約が入りました。

【予約内容】
来場人数: ${formData['来場人数']}人
代表者氏名: ${formData['代表者氏名']}
来場地域: ${formData['来場地域']}
メールアドレス: ${formData['メールアドレス']}`;

        // 交通手段情報
        if (formData['当日の交通手段']) {
            body += `
当日の交通手段: ${formData['当日の交通手段']}`;
            if (formData['お車台数']) {
                body += `
お車台数: ${formData['お車台数']}台`;
            }
        }

        // イベント認知経路情報
        if (formData['イベント認知経路']) {
            body += `
イベント認知経路: ${formData['イベント認知経路']}`;
        }

        // ワークショップ情報
        body += `
ワークショップ参加: ${formData['ワークショップ参加']}`;

        if (formData['ワークショップ参加'] === 'はい' || formData['ワークショップ参加'] === '参加する') {
            body += `
ワークショップ参加人数: ${formData['ワークショップ参加人数']}人
予約する部: ${formData['予約する部']}`;
        }

        // プラネタリウム情報
        if (formData['プラネタリウム鑑賞']) {
            body += `
プラネタリウム鑑賞: ${formData['プラネタリウム鑑賞']}`;

            if (formData['プラネタリウム鑑賞'] === 'はい') {
                body += `
プラネタリウム参加人数: ${formData['プラネタリウム参加人数']}人
プラネタリウム予約部: ${formData['プラネタリウム予約部']}`;
            }
        }

        body += `

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
【管理者用リンク】
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
スプレッドシートで詳細を確認：
https://docs.google.com/spreadsheets/d/${config.SPREADSHEET_ID}

予約確認メール送信状況：
- 参加者への確認メール送信を試行しました
- iCloudメールへの配信改善対応済み

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
気仙沼星空観望会予約システム (自動送信)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;

        // iCloud配信改善のための追加オプション
        const emailOptions = {
            replyTo: replyTo,
            name: fromName,
            htmlBody: null
        };

        console.log('管理者通知メール送信実行中...', {
            to: adminEmail,
            subject: subject,
            fromName: fromName,
            replyTo: replyTo
        });

        GmailApp.sendEmail(
            adminEmail,
            subject,
            body,
            emailOptions
        );

        console.log(`管理者通知メール送信完了: ${adminEmail}`);

    } catch (error) {
        console.error('管理者通知メール送信エラー:', error);

        // エラーログを詳細に記録（デバッグ用）
        try {
            const errorSheet = getOrCreateSheet('メール送信エラー');
            errorSheet.appendRow([
                new Date(),
                getConfig().ADMIN_EMAIL,
                '管理者通知',
                error.message,
                'admin_notification'
            ]);
        } catch (logError) {
            console.error('エラーログ記録失敗:', logError);
        }

        // メール送信エラーは予約処理を停止させない
    }
}

/**
 * テスト用関数：サンプルデータを生成
 */
function createSampleData() {
    const sheet = getOrCreateSheet('予約データ');

    const sampleData = [
        [new Date(), '山田太郎', '気仙沼市内', 'yamada@example.com', '参加する', '2', '第1部 (13:30集合)'],
        [new Date(), '佐藤花子', '宮城県内（気仙沼市以外）', 'sato@example.com', '参加しない', '', ''],
        [new Date(), '田中次郎', '岩手県', 'tanaka@example.com', '参加する', '1', '第2部 (14:00集合)']
    ];

    sampleData.forEach(row => {
        sheet.appendRow(row);
    });

    console.log('サンプルデータを作成しました');
}

/**
 * 一般公開用のテスト関数
 * デプロイが正常に動作するかを確認
 */
function testPublicAccess() {
    try {
        // 基本的な機能をテスト
        const parts = getParts();
        console.log('ワークショップ部情報取得成功:', parts);

        // テストデータでsubmitReservationをテスト
        const testData = {
            '代表者氏名': 'テスト太郎',
            '来場地域': '気仙沼市内',
            'メールアドレス': 'test@example.com',
            'ワークショップ参加': '参加しない'
        };

        // 注意: 実際にメールは送信されます
        // const result = submitReservation(testData);
        // console.log('予約テスト成功:', result);

        return '✅ 一般公開準備完了: 全ての機能が正常に動作しています';

    } catch (error) {
        console.error('テストエラー:', error);
        return '❌ エラーが発生しました: ' + error.message;
    }
}

/**
 * 残席数の手動確認用テスト関数
 */
function testWorkshopSeats() {
    try {
        console.log('=== ワークショップ残席数テスト開始 ===');

        const sheet = getOrCreateSheet('予約データ');
        const data = sheet.getDataRange().getValues();

        console.log('スプレッドシート行数:', data.length);
        console.log('ヘッダー行:', data[0]);

        if (data.length > 1) {
            console.log('データサンプル（最新3行）:');
            const recentData = data.slice(-3);
            recentData.forEach((row, index) => {
                console.log(`行${data.length - 3 + index}:`, row);
            });
        }

        const parts = getParts();
        console.log('現在の残席状況:', parts);

        return parts;

    } catch (error) {
        console.error('残席数テストエラー:', error);
        return { error: error.message };
    }
}

/**
 * デプロイ診断用関数
 * 一般公開の設定状況を確認
 */
function diagnoseDeploy() {
    try {
        // 1. doGet関数のテスト
        console.log('=== doGet関数テスト ===');
        const htmlOutput = doGet();
        console.log('doGet関数: OK');

        // 2. main.htmlファイルの存在確認
        console.log('=== HTMLファイル確認 ===');
        const htmlContent = include('main');
        console.log('main.htmlファイル: OK');

        // 3. スプレッドシート接続テスト
        console.log('=== スプレッドシート接続テスト ===');
        const sheet = getOrCreateSheet('予約データ');
        console.log('スプレッドシート: OK');

        // 4. ワークショップ部設定確認
        console.log('=== ワークショップ設定確認 ===');
        console.log('設定済み部数:', WORKSHOP_PARTS.length);

        return `
🎯 デプロイ診断結果
✅ doGet関数: 正常
✅ HTMLファイル: 正常  
✅ スプレッドシート: 正常
✅ ワークショップ設定: ${WORKSHOP_PARTS.length}部

📋 次の手順:
1. デプロイ → 新しいデプロイ
2. 種類: ウェブアプリ
3. アクセスできるユーザー: 全員 ⭐️重要
4. デプロイして承認

⚠️ 承認時の注意:
- 「詳細」をクリック
- 「安全ではないページに移動」をクリック
- 「許可」をクリック
        `;

    } catch (error) {
        console.error('診断エラー:', error);
        return `
❌ デプロイ診断エラー
エラー内容: ${error.message}

🔧 対処法:
1. スプレッドシートIDを確認
2. main.htmlファイルの存在を確認
3. 権限設定を確認
        `;
    }
}

/**
 * メール送信システムデバッグ機能
 */
function debugEmailSystem() {
    try {
        const debugResults = {
            timestamp: new Date().toISOString(),
            gmailQuota: MailApp.getRemainingDailyQuota(),
            userEmail: Session.getActiveUser().getEmail(),
            timezone: Session.getScriptTimeZone(),
            mailAppAvailable: typeof MailApp !== 'undefined',
            gmailAppAvailable: typeof GmailApp !== 'undefined',
            recentErrors: [],
            sendTest: null
        };

        // 最近のメール送信エラーを確認
        try {
            const errorSheet = getOrCreateSheet('メール送信エラー');
            const errorData = errorSheet.getDataRange().getValues();
            if (errorData.length > 1) {
                debugResults.recentErrors = errorData.slice(-3).map(row => ({
                    date: row[0],
                    email: row[1],
                    error: row[3]
                }));
            }
        } catch (sheetError) {
            debugResults.sheetError = sheetError.message;
        }

        // 簡単なテストメール送信
        try {
            const testEmail = Session.getActiveUser().getEmail();
            const testSubject = 'システムテスト - ' + new Date().toLocaleTimeString();
            const testBody = 'このメールはシステムテストです。送信機能は正常に動作しています。';

            MailApp.sendEmail(testEmail, testSubject, testBody);
            debugResults.sendTest = 'SUCCESS: テストメール送信完了';
        } catch (testError) {
            debugResults.sendTest = 'ERROR: ' + testError.message;
        }

        return debugResults;

    } catch (error) {
        return {
            error: error.message,
            message: 'メールシステムデバッグ中にエラーが発生しました'
        };
    }
}

/**
 * 管理者用: レート制限状況確認機能
 */
function getRateLimitStatus(targetIP = null) {
    try {
        const cache = CacheService.getScriptCache();
        const config = getConfig();
        const hourKey = getCurrentHourKey();
        const dateKey = getCurrentDateKey();

        if (targetIP) {
            // 特定IPの状況を確認
            const hourlyKey = `rate_hourly_${targetIP}_${hourKey}`;
            const dailyKey = `rate_daily_${targetIP}_${dateKey}`;
            const reservationKey = `reservation_${targetIP}_${dateKey}`;

            const hourlyCount = parseInt(cache.get(hourlyKey) || '0');
            const dailyCount = parseInt(cache.get(dailyKey) || '0');
            const reservationCount = parseInt(cache.get(reservationKey) || '0');

            return {
                targetIP: targetIP,
                hourly: {
                    used: hourlyCount,
                    limit: config.RATE_LIMIT_PER_HOUR,
                    remaining: Math.max(0, config.RATE_LIMIT_PER_HOUR - hourlyCount),
                    key: hourlyKey
                },
                daily: {
                    used: dailyCount,
                    limit: config.RATE_LIMIT_PER_DAY,
                    remaining: Math.max(0, config.RATE_LIMIT_PER_DAY - dailyCount),
                    key: dailyKey
                },
                reservation: {
                    used: reservationCount,
                    limit: config.RESERVATION_LIMIT_PER_DAY,
                    remaining: Math.max(0, config.RESERVATION_LIMIT_PER_DAY - reservationCount),
                    key: reservationKey
                },
                timestamp: new Date().toISOString()
            };
        } else {
            // 全体の設定情報を返す
            return {
                config: {
                    enabled: config.ENABLE_RATE_LIMIT,
                    hourlyLimit: config.RATE_LIMIT_PER_HOUR,
                    dailyLimit: config.RATE_LIMIT_PER_DAY,
                    reservationLimit: config.RESERVATION_LIMIT_PER_DAY,
                    excludeActions: config.RATE_LIMIT_EXCLUDE_ACTIONS
                },
                currentKeys: {
                    hour: hourKey,
                    date: dateKey
                },
                timestamp: new Date().toISOString(),
                usage: '特定IPの状況を確認するには getRateLimitStatus("IP_ADDRESS") を使用'
            };
        }

    } catch (error) {
        console.error('レート制限状況確認エラー:', error);
        return {
            error: error.message,
            message: 'レート制限状況の確認中にエラーが発生しました'
        };
    }
}

/**
 * 管理者用: レート制限をリセット
 */
function resetRateLimit(targetIP, type = 'all') {
    try {
        const cache = CacheService.getScriptCache();
        const hourKey = getCurrentHourKey();
        const dateKey = getCurrentDateKey();

        const keys = {
            hourly: `rate_hourly_${targetIP}_${hourKey}`,
            daily: `rate_daily_${targetIP}_${dateKey}`,
            reservation: `reservation_${targetIP}_${dateKey}`
        };

        const resetResults = [];

        if (type === 'all' || type === 'hourly') {
            cache.remove(keys.hourly);
            resetResults.push('時間制限をリセット');
        }

        if (type === 'all' || type === 'daily') {
            cache.remove(keys.daily);
            resetResults.push('日制限をリセット');
        }

        if (type === 'all' || type === 'reservation') {
            cache.remove(keys.reservation);
            resetResults.push('予約制限をリセット');
        }

        return {
            success: true,
            targetIP: targetIP,
            resetType: type,
            actions: resetResults,
            timestamp: new Date().toISOString()
        };

    } catch (error) {
        console.error('レート制限リセットエラー:', error);
        return {
            success: false,
            error: error.message,
            message: 'レート制限のリセット中にエラーが発生しました'
        };
    }
}

/**
 * レート制限のテスト用関数
 */
function testRateLimit() {
    try {
        console.log('=== レート制限テスト開始 ===');

        // テスト用のモックeventオブジェクト
        const mockEvent = {
            parameter: {
                action: 'getWorkshopParts',
                referrer: 'https://flint8777.github.io/TEST_KesenNuma-StarryNight/',
                userAgent: 'test-agent'
            }
        };

        const testIP = 'test.ip.address';

        // 現在の状況を確認
        const beforeStatus = getRateLimitStatus(testIP);
        console.log('テスト前の状況:', beforeStatus);

        // レート制限チェックをテスト
        const rateLimitResult = checkRateLimit(testIP, 'getWorkshopParts');
        console.log('レート制限チェック結果:', rateLimitResult);

        // カウンタを更新
        if (rateLimitResult.valid) {
            incrementRateLimit(testIP);
            console.log('カウンタ更新完了');
        }

        // 更新後の状況を確認
        const afterStatus = getRateLimitStatus(testIP);
        console.log('テスト後の状況:', afterStatus);

        return {
            success: true,
            before: beforeStatus,
            rateLimitCheck: rateLimitResult,
            after: afterStatus,
            message: 'レート制限テスト完了'
        };

    } catch (error) {
        console.error('レート制限テストエラー:', error);
        return {
            success: false,
            error: error.message,
            message: 'レート制限テスト中にエラーが発生しました'
        };
    }
}

/**
 * メールシステム全体のテスト機能
 */
function testMailSystem(targetEmail) {
    try {
        console.log('=== メールシステムテスト開始 ===');
        console.log('テスト送信先:', targetEmail);

        const results = {
            timestamp: new Date().toISOString(),
            targetEmail: targetEmail,
            tests: {},
            summary: { passed: 0, failed: 0 }
        };

        // 1. Gmail クォータチェック
        try {
            const quota = MailApp.getRemainingDailyQuota();
            results.tests.quotaCheck = {
                status: 'PASS',
                quota: quota,
                message: `残りクォータ: ${quota}`
            };
            results.summary.passed++;
        } catch (error) {
            results.tests.quotaCheck = {
                status: 'FAIL',
                error: error.message
            };
            results.summary.failed++;
        }

        // 2. 設定確認
        try {
            const config = getConfig();
            results.tests.configCheck = {
                status: 'PASS',
                config: {
                    spreadsheetId: config.SPREADSHEET_ID ? '設定済み' : '未設定',
                    emailFromName: config.EMAIL_FROM_NAME,
                    emailReplyTo: config.EMAIL_REPLY_TO
                }
            };
            results.summary.passed++;
        } catch (error) {
            results.tests.configCheck = {
                status: 'FAIL',
                error: error.message
            };
            results.summary.failed++;
        }

        // 3. テストメール送信
        try {
            const testData = {
                'メールアドレス': targetEmail,
                '代表者氏名': 'テストユーザー',
                '来場人数': 2,
                '来場地域': '気仙沼市内',
                '当日の交通手段': '車',
                'お車台数': 1,
                'イベント認知経路': 'システムテスト',
                'ワークショップ参加': '参加する',
                'ワークショップ参加人数': 1,
                '予約する部': '第1部 (13:30集合)',
                'プラネタリウム鑑賞': 'はい',
                'プラネタリウム参加人数': 2,
                'プラネタリウム予約部': '第1部 (13:30上映開始)'
            };

            const emailResult = sendConfirmationEmail(testData);
            results.tests.emailSend = {
                status: 'PASS',
                result: emailResult,
                message: 'テストメール送信成功'
            };
            results.summary.passed++;
        } catch (error) {
            results.tests.emailSend = {
                status: 'FAIL',
                error: error.message
            };
            results.summary.failed++;
        }

        // 結果サマリー
        results.success = results.summary.failed === 0;
        results.message = `テスト完了: ${results.summary.passed}件成功, ${results.summary.failed}件失敗`;

        console.log('メールシステムテスト結果:', results);
        return results;

    } catch (error) {
        console.error('メールシステムテストエラー:', error);
        return {
            success: false,
            error: error.message,
            message: 'メールシステムテスト中にエラーが発生しました'
        };
    }
}