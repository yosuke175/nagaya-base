# STATUS.md — NAGAYA-BASE 現況サマリー（1枚）

> 最終更新: 2026-07-05 ／ 目的: 別AI・別メンバーへの引き継ぎ。**これ一枚で全体像を把握**するための要約。
> 正典は `docs/`（architecture / requirements / gadget-spec / frontend-design）と `CLAUDE.md`。詳細な経緯は `docs/journal.md`。

## 1. これは何か

Honmono協会のAI活用勉強会が共同開発する「**プラットフォーム＋ガジェット**」型PWA。
世界観は「**長屋**」= プラットフォーム、「**道具**」= ガジェット、住人が道具を作り／使い合う場。

- **プラットフォーム**: React + Vite + TypeScript（PWA）、Cloudflare Pages 配信
- **API**: Cloudflare Pages Functions（`functions/`、Hono 相当の軽量ハンドラ）
- **認証・DB**: Supabase（Auth + Postgres + RLS）。service_role は Functions 内のみ
- **ガジェット**: sandboxed iframe。`gadget-sdk` の postMessage 経由でのみ長屋と通信
- **UIは日本語第一**。世界観の語彙（長屋/部屋/棚/道具/道具市/工房/大家/職人/店子/軒先/案内所）で統一。名称はハードコード禁止

## 2. 実装済みの主要機能

**入場・権限**
- ゲスト即入場（軒先＝匿名・閲覧のみ）／メール登録（入居者＝`user`）。サインアップトリガーでロール自動付与
- ロールは実質 `user` 1本（旧 `developer` は統合、enum は残置）＋ `admin`（大家）／`guest`（軒先）
- 権限はRLS＋Functions検証で二重防御。大家の間でロール付与・道具の緊急停止・アカウント削除
- 退去（本人によるアカウント削除）。作った道具は「長屋に残す（既定）／下げる」の2択。著作権はUIに出さない（ADR-006）

**道具（ガジェット）**
- 道具市（カタログ）、インストール／アンインストール、承認カード（権限同意・`installations.granted_permissions` に永続化）
- 棚に複数のフローティング窓（ドラッグ移動・リサイズ、配置は端末保存）
- 工房（職人の開発入口）、道具のGUI編集（表示名・説明・カバー画像をmanifestを触らずDB上書き）
- 入居者ページ（開発した道具・導入した道具を表示、そこからインストール）
- 実証ガジェット `schedule-secretary`（GAS橋方式の予定管理、AI相談、ツール開放 list/create）

**AI**
- `gadget.ai`: ガジェット内蔵AI。BYOK（本人キー）で anthropic/openai/google を Functions が各社形式に変換して代理実行。キーは iframe に渡さない。`tier:'fast'|'smart'` でモデル解決
- `/api/ai` ゲートウェイ: 復号はサーバ内のみ、利用量記録（`ai_usage`）／レート制限（1h/120回）／モデル許可リスト
- **案内AI（アシスタント）**: 下部常駐の単一窓。**段1**（ステートレス＋.md の RAG＋状態票）、**段2**（文脈追従＋承認つき操作補助 `nagaya-action`）、**ADR-011 ツール開放**（`nagaya-tool` で棚に開いた道具の read/act を横断呼び出し、read自動・act承認）まで実装
- **案内AIはBYOK前提**。AI未設定なら窓自体を出さない（費用は各自負担のため）
- **ペルソナ**: 10種の見た目（下女/丁稚/女中/書生/メイド/執事/秘書/番頭/女将/旦那）＋性格・話し方＋基本情報を設定可。自分の画像も適用可（端末ローカル保存）

**情報系レイヤー（一方向のみ。双方向は意図的に未実装）**
- 回覧板（お知らせ）／速報！（公開の自動フィード）／長屋暦（カレンダー）／案内所（.md記事）／長屋の歩み（進捗）

**周辺**
- RAG基盤: pgvector `doc_chunks` ＋ `match_doc_chunks` RPC、`npm run reindex`、`.md` push で GitHub Actions 自動再索引
- クレデンシャル暗号化保管（AES-GCM、`user_credentials`）、独自SMTP（Brevo）、セットアップウィザード（Electron）、CLA自動チェック

## 3. ディレクトリ構成（役割）

```
platform/          プラットフォーム本体（React PWA）
  src/App.tsx        画面ルーティング・ヘッダー・全体状態
  src/components/     各画面（ダッシュボード/道具市/入居者/情報系/GuideAssistant 等）
  src/host/          iframeホスト・SDK受け口・AI設定・承認・ツール登録簿・persona 等の中核ロジック
  src/content/help/  案内所の記事（*.md、RAG対象）
  src/auth /lib /theme  認証・共通関数・テーマ
functions/api/     Pages Functions（軽量API）: ai / credentials / admin / leave（+ _shared）
  ※Cloudflare Pages の仕様でリポジトリ直下に置く必要がある（platform/配下は不可）
packages/gadget-sdk/  ガジェット開発者に配布するSDK（postMessage API・型・マニフェスト契約）
gadgets/           コミュニティ製ガジェット（_template 雛形／schedule-secretary）
supabase/migrations/  DBマイグレーション（SQLのみ・追記のみ・手動適用）
docs/              仕様・設計の正典（architecture / requirements / gadget-spec / frontend-design / backlog / journal）
tools/             setup-wizard（Electron）／reindex（RAG索引作成）
assets/            画像原本（src/naviai にペルソナ原本など）→ 最適化して platform/public/img へ
workers/           独立Workers（バッチ等・現状ほぼ未使用）
```

