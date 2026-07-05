# architecture.md — 設計判断記録（ADR）v1.0

変更に高いコストが伴う「一方向ドア」の決定のみをここに記録する。
変更する場合は必ずADRを追記し（上書きしない）、関係者の合意を得ること。

---

## ADR-001: ガジェット実行モデル = sandboxed iframe + postMessage SDK

**決定**: ガジェットは `sandbox` 属性付き iframe 内で実行される独立した静的Webアプリとする。
プラットフォームとの通信は `packages/gadget-sdk` が提供する postMessage プロトコルのみ。

**理由**:
- 開発メンバーのスキルが不均一であり、悪意がなくても脆弱なコードは混入する前提に立つ。iframe隔離により、ガジェットの不具合・脆弱性がプラットフォームや他ガジェットのデータに波及しない
- ガジェットは任意のフレームワーク（React/Vue/素のJS/ノーコード出力）で書ける。「自分のAIやエディタで開発可能」という要件に直結
- Figma・旧iGoogle等で実証済みのモデル

**却下した代替案**:
- Web Components 直埋め込み: 隔離が甘く、CSS/グローバル汚染とトークン窃取リスク
- サーバサイドレンダリング統合: developerにplatform内部知識を要求してしまう

**制約**:
- iframe sandbox は `allow-scripts` のみ許可（`allow-same-origin` を付けない）
- ガジェットからの直接 fetch は自ガジェットのアセットと、マニフェストで宣言したBYOK先のみ（CSPで強制）
- ユーザーのSupabaseトークンをiframeに渡すことは、いかなる理由でも禁止

## ADR-002: リポジトリ = monorepo（npm workspaces）

**決定**: platform / gadget-sdk / gadgets を単一リポジトリで管理する。

**理由**: 実働10名規模では、マルチリポのCI整備・バージョン整合コストが人的リソースを超える。
SDKの型定義変更がガジェット側のCIで即座に検出できることが品質の生命線。

**制約**: gadgets/ 配下は各ガジェットのディレクトリで独立完結させる。
ガジェット間の相互import禁止（共通処理が欲しければSDKへの追加を提案する）。

## ADR-003: 認証・認可 = Supabase Auth + 4ロール + RLS

**決定**: 認証はSupabase Auth。ロールは `profiles.role`（enum: admin / developer / user / guest）で管理し、
全テーブルにRLSを適用する。認可の最終防衛線はRLSであり、UI・API側のチェックは補助とする。

**初期スキーマ（骨子）**:

```sql
-- ロール
create type app_role as enum ('admin', 'developer', 'user', 'guest');

create table profiles (
  id uuid primary key references auth.users,
  display_name text not null,
  role app_role not null default 'guest',
  created_at timestamptz default now()
);

-- ガジェット台帳
create table gadgets (
  id text primary key,                    -- 例: 'daily-scheduler'
  owner_id uuid references profiles(id),
  status text not null default 'draft',   -- draft / in_review / published / suspended
  created_at timestamptz default now()
);

create table gadget_versions (
  gadget_id text references gadgets(id),
  version text not null,                  -- semver
  manifest jsonb not null,                -- gadget-spec.md 準拠
  asset_path text not null,               -- 配信アセットの場所
  approved_by uuid references profiles(id),
  published_at timestamptz,
  primary key (gadget_id, version)
);

-- インストール状態
create table installations (
  user_id uuid references profiles(id),
  gadget_id text references gadgets(id),
  granted_permissions jsonb not null default '[]',
  settings jsonb not null default '{}',
  primary key (user_id, gadget_id)
);

-- ガジェット用ユーザー別KVストレージ
create table gadget_storage (
  user_id uuid references profiles(id),
  gadget_id text references gadgets(id),
  key text not null,
  value jsonb,
  updated_at timestamptz default now(),
  primary key (user_id, gadget_id, key)
);

-- 監査ログ
create table audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid,
  action text not null,
  target text,
  detail jsonb,
  created_at timestamptz default now()
);
```

