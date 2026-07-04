# reindex — 案内AI(段1) RAG の索引スクリプト

長屋の `.md` ドキュメントをチャンク化し、OpenAI で埋め込み、Supabase の `doc_chunks`
テーブルに保存する（手動運用）。案内AIはこの索引を検索して回答の根拠にする。

## 使い方

1. リポジトリ直下 `.env` に3つを設定（`.env.example` 参照）:
   - `PLATFORM_EMBEDDING_KEY` … OpenAI 埋め込みキー（sk-...）
   - `SUPABASE_URL` … 例 `https://xxxx.supabase.co`
   - `SUPABASE_SERVICE_ROLE_KEY` … Supabase → Settings → API の service_role キー
2. 事前に Supabase で pgvector を有効化し、migration `20260705030000_rag_doc_chunks.sql` を適用しておく
3. 実行:
   ```
   npm run reindex
   ```

`.md` を更新したら、または新しいガジェットの SETUP/README を足したら、再実行する。
（CI自動化は backlog #14。段1では手動運用）

## 対象

`.md` のみ。案内所記事（`platform/src/content/help/*.md`）、docs の一部、README/CONTRIBUTING、
各 `gadgets/*/SETUP.md`・`README.md`。dev内部ログ（journal 等）は除外（`reindex.mjs` の EXCLUDE）。