## 4. 確定している設計判断（ADR要点）

正典 `docs/architecture.md`。

- **ADR-001 実行モデル**: ガジェットは sandboxed iframe＋postMessage SDK のみ。ガジェットからSupabase/API直叩き禁止。プラットフォーム操作＝アシスタント側、ガジェット内部は操作しない
- **ADR-002 monorepo**: npm workspaces
- **ADR-003 認証・認可**: Supabase Auth＋ロール＋RLS。権限は必ずRLS＋サーバ検証で二重化
- **ADR-004 ホスティング**: Cloudflare Pages/Workers＋Supabase
- **ADR-005 外部連携**: 非restrictedスコープ＋BYOK。Googleフルアクセス系スコープ禁止。クレデンシャルはAES-GCMでサーバ保管
- **ADR-006 ライセンス**: CLA＋ソース公開・商用権留保。**著作権は作者に残り、CLA許諾は撤回不可**。放棄させない（B2B価値保護）。LICENSE/ヘッダは変更禁止
- **ADR-007 Google連携**: GAS橋方式（BYOK）。ユーザーが自分のApps Scriptを貼る
- **ADR-008 ガジェットへのAI提供**: 口は `gadget.ai` 単一。裏は将来AIゲートウェイに差し替え可能（現 `/api/ai`）
- **ADR-010 案内AIと記憶**: 段1（ステートレス＋RAG＋状態票）／段2（文脈追従・操作補助）／段3（永続記憶＝要・権利/プライバシー整理）。埋め込みキーはプラットフォーム保有1本（Anthropicに埋め込みAPIが無いため）
- **ADR-011 ツール開放**: 単一アシスタントが、ガジェット宣言のツール（read/act）を横断呼び出し（MCP的）。opt-in・既定OFF・act承認必須・`gadget.ai`と共存・ステートレスで成立
  - ※ADR-009 は欠番

**2軸の独立（重要な設計観）**: 軸A=ガジェット内部AI（`gadget.ai`）／軸B=案内AIへのツール開放（`aiTools`）は独立。非AIガジェットでもツール口を開けば案内AIが操作できる。ただし案内AIの判断は本人BYOKを使うため、案内AI利用にはBYOKが前提。

## 5. 未決・進行中（backlog）

- **#13 案内AI段3（永続記憶）**: セッション跨ぎの記憶。**要・権利/プライバシー整理と創業者条項**。目的地だが慎重に
- **#16 ADR-011 P4**: PC個別会話／棚に開いていない道具の呼び出し／段3統合／実機E2E
- **#17 streaming**: `gadget.ai.stream()`（真のトークンstreaming）。現状は進捗表示で代替
- **#15 共通埋め込みキーの協会引き取り**: プラットフォーム負担分の費用精算（運営移管時）
- **#5 開発フローのPR全面移行**: **建立会（メンバー初参加日）当日に直push停止→全PR経由へ**。それまではadmin直push継続
- **#8 SMTPのDKIM認証**: DNSがWix管理。未認証でも到達は問題なし（身内運用は現状維持）
- **#6 交流レイヤー フェーズ2（双方向）**: 過疎の可視化を避けるため意図的に保留（実働入居者が増えるまで）
- 運用: マイグレーションは向井が Supabase SQL Editor で**手動適用**（18本＋直近の RAG/visit/cost 系は適用済み）

## 6. 最近の大きな変更点（直近）

1. **ペルソナ機能**（2026-07-05）: 案内AIに見た目10種＋性格・話し方＋基本情報。窓の上にバナー表示、自分の画像も適用可
2. **案内AIの窓ゲート**（2026-07-05）: AI未設定なら窓を出さない（費用は各自BYOK負担のため）
3. **ADR-011 ツール開放 実装**（2026-07-05）: `aiTools`/`ai-tools`権限/`onToolInvoke`/host↔gadget RPC、案内AIのタグ方式ツールループ（read自動・act承認）、schedule-secretary で実証
4. **#17 tier**（2026-07-05）: `gadget.ai.complete({tier})` でモデル解決
5. **#18 学びの3段階**（2026-07-05）: 案内所に記事。①非AI ②AI搭載(BYOK) ③案内AIに操作許可、店子/職人の対称カリキュラム
6. **RAG稼働**（2026-07-05）: pgvector＋reindex＋CI自動再索引。埋め込みはプラットフォームキー1本

---
*不明点は `docs/journal.md`（時系列の意思決定ログ）と `docs/backlog.md`（未決トラッカー）を参照。*
