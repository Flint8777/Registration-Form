# 気仙沼星空観望会 予約システム

[![GitHub Pages](https://img.shields.io/badge/demo-live-brightgreen)](https://flint8777.github.io/TEST_KesenNuma-StarryNight/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Security](https://img.shields.io/badge/security-enterprise--grade-blue)](#-セキュリティ機能)

## 概要

気仙沼で開催される星空観望会の予約システムです。参加者が簡単に予約できるWebアプリケーション。

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
- 権限の分離: GAS と予約のシートは幹部のアカウントが持ち、チームのアカウントは閲覧だけ
- ボット対策: Cloudflare Turnstile（ふだんは画面に何も出ない）
- 入力検証: フロントと GAS の両方で検証。GAS は選択肢・範囲・長さ・形式を確かめる
- 定員: 残席の確認から書き込みまでを排他にし、同時の申込で定員を超えない
- XSS 対策: `escapeHtml()` による出力エスケープと CSP

### 個人情報保護
- フォーム内にプライバシーポリシーを掲載（折りたたみ式）
- 送信前に個人情報取り扱いへの同意チェックを必須化
- メールアドレスの確認入力による誤送信防止
- 完了画面に予約変更・データ削除の問い合わせ先を表示

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

#### 2. スプレッドシートの準備
幹部のアカウントで空のスプレッドシートを作る。中身は GAS の `setupSheet` が作る。

#### 3. Google Apps Script の設定（幹部のアカウント）
1. script.google.com で独立型のプロジェクトを作り、タイムゾーンを東京にする
2. `apps-script/reservation/` の `Code.gs`・`Logic.gs`・`Event.gs` を、同じ名前のファイルに貼る
3. スクリプト プロパティを入れる
   - `SPREADSHEET_ID`: 予約のシートの ID
   - `TURNSTILE_SECRET`: Turnstile の秘密鍵
   - `TURNSTILE_HOSTNAMES`: フォームを置くホスト名（本番は `flint8777.github.io`）
4. `setupSheet` を一度だけ実行する
5. ウェブアプリとしてデプロイする（実行ユーザー: 自分、アクセス: 全員）
6. 確認メールをチームのアドレスから送るため、幹部のアカウントの Gmail で「他のアドレスとして送信」にチームのアドレスを登録しておく

コードを変えたら、貼り直したうえで「デプロイを管理」から新バージョンにする。保存しただけでは公開中の版に反映されない。

#### 4. フロントの設定
`config.js` に GAS の URL と Turnstile のサイトキーを書く。どちらもブラウザから見える値なので、コミットしてよい。

```javascript
const SITE_CONFIG = {
    API_URL: 'https://script.google.com/macros/s/<デプロイ ID>/exec',
    TURNSTILE_SITEKEY: '<サイトキー>'
};
```

#### 5. 試験
- `Logic.gs` のテスト: `node --test "apps-script/reservation/test/*.test.mjs"`
- 申込の試験: GAS エディタで `startTestMode` → フォームから申し込む → シートの試験の行を消す → `endTestMode`。試験モードの間は BCC を付けず、件名に【試験】を付ける

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
├── config.js               # GAS の URL と Turnstile のサイトキー（公開してよい値）
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
├── apps-script/             # GAS バックエンド（幹部のアカウントのエディタに手で貼る）
│   └── reservation/
│       ├── Code.gs              # doGet（残席）・doPost（申込）、シート・Gmail の操作
│       ├── Logic.gs             # 入力検査・残席計算・メール本文（Google のサービスに依存しない）
│       ├── Event.gs             # 回ごとに変える値（題名・日時・会場・部と定員）
│       ├── appsscript.json      # Apps Script マニフェスト（参考）
│       └── test/                # Logic.gs の Node テスト
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
- 入力検証と基本的なセキュリティ対策（XSS、ボット対策、定員の排他など）

セットアップ（開発/運用）
----
1. リポジトリをクローン

    git clone https://github.com/flint8777/TEST_KesenNuma-StarryNight.git
    cd TEST_KesenNuma-StarryNight

2. 以降の手順は、上の「セットアップ」の 2〜5 を参照してください。

プロジェクト構成（主なファイル）
----
- index.html
- styles.css
- script.js
- iframe-embed-codes.html
- config.js（GAS の URL と Turnstile のサイトキー）
- manifest.json
- SECURITY.md
- Images/
- apps-script/reservation/（GAS バックエンド: Code.gs・Logic.gs・Event.gs）

注意事項
----
- 回ごとに `apps-script/reservation/Event.gs` の題名・受付期間・日時・会場・部を書き換えてください。部の名前はフォームとシートにそのまま出ます。受付期間の外では、フォームは案内だけを出し、GAS も申込を断ります。
- 公開前に SECURITY.md のチェックリストを確かめてください。

履歴
----
- v2.1.0 (2025-08-20): UI/表示改善（選択肢統一、残席表示の簡略化、Analytics 削除）
- v2.0.0 (2025-08-20): SEO/OGP、PWA 準備、画像整理
- v1.0.0 (2025-08-19): 初回リリース

ライセンス
----
MIT License

