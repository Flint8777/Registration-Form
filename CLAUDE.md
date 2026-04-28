# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## プロジェクト概要

気仙沼星空観望会の予約システム。フロントエンドは静的サイト（GitHub Pages）、バックエンドは Google Apps Script + スプレッドシートで構成。ビルドツールやパッケージマネージャーは使用していない純粋な HTML/CSS/JS プロジェクト。

## 開発方法

- ビルド不要。ブラウザで `index.html` を直接開くか、ローカルサーバーで確認
- `config.js`（Git管理外）に API エンドポイント等の設定を記述。テンプレートは `config.example.js`
- `config.js` の変数名は `SITE_CONFIG`。`script.js` の `CONFIG.API_URL` が `SITE_CONFIG.API_URL` を参照する
- テストフレームワークは未導入

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
  - フォーム送信: `submitForm()` で隠し iframe 経由で GAS API へ POST。送信エラー・タイムアウト時にユーザーへ通知
- **styles.css**: レスポンシブデザイン、グレーアウト表示、アクセシビリティ対応スタイル
  - `[aria-hidden="true"]:not(.conditional-field)` で非表示制御。`.conditional-field` は独自の表示切替を使用

### バックエンド（`apps-script/KB/`）

- `Code.gs`: メイン API（doGet/doPost、入力検証、メール送信、レート制限）
- `setup-environment.example.gs`: Script Properties セットアップのテンプレート
- 実値版 `setup-environment.gs` および `Temp.gs` は `.gitignore` で除外。Apps Script エディタ側のみで管理
- `kanbokaidaisakusen@gmail.com` はプロジェクトの公開連絡先（秘密情報ではない）

### 通信方式

- 残席データ取得: `fetchJson()`（fetch + JSON、CSP の `connect-src` で GAS を許可済み）
- フォーム送信: 隠し iframe + 動的 form で POST（CORS 回避のため）

## 注意事項

- フォームの各フィールドは日本語の `id`/`name` 属性を使用（例: `id="代表者氏名"`）
- ワークショップ・プラネタリウムの参加選択肢は `'はい'` / `'いいえ'`（コード内で比較する際に注意）
- iframe 埋め込みでの利用を想定（`closeIframe()` や `postMessage` による親ウィンドウ通信あり）
- `config.js` は `.gitignore` に含まれておりコミット禁止
- `innerHTML` にユーザー入力を埋め込む場合は必ず `escapeHtml()` を使用すること
- GAS 側でユーザー入力をログに出すときは `summarizeFormData()` または `maskEmail()` を通すこと（Cloud Logging に PII を残さない）
- GAS 側の検証ロジック（`validateInput`/`validateFormData`）の catch 節は **fail-closed**（`valid: false` を返す）
- 外部リソースを追加する場合は `index.html` の CSP メタタグ（`script-src` / `connect-src` / `img-src` 等）を必ず更新する
- `apps-script/KB/Code.gs` は CRLF。Edit/Write 後 `git ls-files --eol` で確認し、LF 化していたら Python で `b'\r\n'` 化して復元する
