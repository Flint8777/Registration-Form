# 気仙沼星空観望会 予約システム

[![GitHub Pages](https://img.shields.io/badge/demo-live-brightgreen)](https://flint8777.github.io/TEST_KesenNuma-StarryNight/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Security](https://img.shields.io/badge/security-enterprise--grade-blue)](#-セキュリティ機能)

## 🌟 概要

気仙沼で開催される星空観望会の予約システムです。参加者が簡単に予約できるWebアプリケーションを提供し、地域の天体観測活動を支援します。

## � ライブデモ

**🔗 公開URL**: https://flint8777.github.io/TEST_KesenNuma-StarryNight/

### 💡 デモサイトでお試しいただけること
- ✨ **マルチステップフォーム**: 直感的な予約体験
- 🎨 **レスポンシブデザイン**: PC・スマートフォン対応
- 🔍 **リアルタイム検証**: 入力時の即座フィードバック
- ♿ **アクセシビリティ**: キーボードナビゲーション・スクリーンリーダー対応
- 🛡️ **セキュリティ機能**: 入力検証・XSS対策のデモ

⚠️ **注意**: デモサイトでは予約送信機能は無効です。完全な機能を利用するには[セットアップ](#-セットアップ)が必要です。

## ✨ 主要機能

### 🎯 予約機能
- 📝 マルチステップフォームによる直感的な予約プロセス
- 👥 出席者数選択（1-100名）
- 🎪 ワークショップ参加選択
- 🌟 プラネタリウム鑑賞予約
- 🚗 交通手段選択（条件付き車台数入力）
- 📧 自動確認メール送信

### 🛡️ セキュリティ機能
- 🔒 **環境変数化**: 設定の外部化・機密情報保護
- 🌐 **リファラーチェック**: 不正サイトからのアクセス防止
- ⏱️ **レート制限**: DoS攻撃・スパム対策
- 🛡️ **入力検証**: XSS・SQLインジェクション対策

### 🎨 UI/UX機能
- 📱 レスポンシブデザイン（モバイル・タブレット・PC対応）
- ♿ アクセシビリティ対応（WCAG準拠）
- 🎭 ローディング状態表示
- 🔄 リアルタイムバリデーション

## 🚀 セットアップ

### 📋 前提条件
- Googleアカウント
- Google Apps Scriptの基本知識
- Gitの基本操作（オプション）

### 🛠️ インストール手順

#### 1. リポジトリのクローン
```bash
git clone https://github.com/flint8777/TEST_KesenNuma-StarryNight.git
cd TEST_KesenNuma-StarryNight
```

#### 2. 設定ファイルの作成
```bash
# 設定テンプレートをコピー
cp config.example.js config.js

# config.js を編集してAPIエンドポイントを設定
# API_URL: 'YOUR_GAS_DEPLOYMENT_URL_HERE' を実際のURLに変更
```

#### 3. Google Apps Scriptの設定
1. [Google Apps Script](https://script.google.com/)でプロジェクトを作成
2. `Code.gs`の内容をコピー&ペースト
3. ウェブアプリとしてデプロイ
   - **実行ユーザー**: 自分
   - **アクセス権**: 全員
4. デプロイURLを`config.js`の`API_URL`に設定

#### 4. スプレッドシートの準備
1. Google スプレッドシートを作成
2. 予約データ用のシートを準備
3. Apps ScriptからのアクセスCONTENT](#-セットアップ)権限を設定

### ⚙️ 環境変数設定
```javascript
// config.js での設定例
const CONFIG = {
    API_URL: 'https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec',
    MAX_PARTICIPANTS: 6,
    TIMEOUT_MS: 30000
};
```

## 📁 プロジェクト構造

```
├── 📄 index.html              # メインページ
├── 🎨 styles.css              # スタイルシート
├── ⚡ script.js               # フロントエンド機能
├── 🖼️ iframe-embed-codes.html # 埋め込みコード
├── 🔧 config.example.js       # 設定テンプレート
├── 🔒 config.js              # 実際の設定（Git非公開）
├── 📚 README.md              # このファイル
├── 🛡️ SECURITY.md            # セキュリティガイド
├── 📄 LICENSE                # MITライセンス
├── 🚫 .gitignore             # Git除外設定
├── 🎨 404.html               # カスタム404ページ
├── 🖼️ 観望会ロゴタイプ_黒.png  # ロゴ画像
└── 📂 .github/               # GitHub設定
    └── 📋 ISSUE_TEMPLATE/    # Issue テンプレート
```

## 🔧 カスタマイズ

### 🎨 デザインの変更
`styles.css`を編集してデザインをカスタマイズできます：
- カラーテーマの変更
- フォントの調整
- レイアウトの修正

### ⚙️ 機能の追加
`script.js`で以下の機能を追加・修正できます：
- 新しい入力項目
- カスタムバリデーション
- 追加のUIエフェクト

## 🔒 セキュリティについて

このプロジェクトは**エンタープライズレベル**のセキュリティ対策を実装しています：

### 🛡️ 実装済み対策
- **XSS攻撃防止**: HTMLエンティティエンコーディング
- **SQLインジェクション対策**: 危険パターンの検出・ブロック
- **CSRF攻撃防止**: リファラーチェック
- **DoS攻撃対策**: レート制限機能
- **機密情報保護**: 環境変数管理

### 📋 セキュリティチェックリスト
- [ ] APIエンドポイントの機密性確保
- [ ] 入力データの適切なサニタイゼーション
- [ ] レート制限の正常動作確認
- [ ] アクセスログの監視

詳細は [SECURITY.md](./SECURITY.md) をご覧ください。

## 🤝 貢献方法

### 🐛 バグ報告
[Issues](../../issues)で新しいIssueを作成してください。バグ報告テンプレートをご利用ください。

### 💡 機能要求
新機能のアイデアがある場合は、[Issues](../../issues)で機能要求テンプレートを使用してください。

### 🔧 プルリクエスト
1. このリポジトリをフォーク
2. 機能ブランチを作成 (`git checkout -b feature/amazing-feature`)
3. 変更をコミット (`git commit -m 'Add amazing feature'`)
4. ブランチにプッシュ (`git push origin feature/amazing-feature`)
5. プルリクエストを作成

