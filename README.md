# NAGAYA-BASE（仮称）

> **「NAGAYA-BASE」はコードネーム（仮称）であり、正式名称ではありません。**
> 名称は変更される可能性があるため、コードにはハードコードせず、
> 設定値（`platform/.env` の `VITE_APP_NAME` 等）から参照します。
> 詳細は [docs/requirements.md](docs/requirements.md) §0 を参照。

Honmono協会 AI活用勉強会メンバーが共同開発する「プラットフォーム + ガジェット」型Webアプリ。
メンバーそれぞれが自分の環境・自分のAIツールで小さなガジェットを開発し、
プラットフォームのダッシュボード上で組み合わせて使えるようにすることを目指しています。

## ドキュメント（正）

| 文書 | 内容 |
|---|---|
| [docs/requirements.md](docs/requirements.md) | 要件定義（ロール、機能、フェーズ） |
| [docs/architecture.md](docs/architecture.md) | 設計判断記録（ADR） |
| [docs/gadget-spec.md](docs/gadget-spec.md) | **ガジェット開発者はこれだけ読めばOK** |
| [docs/phase0-checklist.md](docs/phase0-checklist.md) | 立ち上げ手順 |
| [CLAUDE.md](CLAUDE.md) | AI開発ツール向けの開発規約 |

## セットアップ

Node.js 20 以上が必要です。

```bash
npm install
cp platform/.env.example platform/.env   # 表示名などの設定
npm run dev                              # http://localhost:5173
```

## コマンド

```bash
npm run dev              # platform のローカル開発サーバ（SDKビルド込み）
npm run dev:gadget <id>  # 指定ガジェットをダッシュボードに表示して起動（例: _template）
npm run test             # vitest
npm run build            # SDK + platform のビルド
npm run db:migrate       # supabase migration up（ローカル。Supabase CLI が必要）
```

## リポジトリ構成

```
├── docs/                  # 仕様・設計文書（正）
├── platform/              # プラットフォーム本体（React PWA）
├── workers/               # 独立Workers（バッチ等。現在は空）
├── packages/
│   └── gadget-sdk/        # ガジェット開発者に配布するSDK
├── gadgets/               # コミュニティ製ガジェット
│   └── _template/         # ガジェット雛形（コピーして使う）
└── supabase/
    └── migrations/        # DBマイグレーション（SQLのみ）
```

## 現在の実装状況（Phase 1）

- ダッシュボード（ログインなし）: インストール済みガジェットを sandbox 付き iframe で表示（FR-05）
- カタログ: `gadgets/*/manifest.json` から自動生成。権限・外部サービスを表示し、
  インストール／アンインストール可能（FR-03 / FR-04。永続化はモック、実体は Supabase へ）
- インストール承認UI（FR-06 最小版）: permissions / externalServices を提示して承認後に表示。
  権限が増えた場合は再承認を要求
- SDK: `createGadget()` ハンドシェイク / `gadget.storage.get・set` /
  `gadget.services.getCredential・requestSetup`（BYOK。保存はモック、暗号化は [docs/backlog.md](docs/backlog.md)）
- manifest の `baseUrls` をガジェットCSPの connect-src に反映する仕組み
- DBスキーマ: [supabase/migrations/](supabase/migrations/) に ADR-003 の初期スキーマ + RLS
  （ローカルの Postgres コンテナで適用・RLS挙動を検証済み。実プロジェクトへは未適用）
- 未実装: 認証（FR-01）・4ロールの実運用（FR-02）・Supabase接続。
  → 次のステップ: Supabase プロジェクト作成（phase0-checklist Step 3）と
  `platform/.env` への URL / anon key 設定後、認証イテレーションへ

## デプロイ（Cloudflare Pages）

| 設定 | 値 |
|---|---|
| Build command | `npm run build` |
| Build output directory | `platform/dist` |
| Root directory | `/`（リポジトリルート。npm workspaces のため変更しない） |
| 環境変数 | `NODE_VERSION=22` / `VITE_APP_NAME=NAGAYA-BASE` |

- `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` は Supabase 接続イテレーションで追加（anon key はクライアント公開前提の値）
- **`service_role` キーは Pages の環境変数に設定しない**（Workers の Secret のみ — CLAUDE.md DO NOT 1）
- 名称確定まで pages.dev サブドメインは対外共有しない（[docs/requirements.md](docs/requirements.md) §0）

## ガジェットを作りたい人へ

[docs/gadget-spec.md](docs/gadget-spec.md) を読み、`gadgets/_template/` をコピーしてください。
platform/ 内部のコードを読む必要はありません。

## ライセンスとコントリビューション

- ライセンス: Business Source License 1.1（[LICENSE](LICENSE)）。個人利用・勉強会内利用・非商用利用は自由
- コントリビュートには CLA への同意が必要です（[CLA.md](CLA.md) / [CONTRIBUTING.md](CONTRIBUTING.md)）
