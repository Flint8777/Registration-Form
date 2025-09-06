# 気仙沼星空観望会 予約システム

[![GitHub Pages](https://img.shields.io/badge/demo-live-brightgreen)](https://flint8777.github.io/TEST_KesenNuma-StarryNight/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Security](https://img.shields.io/badge/security-enterprise--grade-blue)](#-セキュリティ機能)

## 概要

気仙沼で開催される星空観望会の予約システムです。参加者が簡単に予約できるWebアプリケーションを提供し、地域の天体観測活動を支援します。

## ライブデモ

公開URL: https://flint8777.github.io/TEST_KesenNuma-StarryNight/

### デモサイトでお試しいただけること
- マルチステップフォーム: 直感的な予約体験
- レスポンシブデザイン: PC・スマートフォン対応
- リアルタイム検証: 入力時の即座フィードバック
- アクセシビリティ: キーボードナビゲーション・スクリーンリーダー対応
- セキュリティ機能: 入力検証・XSS対策のデモ

注意: デモサイトでは予約送信機能は無効です。完全な機能を利用するにはセットアップが必要です。

## 主要機能

### 予約機能
- マルチステップフォームによる直感的な予約プロセス
- 出席者数選択（1-100名）
- ワークショップ参加選択（はい/いいえ）
- プラネタリウム鑑賞予約（はい/いいえ）
- 時間帯別予約（残席あり/残席なし表示）
- 交通手段選択（条件付き車台数入力）
- 自動確認メール送信
- 全選択肢表示（無効選択肢はグレーアウト）

### セキュリティ機能
- 環境変数化: 設定の外部化・機密情報保護
- リファラーチェック: 不正サイトからのアクセス防止
- レート制限: DoS攻撃・スパム対策
- 入力検証: XSS・SQLインジェクション対策

### UI/UX機能
- レスポンシブデザイン（モバイル・タブレット・PC対応）
- アクセシビリティ対応（WCAG準拠）
- ローディング状態表示
- リアルタイムバリデーション
- 統一された選択肢（はい/いいえ形式）
- 全時間帯表示（残席あり/残席なし/残席不足）
- グレーアウト表示（選択不可選択肢の明確化）

### SEO・マーケティング機能
- SEO最適化: メタタグ・キーワード設定
- OGP対応: SNSシェア時の最適化表示
- Twitter Card: Twitter専用シェア設定
- PWA対応: Progressive Web App機能実装

### PWA機能（準備済み）
- ホーム画面追加: アプリライクな体験
- マニフェスト設定: アプリ情報・アイコン設定
- カスタム404ページ: 星空テーマのエラーページ

## セットアップ

### 前提条件
- Googleアカウント
- Google Apps Scriptの基本知識
- Gitの基本操作（オプション）

### インストール手順

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
1. Google Apps Scriptでプロジェクトを作成
2. `Code.gs`の内容をコピー&ペースト
3. ウェブアプリとしてデプロイ
   - 実行ユーザー: 自分
   - アクセス権: 全員
4. デプロイURLを`config.js`の`API_URL`に設定

#### 4. スプレッドシートの準備
1. Googleスプレッドシートを作成
2. 予約データ用のシートを準備
3. Apps Scriptからのアクセス権限を設定

### 環境変数設定
```javascript
// config.js での設定例
const CONFIG = {
    API_URL: 'https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec',
    MAX_PARTICIPANTS: 6,
    TIMEOUT_MS: 30000
};
```

### システム設定（オプション）

注意: 現在のシステムはGoogle Analyticsを使用しません。シンプルで軽量な構成になっています。

分析ツールが必要な場合は、以下を検討してください：
- Google Search Console（SEO分析）
- サーバーログ分析（GitHub Pagesのアクセス解析）
- 軽量な分析ツール（Umami、Plausibleなど）

## プロジェクト構造

```
├── index.html              # メインページ（SEO・OGP対応）
├── styles.css              # スタイルシート（グレーアウト対応含む）
├── script.js               # フロントエンド機能（統一UI・残席表示）
├── iframe-embed-codes.html # 埋め込みコード
├── config.example.js       # 設定テンプレート
├── config.js               # 実際の設定（Git非公開）
├── manifest.json           # PWA設定
├── README.md               # このファイル
├── SECURITY.md             # セキュリティガイド
├── LICENSE                 # MITライセンス
├── .gitignore              # Git除外設定
├── 404.html                # カスタム404ページ（星空テーマ）
├── Images/                 # 画像ファイル格納フォルダー
│   ├── 観望会ロゴタイプ_黒.png  # メインロゴ
│   ├── シンボルマーク.png      # ファビコン・アプリアイコン
│   └── OGP-image.png          # SNSシェア用画像
├── Google Apps Script/     # バックエンド（別途配置）
│   ├── Code.gs               # メインAPI
│   └── setup-environment.gs  # 環境変数設定
└── .github/                 # GitHub設定
    └── ISSUE_TEMPLATE/      # Issue テンプレート
```

## カスタマイズ

### デザインの変更
`styles.css`を編集してデザインをカスタマイズできます：
- カラーテーマの変更
- フォントの調整
- レイアウトの修正
- グレーアウト表示のスタイル調整

### 機能の追加
`script.js`で以下の機能を追加・修正できます：
- 新しい入力項目
- カスタムバリデーション
- 追加のUIエフェクト

### PWA設定のカスタマイズ
`manifest.json`を編集してPWAの設定を変更できます：
- アプリ名・説明の変更
- アイコンサイズの追加
- 表示モードの調整

### 画像の管理
`Images/`フォルダーで画像を管理：
- `シンボルマーク.png`: ファビコン・アプリアイコン用
- `OGP-image.png`: SNSシェア用専用画像
- `観望会ロゴタイプ_黒.png`: メインロゴ・404ページ用

## セキュリティについて

このプロジェクトはエンタープライズレベルのセキュリティ対策を実装しています：

### 実装済み対策
- XSS攻撃防止: HTMLエンティティエンコーディング
- SQLインジェクション対策: 危険パターンの検出・ブロック
- CSRF攻撃防止: リファラーチェック
- DoS攻撃対策: レート制限機能
- 機密情報保護: 環境変数管理

### セキュリティチェックリスト
- [ ] APIエンドポイントの機密性確保
- [ ] 入力データの適切なサニタイゼーション
- [ ] レート制限の正常動作確認
- [ ] アクセスログの監視

詳細は [SECURITY.md](./SECURITY.md) をご覧ください。

## 貢献方法

### バグ報告

公開サイト: https://flint8777.github.io/TEST_KesenNuma-StarryNight/

概要
----
このリポジトリは、気仙沼で実施する星空観望会の参加予約システムです。フロントエンドは静的サイト（GitHub Pages）でホストし、バックエンドは Google Apps Script を使用してスプレッドシートへ予約を記録します。

主な機能
----
- マルチステップの予約フォーム
- 出席者数の選択
- ワークショップ（はい/いいえ）の選択
- プラネタリウム（はい/いいえ）の選択
- 時間帯ごとの予約（残席あり/残席なしの表示）
- 残席不足や満席の時間帯は選択肢としてグレーアウト表示
- 入力検証と基本的なセキュリティ対策（XSS、レート制限など）

セットアップ（開発/運用）
----
1. リポジトリをクローン

    git clone https://github.com/flint8777/TEST_KesenNuma-StarryNight.git
    cd TEST_KesenNuma-StarryNight

2. 設定ファイルの準備

    - `config.example.js` をコピーして `config.js` を作成し、`API_URL` をデプロイ済みの Google Apps Script の URL に変更してください。

3. Google Apps Script のデプロイ

    - Google Apps Script に `Code.gs` と `setup-environment.gs` をアップロードし、ウェブアプリとしてデプロイします。実行ユーザーは適宜設定してください。

4. スプレッドシートの準備

    - 予約データ用のスプレッドシートを作成し、Apps Script からの書き込み権限を確認してください。

設定例
----
config.js の基本例:

```javascript
const CONFIG = {
  API_URL: 'https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec',
  MAX_PARTICIPANTS: 6,
  TIMEOUT_MS: 30000
}

```

プロジェクト構成（主なファイル）
----
- index.html
- styles.css
- script.js
- iframe-embed-codes.html
- config.example.js
- config.js (運用時は Git 管理外にすること)
- manifest.json
- SECURITY.md
- Images/
- Google Apps Script ファイル (Code.gs, setup-environment.gs)

注意事項
----
- デモ環境では一部機能（メール送信など）を無効化している場合があります。運用時は `setup-environment.gs` で環境変数を適切に設定してください。
- 本番では `ALLOW_DIRECT_ACCESS` や `ENABLE_REFERRER_CHECK` 等のセキュリティ設定を見直してください。

履歴
----
- v2.1.0 (2025-08-20): UI/表示改善（選択肢統一、残席表示の簡略化、Analytics 削除）
- v2.0.0 (2025-08-20): SEO/OGP、PWA 準備、画像整理
- v1.0.0 (2025-08-19): 初回リリース

ライセンス
----
MIT License
