-- 入居者情報・部屋番号・入居者一覧（指示: フェーズ2）
--
-- profiles に、部屋番号（入居順の連番）とプロフィール情報を追加する。
-- 画像（アイコン）は Supabase Storage を使わず、クライアント側で圧縮した
-- 小さな data-URL を text で保持する（「軽い画像だけ」を自然に満たす）。
-- 各項目の公開/非公開は visibility(jsonb) で本人が選び、他の入居者への表示は
-- security definer 関数 list_residents() が visibility を適用して行う
-- （非公開項目は DB から出さない）。

alter table profiles add column room_no bigint unique;
alter table profiles add column avatar text; -- 圧縮済み data-URL（任意）
alter table profiles add column bio text;
alter table profiles add column links jsonb not null default '{}'; -- {label: url}
alter table profiles add column visibility jsonb not null default '{}'; -- {field: bool}

-- 本人が更新できる列を拡張（role / room_no は含めない = サーバー側のみ）
revoke update on table profiles from authenticated;
grant update (display_name, settings, avatar, bio, links, visibility)
  on table profiles to authenticated;

-- 部屋番号 = 入居順の連番。guest（軒先）には付けない。
create sequence room_no_seq;

create function assign_room_no()
returns trigger
language plpgsql
as $$
begin
  if new.room_no is null and new.role <> 'guest' then
    new.room_no := nextval('room_no_seq');
  end if;
  return new;
end;
$$;

create trigger profiles_assign_room_no
  before insert or update on profiles
  for each row execute function assign_room_no();

-- 既存の入居者（非guest）に入居順（created_at）で番号を振り、採番を進める
with ordered as (
  select id, row_number() over (order by created_at, id) as rn
  from profiles
  where role <> 'guest' and room_no is null
)
update profiles p set room_no = o.rn from ordered o where p.id = o.id;

-- 既存の最大番号まで採番を進める（入居者が居なければ 1 から始まるよう is_called=false）
select setval(
  'room_no_seq',
  coalesce((select max(room_no) from profiles), 1),
  coalesce((select max(room_no) from profiles), 0) > 0
);

-- 入居者一覧（visibility 適用済み・非公開項目は返さない）。
-- 表示名・アイコンは既定で公開、自己紹介・リンクは既定で非公開。
create function list_residents()
returns table (room_no bigint, display_name text, avatar text, bio text, links jsonb)
language sql stable security definer
set search_path = public
as $$
  select
    p.room_no,
    case when coalesce((p.visibility ->> 'displayName')::boolean, true) then p.display_name else '（非公開）' end,
    case when coalesce((p.visibility ->> 'avatar')::boolean, true) then p.avatar end,
    case when coalesce((p.visibility ->> 'bio')::boolean, false) then p.bio end,
    case when coalesce((p.visibility ->> 'links')::boolean, false) then p.links else '{}'::jsonb end
  from profiles p
  where p.role <> 'guest'
    and auth.uid() is not null
  order by p.room_no nulls last;
$$;

grant execute on function list_residents() to authenticated;
