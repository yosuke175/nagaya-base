-- 情報系レイヤー（一方向）: 回覧板 / 速報！ / 長屋暦（指示書⑦）
--
-- 設計原則: 双方向の交流機能は作らない。ここにあるのは
--   ①運営→全体の一方向告知（announcements / events: admin のみ書ける）
--   ②システムイベントからの自動生成（activity_feed: クライアントからは書けない）
-- RLS が最終防衛線（UI で隠すだけにしない）。

-- フィード文面用にガジェットの表示名を DB でも持つ（原典は manifest.json）
alter table gadgets add column name text;
update gadgets set name = 'スケジュール秘書' where id = 'schedule-secretary';

-- ---------------------------------------------------------------------------
-- テーブル
-- ---------------------------------------------------------------------------

create table announcements (
  id bigint generated always as identity primary key,
  title text not null,
  body text not null, -- Markdown 可（表示側で軽量レンダリング）
  importance text not null default 'normal' check (importance in ('normal', 'important')),
  author_id uuid references profiles (id),
  created_at timestamptz not null default now()
);

create table events (
  id bigint generated always as identity primary key,
  title text not null,
  description text,
  starts_at timestamptz not null,
  ends_at timestamptz,
  location text,
  author_id uuid references profiles (id),
  created_at timestamptz not null default now()
);

create table activity_feed (
  id bigint generated always as identity primary key,
  type text not null check (type in ('gadget_published')), -- 将来 'announcement' 等に拡張
  actor_id uuid references profiles (id),
  target text,
  summary text not null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 速報！の自動生成（人間の入力ゼロ）
-- ---------------------------------------------------------------------------

-- security definer: クライアントに activity_feed の INSERT 権限を与えずに
-- トリガーだけが書き込めるようにする
create function log_gadget_published()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  actor_name text;
  gadget_label text;
begin
  if (tg_op = 'INSERT' and new.status = 'published')
     or (tg_op = 'UPDATE' and new.status = 'published' and old.status is distinct from new.status) then
    select display_name into actor_name from profiles where id = new.owner_id;
    gadget_label := coalesce(new.name, new.id);
    insert into activity_feed (type, actor_id, target, summary)
    values (
      'gadget_published',
      new.owner_id,
      new.id,
      coalesce(actor_name, '職人') || 'さんが「' || gadget_label || '」を公開しました'
    );
  end if;
  return new;
end;
$$;

create trigger gadgets_published_feed
  after insert or update on gadgets
  for each row execute function log_gadget_published();

-- 将来の登録フロー（gadget_versions.published_at セット時）にも対応
create function log_version_published()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  actor_name text;
  gadget_label text;
  owner uuid;
begin
  if new.published_at is not null and (tg_op = 'INSERT' or old.published_at is null) then
    select g.name, g.owner_id into gadget_label, owner from gadgets g where g.id = new.gadget_id;
    select display_name into actor_name from profiles where id = owner;
    insert into activity_feed (type, actor_id, target, summary)
    values (
      'gadget_published',
      owner,
      new.gadget_id,
      coalesce(actor_name, '職人') || 'さんが「' || coalesce(gadget_label, new.gadget_id)
        || '」v' || new.version || ' を公開しました'
    );
  end if;
  return new;
end;
$$;

create trigger gadget_versions_published_feed
  after insert or update on gadget_versions
  for each row execute function log_version_published();

-- ---------------------------------------------------------------------------
-- RLS（SELECT=全ログインユーザー / 書き込み=adminのみ、feedは書き込み不可）
-- ---------------------------------------------------------------------------

alter table announcements enable row level security;
alter table events enable row level security;
alter table activity_feed enable row level security;

create policy announcements_select on announcements
  for select using (auth.uid() is not null);
create policy announcements_admin_insert on announcements
  for insert with check (role_at_least('admin'));
create policy announcements_admin_update on announcements
  for update using (role_at_least('admin'));
create policy announcements_admin_delete on announcements
  for delete using (role_at_least('admin'));

create policy events_select on events
  for select using (auth.uid() is not null);
create policy events_admin_insert on events
  for insert with check (role_at_least('admin'));
create policy events_admin_update on events
  for update using (role_at_least('admin'));
create policy events_admin_delete on events
  for delete using (role_at_least('admin'));

-- activity_feed: 読みは全ログインユーザー。クライアントからの書き込みポリシーは
-- 作らない（トリガー=security definer と service_role のみが書ける）
create policy activity_feed_select on activity_feed
  for select using (auth.uid() is not null);

-- ---------------------------------------------------------------------------
-- 権限（このプロジェクトは default grant なし。RLSと二重の防衛線）
-- ---------------------------------------------------------------------------

grant select on table announcements, events, activity_feed to authenticated;
grant insert, update, delete on table announcements, events to authenticated;
grant usage, select on all sequences in schema public to authenticated;
grant all on table announcements, events, activity_feed to service_role;
grant usage, select on all sequences in schema public to service_role;
