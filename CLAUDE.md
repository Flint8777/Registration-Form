# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## プロジェクト概要

気仙沼星空観望会の予約システム。フロントエンドは静的サイト（GitHub Pages）、バックエンドは Google Apps Script + スプレッドシートで構成。ビルドツールやパッケージマネージャーは使用していない純粋な HTML/CSS/JS プロジェクト。

## 開発方法

- ビルド不要。ブラウザで `index.html` を直接開くか、ローカルサーバーで確認
- `config.js` の `SITE_CONFIG` に GAS の URL（`API_URL`）と Turnstile のサイトキー（`TURNSTILE_SITEKEY`）を書く。どちらもフォームを開いた人のブラウザから見える値で秘密ではないので、コミットする
- `script.js` の `CONFIG.API_URL` が `SITE_CONFIG.API_URL` を参照する
- GAS の `Logic.gs` は Node のテストがある: `node --test "apps-script/reservation/test/*.test.mjs"`。フロントのテストは未導入

## アーキテクチャ

### フロントエンド（このリポジトリ）

- **index.html**: 4ステップのマルチステップフォーム（基本情報 → ワークショップ詳細 → プラネタリウム詳細 → 完了）
  - プライバシーポリシーは `<details>` で折りたたみ表示
  - 送信前に個人情報取り扱いへの同意チェックボックスあり
  - メールアドレスは確認入力フィールドで一致チェック
  - `novalidate` 属性でブラウザネイティブバリデーションを無効化（JS で制御）
- **script.js**: 全ロジックを1ファイルに集約
  - `escapeHtml()`: XSS 対策の HTML エスケープ関数。`innerHTML` にユーザー入力を埋め込む箇所で必ず使用すること
  - `AccessibilityManager` クラス: スクリーンリーダー対応、フォーカス管理
  - `CONFIG` オブジェクト: ステップ定数、セレクタ、CSSクラス名を一元管理。API URL は `SITE_CONFIG` から取得
  - ステップナビゲーション: `updateStep()`, `nextStep()`, `previousStep()` でフォーム遷移を制御
  - 残席データ取得: `loadWorkshopParts()`, `loadPlanetariumParts()` で GAS API から `fetchJson()`（fetch + JSON）で取得
  - 残席表示: `updatePartOptions()`, `updatePlanetariumPartOptions()` で残席に応じた選択肢の有効/無効/グレーアウトを制御
  - フォーム送信: `submitForm()` で Turnstile のトークンを取り、`fetchJson()` で GAS に POST して返事を読む。断られたら理由を出して今の画面に留まる
- **styles.css**: レスポンシブデザイン、グレーアウト表示、アクセシビリティ対応スタイル
  - `[aria-hidden="true"]:not(.conditional-field)` で非表示制御。`.conditional-field` は独自の表示切替を使用

### バックエンド（`apps-script/reservation/`）

- 幹部のアカウントの独立型 GAS「気仙沼星空観望会_予約受付」としてウェブアプリで公開している。予約のシートも幹部のアカウントが持ち、チームのアカウントには閲覧だけを渡す
- コードはエディタに手で貼る（clasp は使わない。幹部のアカウントのトークンをパソコンに置かないため）。貼ったら「デプロイを管理」で新バージョンにしないと公開中の版に反映されない
- `Event.gs`: 回ごとに変える値（題名・日時・会場・部と定員）
- `Logic.gs`: Google のサービスに依存しない入力検査・残席計算・メール本文
- `Code.gs`: `doGet`（残席）・`doPost`（申込）とシート・Gmail の操作。エディタから手で実行する `setupSheet` / `resendFailedConfirmations` / `startTestMode` / `endTestMode` もここ
- スクリプト プロパティ: `SPREADSHEET_ID` / `TURNSTILE_SECRET` / `TURNSTILE_HOSTNAMES` / `TEST_MODE`
- 確認メールは幹部のアカウントの「他のアドレスとして送信」でチームのアドレスを差出人にして送り、BCC でチームに控えを残す
- `kanbokaidaisakusen@gmail.com` はプロジェクトの公開連絡先（秘密情報ではない）

### 通信方式

- 残席データ取得: `fetchJson()`（fetch + JSON、CSP の `connect-src` で GAS を許可済み）
- フォーム送信: `fetchJson()` で POST。body は `URLSearchParams` にする（単純リクエストになり、事前の確認要求が飛ばない）。GAS は JSON で `success` / `error` / `errors` / `emailSent` を返す

## 注意事項

- フォームの各フィールドは日本語の `id`/`name` 属性を使用（例: `id="代表者氏名"`）。GAS の `Logic.gs` の選択肢（`FORM_CHOICES`）と部の名前（`Event.gs`）はフォームと同じ値にそろえる
- ワークショップ・プラネタリウムの参加選択肢は `'はい'` / `'いいえ'`（コード内で比較する際に注意）
- iframe 埋め込みでの利用を想定（`closeIframe()` や `postMessage` による親ウィンドウ通信あり）
- `innerHTML` にユーザー入力を埋め込む場合は必ず `escapeHtml()` を使用すること
- GAS のログに申込の値（氏名・メールアドレスなど）を出さない
- 申込の試験は `startTestMode` → 試す → シートの試験の行を消す → `endTestMode`。試験モードの間は BCC を付けず、件名に【試験】を付ける
- 外部リソースを追加する場合は `index.html` の CSP メタタグ（`script-src` / `connect-src` / `img-src` 等）を必ず更新する
- `script.js` / `index.html` / `CLAUDE.md` は CRLF。Edit/Write 後 `git ls-files --eol` で確認し、LF 化していたら Python で `b'\r\n'` 化して復元する
