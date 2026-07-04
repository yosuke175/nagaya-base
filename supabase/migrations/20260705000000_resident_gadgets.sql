-- 入居者の紹介画面用: ある入居者（部屋番号で指定）が「作った道具」「部屋に入れている道具」を返す。
--
-- 他人の installations は RLS で見えないため、security definer 関数で必要分だけ公開する。
-- ユーザーIDは引数にも戻り値にも出さない（部屋番号で指定し、相関を最小化）。
-- 公開中(published)の道具だけを返す（他人の下書きや停止中は出さない）。

create function resident_gadgets(p_room_no bigint)
returns table (kind text, gadget_id text, name text, status text)
language sql
stable
security definer
set search_path = public
as $$
  -- その入居者が作った（公開中の）道具
  select 'developed'::text, g.id, g.name, g.status
  from gadgets g
  join profiles p on p.id = g.owner_id
  where p.room_no = p_room_no
    and g.status = 'published'
    and auth.uid() is not null
  union
  -- その入居者が部屋に入れている（公開中の）道具
  select 'installed'::text, g.id, g.name, g.status
  from installations i
  join profiles p on p.id = i.user_id
  join gadgets g on g.id = i.gadget_id
  where p.room_no = p_room_no
    and g.status = 'published'
    and auth.uid() is not null;
$$;

grant execute on function resident_gadgets(bigint) to authenticated;
