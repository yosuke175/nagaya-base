-- 案内AI 段1 / 状態票の最小の来訪ログ。細かい行動追跡はしない（last_visit_at と visit_count のみ）。
-- これらの列はサーバー側のみ更新可（authenticated には display_name 等しか grant していない）
-- ため、本人の来訪記録は security definer 関数で行う。

alter table profiles add column last_visit_at timestamptz;
alter table profiles add column visit_count integer not null default 0;

create function record_visit()
returns void
language sql
security definer
set search_path = public
as $$
  update profiles
  set visit_count = visit_count + 1,
      last_visit_at = now()
  where id = auth.uid();
$$;

grant execute on function record_visit() to authenticated;
