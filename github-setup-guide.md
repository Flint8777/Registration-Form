# 🔧 GitHub リポジトリ設定ガイド

## 📋 リポジトリ設定の最適化

### 1. **基本設定**
- [ ] **Description**: "気仙沼星空観望会の予約システム - セキュアなWebアプリケーション"
- [ ] **Topics/Tags**: `javascript`, `html`, `css`, `google-apps-script`, `reservation-system`, `kesennuma`, `astronomy`
- [ ] **Website**: （実際のサイトURLがあれば）

### 2. **セキュリティ設定** 
#### Settings → Security
- [ ] **Dependency graph**: 有効化
- [ ] **Dependabot alerts**: 有効化  
- [ ] **Dependabot security updates**: 有効化
- [ ] **Code scanning**: 有効化（可能であれば）

### 3. **ブランチ保護**
#### Settings → Branches
- [ ] **Branch protection rule** for `main`:
  - Require pull request reviews
  - Dismiss stale reviews
  - Require status checks

### 4. **GitHub Pages設定**（オプション）
#### Settings → Pages
- [ ] **Source**: Deploy from a branch
- [ ] **Branch**: main / (root)
- [ ] **Custom domain**: （必要に応じて）

## 🔒 セキュリティ確認事項

### 必須チェック
- [ ] Code.gs が含まれていない
- [ ] setup-environment.gs が含まれていない  
- [ ] config.js が含まれていない
- [ ] 実際のAPIエンドポイントが含まれていない

### 推奨チェック  
- [ ] README.md が適切に表示されている
- [ ] SECURITY.md が存在している
- [ ] .gitignore が正しく機能している
- [ ] ライセンスファイルの追加を検討

## 📝 次のステップ

### 短期的改善
1. **ライセンス追加**: MITライセンスなど
2. **Issue テンプレート**: バグ報告・機能要求用
3. **Contributing ガイド**: 貢献者向けガイドライン
4. **GitHub Actions**: CI/CD パイプライン

### 長期的改善
1. **テストスイート**: 自動テストの追加
2. **デプロイ自動化**: 本番環境への自動デプロイ
3. **モニタリング**: パフォーマンス監視
4. **ドキュメント拡充**: API仕様書など
