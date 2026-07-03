# journal.md — 開発ジャーナル

日々の変更・決定・未決事項の記録。新しい日付を上に追記する。

## 2026-07-03（追記: CLA 自動チェック導入）

- `.github/workflows/cla.yml` を追加（contributor-assistant/github-action v2.6.1、
  CLA Assistant Lite）。対象文書は CLA.md、署名記録は**リポジトリ内**
  `cla-signatures` ブランチの `signatures/cla.json`。bot はallowlistで除外。
  未署名者への依頼コメントは日本語カスタム文（署名フレーズは既定の英文のまま）
- **テストPR（#2）で動作確認済み**:
  1. PR作成 → CLA Assistant が同意依頼コメントを投稿し、チェック `cla-assistant` が fail
  2. 「I have read the CLA Document and I hereby sign the CLA」をコメント
     → チェックが **pass** に変化
  3. `cla-signatures` ブランチの signatures/cla.json に署名記録
     （name: yosuke175 / PR #2 / comment_id / 日時）が保存されたことを確認
  4. テストPRはクローズ（マージなし）、ブランチ削除済み
- 気づき: **main のブランチ保護（PR必須）が有効化されており、admin の直 push は
  "Bypassed rule violations" 警告付きで通る状態**。今後の開発フロー（直push継続 or
  全てPR経由）は要決定

## 2026-07-03（追記: backlog #4 実施 — /api/ai 代理実行）

- セキュリティ検収の指摘（平文AIキーがブラウザに返る）を解消:
  - `functions/api/ai.ts` 新設: status / set / delete / complete を提供。
    復号とAnthropic呼び出しは**サーバー側のみ**で行い、クライアントには生成テキストと
    非秘匿メタ情報（registered / model）だけを返す。認証は credentials と同じ
    `requireUserId`（Supabase トークン検証）。model のみの更新は既存キーを
    サーバー内で引き継ぎ（平文がブラウザを経由しない）
  - `/api/credentials` は credential_id `platform-ai` を**全アクション403で拒否**
    （AIキーは /api/ai 専用。get からの除外を包含）
  - 共通処理を `functions/api/_shared.ts` に集約（`_` 始まりはルーティング対象外）
  - クライアント: `gadgetHost.completeWithPlatformAi` はログイン時 `/api/ai` 経由に変更。
    AI設定ダイアログはキーを表示しない（登録済み表示+変更時のみ入力）。
    未ログイン/ローカル dev は従来の端末内直呼びフォールバック（挙動不変）
- これで AI キーの平文が存在する場所は「ユーザーの入力欄（登録の瞬間）」と
  「Pages Function 内」のみ。ADR-008 ゲートウェイの残りは利用量記録・レート制限・
  モデル許可リスト（backlog #3）

## 2026-07-03（追記: ADR-005 実装のセキュリティ検収）

5観点の検収結果。コード参照つき。

1. **暗号鍵の置き場所 — 合格**。AES鍵（CREDENTIALS_ENCRYPTION_KEY）の参照は
   `functions/api/credentials.ts` の `env.CREDENTIALS_ENCRYPTION_KEY` のみ。リポジトリ内の
   文字列ヒットは同ファイルと手順文書（README/journal）だけで、鍵の値はどこにもない。
   VITE_ プレフィックスでないため Vite のクライアント埋め込み対象外
   （`platform/.env` は VITE_APP_NAME / VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY のみ）。
   ビルド成果物 `platform/dist/assets/index-*.js` に該当文字列なしを実測確認。
   Supabase に保存されるのは ciphertext と iv のみ（鍵は保存しない）
2. **平文キーの到達範囲 — 要改善（唯一の指摘）**。`/api/credentials` の `get` は復号済み
   平文を `{ value }` でクライアント（`platform/src/host/credentialsApi.ts`）に返す。
   gadget.ai は Function の代理実行では**なく**、`platform/src/host/gadgetHost.ts` の
   `completeWithPlatformAi()` がブラウザから Anthropic を直接呼ぶ。iframe には渡らないが、
   **platform オリジンの XSS 一撃で窃取できる距離**にある。評価: AI キーは本来クライアントに
   返す必要がないため、`/api/ai`（Function 代理実行）への前倒し移行を推奨（backlog #4）。
   GAS 等の BYOK はガジェット実行コンテキストへ渡す契約（gadget-spec の getCredential、
   ADR-005 の「受け渡し時のみ」）のため現状が仕様どおり
3. **復号APIの認証 — 合格（Supabase Auth）**。`functions/api/credentials.ts` の
   `requireUserId()` が Authorization: Bearer のアクセストークンを
   `GET {SUPABASE_URL}/auth/v1/user` で検証し、**検証済みの user.id** を行キーに使う
   （リクエストボディ由来の ID は使わない）。トークン無効は 401。本人への紐づけは
   Supabase ログインセッションそのもの。Cookie 認証でないため CSRF 不成立。
   レート制限は未実装（ゲートウェイ移行時、backlog #3）
4. **Supabase側の防御 — 合格**。`20260703010000_user_credentials.sql`: RLS 有効かつ
   **ポリシーゼロ**（クライアントロールはデフォルト拒否）、grant は service_role のみ。
   anon での SELECT が "permission denied" になることを実測確認。service_role キーは
   platform/src・クライアントバンドルに文字列ヒットなし（DO NOT 1 遵守）。存在場所は
   Pages の Secret のみ。DB 単独漏洩でも中身は AES-GCM 暗号文（鍵は Cloudflare 側）
