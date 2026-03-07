# セキュリティポリシー

## 実装済みセキュリティ機能

### フロントエンド（このリポジトリ）

#### XSS（クロスサイトスクリプティング）対策
- HTMLエンティティエンコーディング（`escapeHtml()` による出力エスケープ）
- フォーム入力値のバリデーション（メールアドレス形式チェック等）

#### 機密情報保護
- API エンドポイントの外部設定化（`config.js` は Git 管理外）
- `.gitignore` による機密ファイル除外

### バックエンド（Google Apps Script、別途管理）

以下の機能はバックエンド側（GAS）で実装されています。詳細は GAS のコードを参照してください。

- リファラーチェック（CSRF 対策）
- レート制限（DoS 対策）
- 入力値のサニタイゼーション
- 環境変数による設定管理（`setup-environment.gs`）

### 未実装（今後の検討事項）
- CSP（Content Security Policy）ヘッダーの設定（GitHub Pages の制約あり）
- フロントエンド側のレート制限

## 脆弱性報告

### 報告方法
セキュリティ上の問題を発見した場合は、以下の方法でご報告ください：

1. **緊急度が高い場合**: GitHubの[Security Advisory](../../security/advisories)を使用
2. **一般的な問題**: [Issues](../../issues)でバグ報告テンプレートを使用

### 報告時の注意事項
- 脆弱性の詳細を公開せず、まず開発チームに報告してください
- 攻撃の概念実証（PoC）がある場合は、安全な方法で共有してください
- 発見者のクレジット表記を希望する場合はお知らせください

## セキュリティチェックリスト
- [ ] `config.js` が `.gitignore` に含まれていることを確認
- [ ] API エンドポイントが適切に保護されていることを確認
- [ ] 入力検証が全てのフォームフィールドで実装されていることを確認
- [ ] HTTPS での運用を確認

## 参考資料

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [Google Apps Script セキュリティガイド](https://developers.google.com/apps-script/guides/security)
- [Web セキュリティ基礎](https://developer.mozilla.org/ja/docs/Web/Security)
