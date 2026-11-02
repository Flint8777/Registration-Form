# セキュリティポリシー

本ドキュメントは「実装済みの対策」と「今後対応すべき項目（既知の課題）」を区別して記述する。
ドキュメントとコードを乖離させないため、未実装のものは正直に未実装と記す。

## 実装済みセキュリティ対策

### 1. 権限の分離
- GAS（`apps-script/reservation/`）と予約のシートは、幹部のアカウントが持つ。ログインできるのは少数の信頼できるメンバーだけ
- チームのアカウント（メンバーが共有でログインする）には、シートの閲覧だけを渡す
- GAS はシートに紐付けない独立型にしている。シートの編集者がコードやスクリプト プロパティを開けないようにするため

### 2. 公開してよい値と秘密の値
- `config.js` の GAS の URL と Turnstile のサイトキーは、フォームを開いた人のブラウザから必ず見える。秘密にできないのでコミットしている
- 秘密の値（`TURNSTILE_SECRET`・`SPREADSHEET_ID`）は GAS のスクリプト プロパティにだけ置き、リポジトリに書かない
- 守りは URL を隠すことではなく、URL を知った人にできることを減らすことで行う（3〜5）

### 3. ボット対策
- 申込の送信には Cloudflare Turnstile のトークンを付ける。GAS が siteverify で確かめ、ホスト名が `TURNSTILE_HOSTNAMES` にあるかも見る
- ウィジェットは Managed、`appearance: 'interaction-only'`。ふだんは画面に何も出ず、疑わしいときだけ確認の欄が出る

### 4. 入力検証（GAS 側）
- 選択肢にない値、範囲外の人数、長すぎる氏名、形の崩れたメールアドレス、制御文字を断る（`Logic.gs` の `validateReservation`．Node のテストあり）
- 知らない項目は捨てる。値は HTML の記号などに変換せず、そのまま保存する
- 先頭が `=` `+` `-` `@` などの値には `'` を付けて書き、シートの数式として読まれないようにする

### 5. 定員
- 残席の確認からシートへの書き込みまでを `LockService` で排他にし、同時の申込で定員を超えないようにする

### 6. 個人情報
- GAS のログに申込の値（氏名・メールアドレスなど）を出さない。メールの送信失敗も例外の種類だけを記録する
- 宛先を残す送信ログのシートは持たない。送信の成否はシートの「確認メール送信」の列にだけ残す
- 確認メールは、幹部のアカウントの「他のアドレスとして送信」でチームのアドレスを差出人にして送る。BCC でチームに控えを残す

### 7. XSS 対策と CSP
- ユーザ入力を `innerHTML` に直挿ししない（必要な箇所は `escapeHtml()` を通す）
- `index.html` の meta タグで CSP を適用している
  - `script-src` と `frame-src` は自サイトと Turnstile（`https://challenges.cloudflare.com`）だけ
  - `connect-src` は GAS（`script.google.com` / `script.googleusercontent.com`）だけ
  - `object-src 'none'`、`base-uri 'self'`

## 既知の課題 / 今後対応

- **保存期間**: 申込者の氏名・メールをいつ消すか未定（団体の承認待ち）。決まったらフォームの「個人情報の取り扱い」に書き、GAS で自動削除する
- **第 5 回の申込データ**: 旧シートの氏名・メールの削除は団体の承認待ち
- **1 日の送信上限**: 個人の Gmail の GAS は 1 日 100 宛先まで。BCC も数えるので、1 日約 50 件の申込を超えると確認メールが「失敗」になる。翌日に `resendFailedConfirmations` で送り直す
- **幹部のアカウントのアドレス**: 確認メールのヘッダー（`Return-Path`）に残る。受け取った人がソースを開けば見える
- **postMessage の targetOrigin**: `closeIframe` の通知を `'*'` に送っている。中身は個人情報を含まないが、埋め込み先のドメインに固定するのが望ましい
- **`frame-ancestors`**: meta タグでは効かない。GitHub Pages はヘッダーを設定できないので、埋め込み元の制限はできていない

## 機密情報の取り扱いガイドライン

- `TURNSTILE_SECRET` はスクリプト プロパティにだけ置く。漏れたら Cloudflare のダッシュボードで秘密鍵を作り直し、プロパティを差し替える
- エラーログ・スクリーンショット・LLM への質問文に秘密の値を貼り付けない
- GAS の URL は秘密ではない。止めたいときは「デプロイを管理」でアーカイブする

## 脆弱性報告

- **緊急度が高い場合**: GitHubの[Security Advisory](../../security/advisories)を使用
- **一般的な問題**: [Issues](../../issues)で報告
- 詳細を公開せず、まず開発チームに報告

## チェックリスト（公開前）

- [ ] Turnstile のウィジェットのホスト名と、スクリプト プロパティの `TURNSTILE_HOSTNAMES` に `localhost` が入っていないこと
- [ ] スクリプト プロパティに `TEST_MODE` が無いこと（`endTestMode` を実行済み）
- [ ] シートに試験の行が残っていないこと
- [ ] `Event.gs` の受付期間（`acceptFrom` / `acceptUntil`）が今回の回の値になっていること
- [ ] GAS の公開中の版が、リポジトリの `apps-script/reservation/` と同じコードであること
- [ ] シートをチームのアカウントと閲覧者として共有し、ダウンロード・コピー・印刷を止めていること
- [ ] `node --test "apps-script/reservation/test/*.test.mjs"` が通ること
- [ ] HTTPS 経由でのみ配信していること

## 参考資料

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [Google Apps Script セキュリティガイド](https://developers.google.com/apps-script/guides/security)
- [Cloudflare Turnstile: Validate the token](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/)
- [Web セキュリティ基礎 (MDN)](https://developer.mozilla.org/ja/docs/Web/Security)

---

**最終更新**: 2026年11月03日
**バージョン**: 2.0.0