**RLS方針の要点**:
- `gadget_storage` は (user_id = auth.uid()) かつ「該当ガジェットをインストール済み」の行のみ読み書き可
- `gadget_versions` の insert/update は owner（user以上）、`published_at` の設定はadminのみ
- guest はすべての書き込み不可

**追記（2026-07-04）: ロールモデルの更新**
- **入場・自己登録**: 匿名サインイン＝`guest`（閲覧のみ・即入場）、メール登録＝`user` を
  サインアップ時のトリガー（security definer）がサーバー側で付与する。クライアントは
  ロールを書かない（自己昇格の穴を作らない）。当初の「ロール付与はadminのみ」は、
  guest→user の自己登録を許可する方向に更新（Honmono内前提）。developer/admin への
  昇格は引き続き admin のみ
- **developer を user に統合**: 「何をもって職人か」の線引きができないため、入居者の
  ロールは `user` 1つとし、道具の登録・更新・公開も `user` に許可
  （`role_at_least('developer')` だったRLSを `'user'` に緩和）。`developer` は enum に
  残すが今後付与しない。「職人／店子」は自己申告の呼称で権限差はない

## ADR-004: ホスティング = Cloudflare Pages / Workers、DB = Supabase

**決定**: プラットフォームPWAとガジェットアセットは Cloudflare Pages、
サーバロジックは Pages Functions（必要に応じ独立Workers）、DBと認証はSupabase。

**理由**: 無料枠で NFR-02（月0〜1,000円）を満たす。向井および主要メンバーの既存運用ノウハウと一致。
静的アセット配信が無制限に近いCloudflareは「ガジェット=静的Webアプリ」モデルと相性が良い。

**コスト見積（勉強会フェーズ）**: Cloudflare 無料枠 + Supabase 無料枠で0円。
Supabase無料枠の休止仕様が問題になった段階でPro（$25/月）を検討し、その時点で協会予算化を判断する。

## ADR-005: 外部サービス連携 = 非restrictedスコープ + BYOK

**決定**:
1. プラットフォームのGoogle OAuthアプリが要求するのはログイン用の基本スコープと、
   将来的にも非restricted・非sensitiveスコープ（`drive.file` 等）まで
2. それを超える外部連携はすべてBYOK（ユーザー自身のAPIキー入力）方式
3. ガジェットは外部連携先をマニフェストの `externalServices` に事前宣言し、審査対象とする

**理由**: Googleのrestricted scopeはCASA年次評価（有償、外部評価機関、毎年更新）が必須で、
未検証アプリはプロジェクト生涯100ユーザー上限（リセット不可）。
コミュニティ運営の負担・リスクとして許容できない。
BYOKは各ユーザーが自分の責任範囲で権限とコストを管理するという要件の原則とも一致する。

**BYOKキーの保管**: `gadget_storage` に保存する前にWorkers側でAES-GCM暗号化（鍵はWorkers Secret）。
クライアントに復号済みキーを返すのは該当ガジェットの実行コンテキストへの受け渡し時のみ。

## ADR-006: CLA + ソース公開・商用権留保ライセンス

**決定**:
1. 全コントリビューターは初回PR前にCLAに同意する（CLA Assistant等でCIチェック）。
   CLAの内容: 貢献物について、Honmono協会（法人格が未整備の間は暫定的に向井庸祐個人）へ、
   商用利用を含む無制限の利用許諾を与える。著作者人格権は行使しない
2. リポジトリのライセンスは **Business Source License 1.1（BSL）** とする。
   - 追加利用許諾: 個人利用・勉強会内利用・非商用利用は自由
   - 商用利用（第三者への販売・SaaS提供）はライセンサー（協会）の許諾が必要
   - Change Date: 公開から4年後にApache 2.0へ自動移行
3. gadgets/ 配下の各ガジェットの著作権は作者に残るが、
   プラットフォーム上での配布・B2B同梱の許諾をCLAでカバーする

