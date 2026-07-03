# journal.md — 開発ジャーナル

日々の変更・決定・未決事項の記録。新しい日付を上に追記する。

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