5. **GASクレデンシャル — 移行済み**。`gadgetHost.ts` の `credentialStore` は
   `gadget:<gadgetId>:<serviceId>` の credential_id で同じ `/api/credentials` に保存
   （AI設定は `platform-ai`）。schedule-secretary の GAS URL+合言葉も対象。
   未ログイン・ローカル開発時は localStorage フォールバック（設計どおり）

## 2026-07-03（追記: 文書の整合性メンテナンス）

- 本番でクレデンシャル暗号化保管の稼働を確認（/api/credentials が 204、
  user_credentials テーブル適用済み・匿名アクセス遮断を外形確認）
- ADR-007（GAS橋方式）/ ADR-008（gadget.ai 単一の口 + AIゲートウェイ）を
  architecture.md に起草（backlog #2 完了・#3 は実装のみ残）
- CLAUDE.md の構成図を実態に合わせ修正（Pages Functions はリポジトリ直下 `functions/`）
- requirements.md §4.2 に「AI による文章生成」を追加

## 2026-07-03（追記: クレデンシャルのサーバー側暗号化保管）

### 変更

- `functions/api/credentials.ts`（Pages Function）を新設: Supabase トークン検証 →
  AES-GCM（鍵は Pages Secret、AAD=user:credential でスワップ防止）→ `user_credentials`
  テーブルへ service_role で保存。クライアントは復号済みの値のみ受け取る（ADR-005 準拠）
- マイグレーション `20260703010000_user_credentials.sql`: RLS有効・ポリシーなし
  （クライアントからは一切読めない。アクセスは Function 経由のみ）
- AI設定・BYOK クレデンシャルは「**ログイン + Function 稼働ならアカウント保存（全端末共有）**、
  それ以外は従来どおり端末内保存」に自動フォールバック。AI設定ダイアログに保存先を表示

### 決定

- Pages Functions は Cloudflare の仕様上リポジトリ直下 `functions/` に配置
  （CLAUDE.md 構成図の `platform/functions/` と差異 → 文書側の更新は要判断）

### 未決（このイテレーション分）

- Cloudflare Pages への Secret 設定（SUPABASE_SERVICE_ROLE_KEY / CREDENTIALS_ENCRYPTION_KEY）
  と `user_credentials` マイグレーション適用 → 向井の作業待ち。未設定の間は端末保存で動作
- 鍵ローテーション手順の文書化

## 2026-07-03

### 変更

- **gadget.ai API 新設**（gadget-spec.md を v1.2 に更新）
  - 新権限 `ai` を追加。SDK に `gadget.ai.complete({ system, messages, maxTokens })`
  - 実装はホスト側 RPC: **API キーは iframe に一切渡らず**、platform がユーザー登録済みキーで
    Anthropic Messages API を呼び、テキストのみ返す（ADR-001 準拠）
  - キーはプラットフォーム設定に1つ（ヘッダー「AI設定」から登録。`platform-ai-settings`、
    gadget-credential とは別キー空間の localStorage モック、TODO(ADR-005) 記載）
  - モデルは設定値（既定 `claude-haiku-4-5`）。`ai` 呼び出しのみタイムアウト30秒。
    maxTokens はホスト側で 2000 に制限
- **schedule-secretary v0.2**: 「AIに相談」フロー（自由文/音声 → 直近7日の予定+個人ルールを
  添えて AI に依頼 → 挿入案を最大3件・理由つきカード表示 → 「この案で登録」で GAS create）。
  却下・再提案あり。JSON パースは頑健化（コードフェンス除去→失敗時1回再試行→エラー）。
  「個人ルール」自由記述欄を追加（gadget.storage 保存）
- テーマ機能（アクセント色のプリセット+自由選択、端末ごと保存）と30日分の予定取得（GAS の
  DAYS_TO_LIST=30。**各ユーザーの Apps Script 貼り直しが必要**）
- テスト 41 件（ai 権限許否 / キー未登録 / リクエスト検証 / レスポンス整形 / APIエラー等を追加）

### 決定

- ガジェットに見せる AI の口は `gadget.ai` のみに限定。裏側は将来 Workers の AI ゲートウェイ
  （ADR-008 候補、backlog #3）に差し替える前提。per-gadget の Anthropic BYOK 方式は不採用
- 5段階記憶+チャット常駐型の AI 秘書（foxgod-app 移植）は**保留**。試作は `wip/ai-secretary`
  ブランチに退避（v0.3 候補）

### 未決

- AI キー・BYOK クレデンシャルの暗号化保管（ADR-005 本実装、backlog #1）
- テーマ・AI設定のユーザー間同期（profiles.settings カラム追加のマイグレーション）
- 承認記録（granted_permissions）の installations テーブルへの移行
- 本番（pages.dev）でのマジックリンク動作確認（Supabase の Site URL 設定）
- ADR-007（GAS橋方式）/ ADR-008（AIゲートウェイ）の起草

## 2026-07-02

- Phase 1 scaffold 一式（SDK ハンドシェイク/storage、_template、platform ダッシュボード、
  Cloudflare Pages 対応、externalServices/BYOK、承認UI、ガジェット別CSP、カタログ、
  初期スキーマ+RLS、マジックリンク認証）。詳細は git log 参照