**理由**: MIT等の純OSSにすると、B2B販売時に競合が同一物を無償提供でき、事業価値が毀損される。
一方で完全クローズドはコミュニティ開発の透明性・参加動機を損なう。BSLは両立解。

**未決事項（Phase 0で確定）**:
- 収益発生時のコントリビューターへの分配有無（推奨: v1時点では「分配なし・クレジット表記あり」を明文化）
- 協会とstudio Ricordi間の権利関係の整理

## ADR-007: Google サービス連携 = GAS 橋方式（BYOK）

**決定**: ガジェットからのメンバー自身の Google サービス操作（カレンダー等）は、
**ユーザー自身が自分のアカウントにデプロイする GAS WebApp を「橋」として**行う。
参考実装: `gadgets/schedule-secretary/`（gas/Code.gs + gas/SETUP.md）。

**パターンの構成要素**:
1. ユーザーが GAS WebApp を「自分として実行・全員アクセス可」でデプロイし、
   URL + 合言葉（Script Properties の `SHARED_TOKEN`）をガジェットの連携設定に登録
2. ガジェットは `Content-Type: text/plain` で POST（GAS は CORS プリフライトに
   応答しないため。doPost 側は e.postData.contents で受けるので実害なし）
3. GAS の応答は `script.googleusercontent.com` への302リダイレクト経由で返るため、
   マニフェストの `baseUrls` には `script.google.com` と併せて両方を宣言する

**理由**: ADR-005（restricted scope 不使用）の制約下で Google 系操作を実現する現実解。
Google の権限はユーザー自身の GAS 内に閉じ、プラットフォームは一切仲介しない。

**リスクと対策**: URL+合言葉を知る者は誰でも当該カレンダー等を操作できる。
合言葉は20文字以上のランダム値とし、漏洩時は Script Properties の値変更で即時失効
（SETUP.md に明記）。「アクセス: 全員」は URL+合言葉の2要素を知らない限り実質無害。

## ADR-008: ガジェットへのAI提供 = gadget.ai 単一の口 + 将来のAIゲートウェイ

**決定**:
1. ガジェットが AI を使う口は SDK の `gadget.ai`（ホスト側RPC、permissions: "ai"）
   **のみ**とする。ガジェットから AI プロバイダへの直接 fetch は、`baseUrls` に
   宣言されていても審査で却下する
2. API キーはユーザー単位でプラットフォームが管理（「AI設定」）。キーは
   ガジェット iframe に一切渡さない（ADR-001 の帰結）。保管は ADR-005 に従い
   `functions/api/credentials.ts` で AES-GCM 暗号化して `user_credentials` へ
3. 現段階の呼び出し経路は「platform クライアント → Anthropic API 直接」。
   将来、Workers の **AIゲートウェイ**（サーバ側呼び出し・利用量記録(NFR-05)・
   レート制限・モデル許可リスト）へ差し替える。ガジェットに見せる口が
   `gadget.ai` だけであるため、この差し替えにガジェット側の変更は不要

**理由**: キーの秘匿（ADR-001/005）と、BYOK によるコスト自己管理（§5の原則）を
両立しつつ、実装の裏側を進化させられる抽象境界を最初から固定するため。

**却下した代替案**: ガジェットごとの AI プロバイダ BYOK（externalServices 方式）。
キーが複数箇所に散らばり、ゲートウェイ移行時に全ガジェットの改修が必要になる。

---

## ADR-010: 専属アシスタント（案内AI）と記憶アーキテクチャ

**背景**: 長屋に「あなた専属のアシスタント（案内AI）」を置く。目的地は将来的に
「記憶するマネージャー」（2段階コール＋多段階記憶＋RAG）だが、記憶は権利・プライバシー
整理と創業者条項の検討を要するため、段階的に導入する。

