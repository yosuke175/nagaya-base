-- 案内AI 段1 / RAG（ADR-010）: 長屋の .md ドキュメントのチャンク埋め込みを pgvector に保存。
-- 検索（ベクトル計算）は無料、生成のみ BYOK。索引は `npm run reindex`（service_role）で作る。
-- 埋め込みは OpenAI text-embedding-3-small（1536次元）＝プラットフォーム保有キー1本。

create extension if not exists vector;

create table doc_chunks (
  id bigint generated always as identity primary key,
  source_path text not null,           -- 例: platform/src/content/help/01-hajimete.md
  chunk_index integer not null,
  content text not null,
  embedding vector(1536) not null,     -- OpenAI text-embedding-3-small
  key_owner text not null default 'platform', -- 索引に使ったキーの持ち主（費用按分の根拠）
  gadget_id text,                      -- ガジェット由来の文書なら its id（任意）
  updated_at timestamptz not null default now(),
  unique (source_path, chunk_index)
);

-- 近傍検索用インデックス（hnsw・コサイン距離）
create index doc_chunks_embedding_idx on doc_chunks using hnsw (embedding vector_cosine_ops);

alter table doc_chunks enable row level security;
-- 直接アクセスはさせない（検索は security definer RPC 経由）。書き込みは service_role（reindex）のみ。
grant select, insert, update, delete on table doc_chunks to service_role;
grant usage, select on all sequences in schema public to service_role;

-- 類似検索: 質問の埋め込みに近い上位チャンクを返す。案内AI Function（service_role）から呼ぶ。
create function match_doc_chunks(query_embedding vector(1536), match_count integer default 6)
returns table (source_path text, content text, similarity double precision)
language sql
stable
security definer
set search_path = public, extensions
as $$
  select source_path, content, 1 - (embedding <=> query_embedding) as similarity
  from doc_chunks
  order by embedding <=> query_embedding
  limit match_count;
$$;

grant execute on function match_doc_chunks(vector, integer) to service_role;
