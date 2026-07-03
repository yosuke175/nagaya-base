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
- `gadget_versions` の insert/update は owner（developer以上）、`published_at` の設定はadminのみ
- guest はすべての書き込み不可

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