**決定（段階分け）**:
1. **段1（本実装・ステートレス）**:
   - やる: 1セッション内の連続性（直近ターン保持・ブラウザを閉じたら消える）／
     .md ドキュメントの **RAG** 検索（＝長屋の固定知識。記憶ではない）／
     システムが DB から引く「状態票」を毎回材料として渡す
   - やらない: 会話履歴のセッション跨ぎ永続化／会話からの人物像抽出・保存／
     多段階記憶／ユーザー横断記憶（すべて段3）
   - 区別: 「システムが業務上記録する事実」（installations・来訪ログ等）は状態票に
     載せてよい。「AIが会話から学んで覚えること」は段3
   - 生成は既存 `/api/ai`（BYOK, ADR-008）を再利用。**AIは任意**。未設定でも長屋は完全機能
2. **段2**: セッション内のステップ追跡・文脈追従・（承認前提の）操作補助
3. **段3**: セッション跨ぎの永続記憶（多段階記憶・記憶圧縮）。要・権利/プライバシー整理と創業者条項

**RAG の方針**:
- 対象は **.md のみ**（コード本体は入れない）。`src/content/help/*.md`（案内所記事＝最重要）／
  docs 配下／README・CONTRIBUTING／各 `gadgets/*/SETUP.md`・`README.md`
- Supabase **pgvector** にチャンク埋め込み。検索（ベクトル計算）は無料、**生成のみ BYOK**
- **埋め込みキーはプラットフォーム保有の1本**（例: OpenAI `text-embedding-3-small`）。
  理由: Anthropic には埋め込みAPIが無く、生成BYOKと兼用できないため。索引・クエリ双方で使い、
  `ai_usage` に `key_owner='platform', purpose='embed'` で記録する
- 再インデックスは手動 `npm run reindex`（.md更新・ガジェット公開で走らせる思想）。CI自動化は backlog

**状態票**: 対話のたびシステムが DB から現在状態を引きシステムプロンプトに添える
（installations／role／来訪頻度・最終来訪／AI設定有無／公開ガジェット有無 等）。AIは覚えず毎回渡す。
来訪ログは最小記録（`profiles.last_visit_at` / `visit_count` のみ）。

**理由**: 記憶の永続化は価値が高い反面、権利・プライバシー・創業者条項の整理が前提。
まずステートレスで「使えるアシスタント」を出し、記憶は基盤を固めてから段階導入する。

---

## ADR-011: 統合アシスタント＝ガジェットのツール開放（AI-operable gadgets）

**状態**: 設計ドラフト（実装は段階導入。gadget-spec §9 ドラフト参照）

**背景**:
- スマホは1画面1ガジェット＋常駐AIは1つ。ガジェットごとに個別AIチャットを積むと
  「どのAIと話すのか」が破綻する → **会話するAIは1つに集約**が自然。
- 世間の潮流も「アプリごとの専用チャットボット」から「**中央の1アシスタントが、許可された
  多数のツールを横断利用**」へ（MCP / Apple App Intents / ChatGPT Actions）。NAGAYA-BASE は
  その縮図。学びの観点でも、この設計スキルは汎用・最前線であり "ここだけの知識" ではない。

**決定**:
1. 単一の常駐アシスタント（案内AI）を、ガジェットが宣言した**ツール（AIから呼べる関数）**を
   横断的に呼べるオーケストレータにする。＝**ガジェット=ツールサーバ / アシスタント=ホスト**（MCP的）。
2. ガジェットは「AIを内蔵」するのではなく「**AIに開ける口（ツール＋読み取り文脈）を宣言**」する。
   参加は **opt-in**、宣言が無ければ AI からは一切触れない（既定OFF・最小権限・ADR-001）。
3. ツールは粒度を持つ: `read`（読み取り専用）/ `act`（操作）。**`act` は必ずユーザー承認**を要する
   （段2の確認UIを流用。AIは勝手に実行しない）。
4. ユーザー同意: インストール時の承認カード（FR-06）に「AI操作の許可」を追加。permissions に
   `ai-tools` を新設（宣言＋同意がそろって初めて有効）。
