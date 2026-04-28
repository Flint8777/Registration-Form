// このファイルをコピーして config.js を作成し、API_URL を実環境のGASデプロイURLに書き換える
// config.js は .gitignore で除外されているため、絶対にコミットされないこと
const SITE_CONFIG = {
    API_URL: 'https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec',
    MAX_PARTICIPANTS: 6,
    TIMEOUT_MS: 30000
};
