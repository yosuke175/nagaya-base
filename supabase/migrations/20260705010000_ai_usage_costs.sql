-- 案内AI 段1 / 使用量可視化: ai_usage を列追加で拡張（新テーブルは作らない）。
--   purpose      : 'gadget'（道具のAI）/ 'guide'（案内AI）/ 'embed'（RAG埋め込み）
--   key_owner    : 'self'（ユーザーBYOK）/ 'platform'（運営保有キー＝共通埋め込み等）
--   est_cost_usd : 概算コスト（USD）。文字数からの粗い見積り（正確な課金は各社ダッシュボード）
--
-- ユーザーは自分の行を閲覧できる（既存 RLS: ai_usage_select_own）。運営分（key_owner=
-- 'platform'）の横断集計は service_role（/api/admin）で行う。

alter table ai_usage add column purpose text not null default 'gadget';
alter table ai_usage add column key_owner text not null default 'self';
alter table ai_usage add column est_cost_usd numeric not null default 0;

-- 月次集計を速くする補助インデックス（本人の当月合計、運営分の集計）
create index ai_usage_key_owner_time on ai_usage (key_owner, created_at desc);

-- 運営（admin）用の横断集計。key_owner 別の合計（USD）と回数。service_role のみ実行。
-- /api/admin から呼ぶ（他人の ai_usage は RLS で見えないため security definer）。
create function ai_usage_summary(p_since timestamptz)
returns table (key_owner text, total_usd numeric, calls bigint)
language sql
stable
security definer
set search_path = public
as $$
  select key_owner, coalesce(sum(est_cost_usd), 0)::numeric as total_usd, count(*)::bigint as calls
  from ai_usage
  where created_at >= p_since
  group by key_owner;
$$;

grant execute on function ai_usage_summary(timestamptz) to service_role;
