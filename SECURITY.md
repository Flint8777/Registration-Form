# セキュリティポリシー

本ドキュメントは「実装済みの対策」と「今後対応すべき項目（既知の課題）」を区別して記述する。
ドキュメントとコードを乖離させないため、未実装のものは正直に未実装と記す。

## 実装済みセキュリティ対策

### 1. 機密設定の分離
- GASデプロイURLは `config.js` に分離し、`.gitignore` で除外
- 配布用テンプレートとして `config.example.js` を提供
- `config.js` が未配置の場合、起動時に明示的なエラーで停止する

### 2. XSS対策
- 確認画面（`generateConfirmationContent`）はDOM API + `textContent` で組み立て、ユーザ入力を `innerHTML` に直挿しない
- Content-Security-Policy（CSP）を `index.html` の meta タグで適用
  - `default-src 'self'` をベースに、GAS連携と外部フォントのみ許可
  - `frame-ancestors 'self'`、`object-src 'none'`、`base-uri 'self'` で各種サイドチャネルを抑止

### 3. 入力検証（クライアント側）
- 必須項目・メール形式・台数下限・参加人数上限をフロントで検証
- ⚠️ **GAS側でも同等の検証を必ず実施すること**（クライアント検証はUX用）

## 既知の課題 / 今後対応

### 高優先度
- **JSONP の使用**: `fetchWithJsonp` でレスポンスを `<script>` 実行している。GAS側で `Access-Control-Allow-Origin` を設定し、`fetch` + JSON 応答に置換する
- **GAS側の入力検証・レート制限**: GAS の `doPost` / `doGet` 側に同等の検証と、IPまたはセッション単位のレート制限を実装する
- **postMessage の targetOrigin**: `window.parent.postMessage(..., '*')` を埋め込み許可ドメインに固定する

### 中優先度
- **ログ最適化**: `console.log` で API レスポンス全体を出力している箇所がある。本番では DEBUG フラグで抑止する
- **プライバシーポリシー**: 氏名・メールを収集する以上、独立したページで利用目的・保存期間・連絡先を明示する

## 機密情報の取り扱いガイドライン

- APIキー、GASデプロイURL、サービスアカウントJSON等は**コードに直書きしない**
- ローカル設定は `config.js` (gitignore済) または環境変数で扱う
- エラーログ・スクリーンショット・LLMへの質問文に貼り付けない（記事「シークレットと鍵を、コードに書くな」参照）
- GAS のデプロイURLが漏れたら、**Apps Scriptで再デプロイし旧URLを無効化**する

## 脆弱性報告

- **緊急度が高い場合**: GitHubの[Security Advisory](../../security/advisories)を使用
- **一般的な問題**: [Issues](../../issues)で報告
- 詳細を公開せず、まず開発チームに報告

## チェックリスト（リリース前）

- [ ] `config.js` が `.gitignore` に含まれていること
- [ ] `config.js` がリポジトリに含まれていないこと（`git ls-files config.js` で何も返らない）
- [ ] `script.js` 内に GAS デプロイURL のリテラルが残っていないこと
- [ ] CSP の meta タグが `index.html` に存在し、想定通り効いていること
- [ ] GAS 側で必須項目・人数上限・メール形式の検証を行っていること
- [ ] HTTPS 経由でのみ配信していること

## 参考資料

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [Google Apps Script セキュリティガイド](https://developers.google.com/apps-script/guides/security)
- [Web セキュリティ基礎 (MDN)](https://developer.mozilla.org/ja/docs/Web/Security)

---

**最終更新**: 2026年04月28日
**バージョン**: 1.1.0
