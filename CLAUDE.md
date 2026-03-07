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
  - 残席データ取得: `loadWorkshopParts()`, `loadPlanetariumParts()` で GAS API から JSONP で取得
  - 残席表示: `updatePartOptions()`, `updatePlanetariumPartOptions()` で残席に応じた選択肢の有効/無効/グレーアウトを制御
  - フォーム送信: `submitForm()` で隠し iframe 経由で GAS API へ POST。送信エラー・タイムアウト時にユーザーへ通知
- **styles.css**: レスポンシブデザイン、グレーアウト表示、アクセシビリティ対応スタイル
  - `[aria-hidden="true"]:not(.conditional-field)` で非表示制御。`.conditional-field` は独自の表示切替を使用

### バックエンド（Google Apps Script、別途配置）

- `Code.gs`: メイン API（予約受付、残席照会、確認メール送信）
- `setup-environment.gs`: 環境変数設定スクリプト
- GAS のウェブアプリとしてデプロイし、`config.js` の `API_URL` に設定

### 通信方式

- 残席データ取得: JSONP（`fetchWithJsonp()`）
- フォーム送信: 隠し iframe + 動的 form で POST

## 注意事項

- フォームの各フィールドは日本語の `id`/`name` 属性を使用（例: `id="代表者氏名"`）
- ワークショップ・プラネタリウムの参加選択肢は `'はい'` / `'いいえ'`（コード内で比較する際に注意）
- iframe 埋め込みでの利用を想定（`closeIframe()` や `postMessage` による親ウィンドウ通信あり）
- `config.js` は `.gitignore` に含まれておりコミット禁止
- `innerHTML` にユーザー入力を埋め込む場合は必ず `escapeHtml()` を使用すること
