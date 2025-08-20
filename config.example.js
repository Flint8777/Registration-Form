// 気仙沼星空観望会 予約システム - 設定ファイル
// 本番環境では環境変数から読み込み

const CONFIG = {
    // 開発環境用のプレースホルダー
    API_URL: process.env.GAS_API_URL || 'YOUR_GAS_DEPLOYMENT_URL_HERE',

    // その他の設定
    MAX_PARTICIPANTS: 6,
    TIMEOUT_MS: 30000,

    // UIテキスト
    MESSAGES: {
        LOADING: '送信中...',
        SUCCESS: '予約が完了しました！',
        ERROR: 'エラーが発生しました。もう一度お試しください。'
    }
};

// 環境変数がない場合の警告
if (CONFIG.API_URL === 'YOUR_GAS_DEPLOYMENT_URL_HERE') {
    console.warn('警告: API_URLが設定されていません。環境変数 GAS_API_URL を設定してください。');
}

export default CONFIG;