5. **ステートレスで成立**: 会話内のツール実行は「会話履歴＋ツール定義＋今の状態を毎回渡す」だけで
   動く（段1/2の延長）。永続記憶（段3）は "セッションを跨いで覚える" richさを足すときだけ必要。
6. **`gadget.ai`（ADR-008）は存置し共存**: 「ガジェットが内部でAIを黙って使う」用途（要約等・
   会話ではない処理）は従来どおり `gadget.ai`（ガジェット→AI）。会話UIとしてのAIは統合アシスタント
   に集約。**役割で棲み分ける**（向きが逆: gadget.ai=ガジェット→AI / 本ADR=AI→ガジェット）。
7. 出し分け: モバイル＝統合1択 / PC＝統合を既定に、将来は個別会話の併用も可。
8. 教育方針: ①`gadget.ai`（AI内蔵アプリ＝世間で馴染みの型）と ②ツール開放（AI-operable＝最前線の型）
   の**両方**を学べる場として位置づける（片方に強制しない）。

**技術契約（gadget-sdk / postMessage、詳細は gadget-spec §9 ドラフト）**:
- manifest に `aiTools`: 各ツール = { name, description, kind:'read'|'act', params(スキーマ), requiresConfirm }。
- SDK: ガジェットが `gadget.ai.registerTools([...])` で登録、ホストからの `tool-invoke` に
  `gadget.ai.onToolInvoke(handler)` で応答（**ホスト→ガジェットの新RPC方向**）。
- ホスト: アシスタントが function-calling でツール選択 → 該当ガジェットへ postMessage invoke →
  結果を会話に戻す。`act` は承認UIを挟む。画面表示中/近接ガジェットのツールを優先（プロンプト肥大防止）。

**却下した代替案**: 各ガジェットに個別AIチャットを内蔵（サイロ化・モバイルで破綻・世間の逆行）。

**リスク・検討**: プロバイダ間の function-calling 形式差（抽象化層で吸収）／ツール多数時のプロンプト肥大
（近接優先で絞る）／セキュリティ（`act` 承認・permission・サンドボックス維持）／後方互換（無宣言の
既存ガジェットは非参加で無影響）。

**非機能要件（P2実装時の必須）**:
- **レイテンシ対策**: ツール利用は生成が多段になり遅くなる（エージェント型の宿命）。**streaming**（回答を
  流す）＋**進捗表示**（「予定を確認中…」等）を最初から入れる。ツール選択には軽量モデル、独立ツールは
  並列、ツール不要な質問は1回で完結。埋め込み（①）は軽量で体感遅延はほぼ生成側。
- **コスト透明化**: 埋め込み（①）はプラットフォーム負担（1質問≈$0.000002＝実質ゼロだが運営負担は事実）。
  生成（②）はユーザーBYOK。`ai_usage`（key_owner=platform/self）で可視化済み。運営負担分は将来
  Honmono 運営へ引き取り精算（backlog #15）。暴走はレート制限で抑止。

**段階**: P1 設計確定（本ADR＋spec §9）← 今ここ ／ P2 `read` ツール最小実装（宣言＋invoke＋承認カード
表示＋1ガジェットで function-calling）／ P3 `act`（承認つき操作）＋複数ガジェット横断 ／ P4 PC個別会話・
段3記憶との統合。

---

## システム構成図（概要）

```
[ユーザーのブラウザ / PWA]
  ├─ platform shell (React)  ←── Cloudflare Pages
  │    ├─ Supabase Auth (ログイン)
  │    └─ ダッシュボード
  │         └─ <iframe sandbox="allow-scripts">
  │              ガジェット (静的アプリ) ←── Pages (gadgets/*)
  │              ↕ postMessage (gadget-sdk)
  ├─ Pages Functions / Workers ── 権限検証・BYOK暗号化・審査API
  └─ Supabase Postgres (RLS) ── profiles / gadgets / installations / gadget_storage
```
