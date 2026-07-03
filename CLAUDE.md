# CLAUDE.md — NAGAYA-BASE 開発規約

このリポジトリは、Honmono協会のAI活用勉強会メンバーが共同開発する
「プラットフォーム + ガジェット」型のWebアプリケーションである。
Claude Code（および他のAI開発ツール）は、本ファイルの規約に必ず従うこと。

## プロジェクト概要

- プラットフォーム: PWA（React + Vite + TypeScript）。Cloudflare Pages で配信
- API層: Cloudflare Workers（Hono）
- 認証・DB: Supabase（Auth + Postgres + RLS）
- ガジェット: sandboxed iframe 内で動作する静的Webアプリ。postMessage 経由の SDK でのみプラットフォームと通信する

詳細な設計判断は `docs/architecture.md`、要件全体は `docs/requirements.md`、
ガジェットの仕様契約は `docs/gadget-spec.md` を参照。
**これら3文書と矛盾するコードを書かないこと。矛盾に気づいたらコードではなく人間に報告すること。**

## リポジトリ構成（monorepo）

```
/
├── CLAUDE.md
├── docs/                  # 仕様・設計文書（正）
├── platform/              # プラットフォーム本体（React PWA）
│   └── src/
├── functions/             # Pages Functions（軽量API）
│                          #   ※Cloudflare Pages の仕様で Root directory（=リポジトリ
│                          #     ルート）直下に置く必要がある（platform/ 配下は不可）
├── workers/               # 独立させる必要のあるWorkers（バッチ等）
├── packages/
│   └── gadget-sdk/        # ガジェット開発者に配布するSDK（npm workspace）
├── gadgets/               # コミュニティ製ガジェット（1ガジェット = 1ディレクトリ）
│   └── _template/         # ガジェット雛形
└── supabase/
    └── migrations/        # DBマイグレーション（SQLファイルのみ。手動変更禁止）
```

## 絶対に守ること（DO NOT）

1. **RLSポリシーを無効化・迂回しない。** `service_role` キーをplatform/のクライアントコードに書かない。service_roleはWorkers内のみ。
2. **ガジェットのコードから Supabase やプラットフォームAPIを直接叩くコードを書かない。** ガジェットの外部通信は gadget-sdk の postMessage API 経由のみ。
3. **`docs/gadget-spec.md` のマニフェストスキーマと postMessage API を、docs の更新なしに変更しない。** これは全ガジェット開発者との契約であり、破壊的変更は必ず人間の承認とバージョン番号の更新を伴う。
4. **Google の restricted scope（`drive` フルアクセス、`gmail.*` 等）を要求するコードを書かない。** 外部サービス連携ポリシーは `docs/architecture.md` の ADR-005 に従う。
5. **`supabase/migrations/` の適用済みマイグレーションを書き換えない。** 変更は常に新しいマイグレーションファイルの追加で行う。
6. **秘密情報（APIキー、トークン）をリポジトリにコミットしない。** `.env` は `.gitignore` 済み。`.env.example` のみ更新する。
7. **ライセンスヘッダ・LICENSE ファイルを変更しない**（ADR-006）。

## コーディング規約

- TypeScript strict モード。`any` は原則禁止（やむを得ない場合は理由コメント必須）
- UIテキストは日本語を第一言語とする。コード内の識別子・コメントは英語
- コンポーネントは関数コンポーネント + Hooks。状態管理は最小限（まず useState/useReducer、必要になってから Zustand）
- スタイルは Tailwind。独自CSSは最小限
- コミットメッセージ: `feat|fix|docs|chore(scope): 概要`（例: `feat(sdk): add storage.set API`）
- Lint/Format: ESLint + Prettier。CIで強制

## 開発コマンド

```bash
npm install              # ルートで一括（npm workspaces）
npm run dev              # platform のローカル開発サーバ
npm run dev:gadget <id>  # 指定ガジェットを開発モードで起動（sandbox付き）
npm run test             # vitest
npm run db:migrate       # supabase migration up（ローカル）
```

## ロールと権限（実装時の前提）

| ロール | できること |
|---|---|
| admin | プラットフォーム管理、ガジェット審査・公開承認、ユーザー管理 |
| developer | ガジェットの登録・更新・公開申請 |
| user | ガジェットのインストール・利用・設定 |
| guest | 公開カタログの閲覧のみ（インストール不可） |

権限チェックは「UI側で隠す」だけでは不十分。**必ずRLSとWorkers側の検証で二重に行う。**

## ガジェット開発者への配慮

このリポジトリにはプログラミング経験の浅いメンバーもコントリビュートする。
`gadgets/` 配下と `packages/gadget-sdk/` の公開APIは、
`docs/gadget-spec.md` だけを読めば使えるように保つこと。
platform/ 内部の知識を前提とするAPIをSDKに追加してはならない。
