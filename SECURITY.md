# 🔒 GitHub公開時のセキュリティガイド

## ⚠️ 重要な留意点

### 1. **公開前の必須チェック**
- [ ] `.gitignore` ファイルの確認
- [ ] Google Apps Scriptファイル（.gs）の除外
- [ ] APIエンドポイントURL の環境変数化
- [ ] スプレッドシートID の除外
- [ ] 機密情報の完全除去

### 2. **機密情報リスト**
```
❌ 公開すべきでない情報:
- Google Apps Script デプロイID
- スプレッドシートID
- Google Cloud Project ID
- OAuth クライアントシークレット
- メール送信用アカウント情報
```

### 3. **安全な公開手順**

#### ステップ1: 機密情報の分離
```bash
# 設定ファイルを環境変数化
cp config.example.js config.js
# config.js に実際のAPIエンドポイントを設定
# config.js は .gitignore に含まれる
```

#### ステップ2: リポジトリ設定
```bash
# .gitignore の確認
git status --ignored

# 機密ファイルが含まれていないことを確認
git ls-files | grep -E "\.(gs|gscript|gsheet)$"
```

#### ステップ3: 段階的公開
1. **プライベートリポジトリ**: 最初は非公開で作成
2. **レビュー**: 機密情報の漏洩がないか再確認
3. **公開**: 問題なければパブリックに変更

### 4. **推奨GitHub設定**

#### リポジトリ設定
- **Security**: Dependabot alerts 有効化
- **Branches**: main ブランチ保護
- **Secrets**: 環境変数の設定
- **Issues**: セキュリティ報告用テンプレート

#### GitHub Actions での環境変数
```yaml
env:
  GAS_API_URL: ${{ secrets.GAS_API_URL }}
  SPREADSHEET_ID: ${{ secrets.SPREADSHEET_ID }}
```

### 5. **緊急時の対応**

#### 機密情報が漏洩した場合
1. **即座に新しいデプロイ**: Google Apps Script の再デプロイ
2. **APIキーの無効化**: 古いエンドポイントの無効化
3. **履歴の削除**: `git filter-branch` または BFG Repo-Cleaner 使用
4. **GitHub Security**: セキュリティアドバイザリの発行

#### コマンド例
```bash
# 機密ファイルの履歴削除
git filter-branch --force --index-filter \
  'git rm --cached --ignore-unmatch config.js' \
  --prune-empty --tag-name-filter cat -- --all

# 強制プッシュ（注意）
git push origin --force --all
```

### 6. **継続的なセキュリティ**

#### 定期チェック項目
- [ ] 依存関係の脆弱性スキャン
- [ ] アクセスログの監視
- [ ] API使用量の監視
- [ ] 不正アクセスの検出

#### 監視ツール
- GitHub Security Advisories
- Dependabot
- CodeQL analysis
- NPM audit

---

## 📞 緊急連絡先
セキュリティインシデントが発生した場合は、リポジトリ管理者まで即座にご連絡ください。
