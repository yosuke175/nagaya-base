-- Initial schema per docs/architecture.md ADR-003.
--
-- RLS is the last line of defense (ADR-003): UI and Workers checks are
-- auxiliary. Role changes and audit-log writes go through Workers
-- (service_role) only.
--
-- NOTE: once applied, this file must never be edited — schema changes are
-- always a NEW migration file (CLAUDE.md DO NOT 5).

-- ---------------------------------------------------------------------------
-- Roles
-- ---------------------------------------------------------------------------

create type app_role as enum ('admin', 'developer', 'user', 'guest');

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null,
  role app_role not null default 'guest',
  created_at timestamptz not null default now()
);

create table gadgets (
  id text primary key
    check (id ~ '^[a-z0-9-]{3,40}$'), -- gadget id rule, docs/gadget-spec.md §2
  owner_id uuid references profiles (id),
  status text not null default 'draft'
    check (status in ('draft', 'in_review', 'published', 'suspended')),
  created_at timestamptz not null default now()
);

create table gadget_versions (
  gadget_id text not null references gadgets (id) on delete cascade,
  version text not null,
  manifest jsonb not null, -- docs/gadget-spec.md §3
  asset_path text not null,
  approved_by uuid references profiles (id),
  published_at timestamptz,
  primary key (gadget_id, version)
);

create table installations (
  user_id uuid not null references profiles (id) on delete cascade,
  gadget_id text not null references gadgets (id) on delete cascade,
  granted_permissions jsonb not null default '[]',
  settings jsonb not null default '{}',
  created_at timestamptz not null default now(),
  primary key (user_id, gadget_id)
);

create table gadget_storage (
  user_id uuid not null references profiles (id) on delete cascade,
  gadget_id text not null references gadgets (id) on delete cascade,
  key text not null check (char_length(key) <= 128), -- docs/gadget-spec.md §4
  value jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, gadget_id, key)
);

create table audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid,
  action text not null,
  target text,
  detail jsonb,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- Current user's role; 'guest' when unauthenticated or profile is missing.
-- SECURITY DEFINER so policies can call it without recursing into the
-- profiles RLS policies.
create function current_app_role()
returns app_role
language sql stable security definer
set search_path = public
as $$
  select coalesce((select role from profiles where id = auth.uid()), 'guest');
$$;

-- Role hierarchy check: admin ⊃ developer ⊃ user ⊃ guest (requirements §3)
create function role_at_least(required app_role)
returns boolean
language sql stable
as $$
  select array_position(array['guest', 'user', 'developer', 'admin']::app_role[], current_app_role())
      >= array_position(array['guest', 'user', 'developer', 'admin']::app_role[], required);
$$;

create function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger gadget_storage_updated_at
  before update on gadget_storage
  for each row execute function set_updated_at();

-- Auto-create a profile on signup. Everyone starts as guest; role promotion
-- is done by admin via Workers (service_role) and audit-logged.
-- The first admin (Mukai) is promoted manually in the SQL editor:
--   update profiles set role = 'admin' where id = '<auth.users.id>';
create function handle_new_user()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, role)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data ->> 'name',
      split_part(new.email, '@', 1),
      'ユーザー'
    ),
    'guest'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table profiles enable row level security;
alter table gadgets enable row level security;
alter table gadget_versions enable row level security;
alter table installations enable row level security;
alter table gadget_storage enable row level security;
alter table audit_logs enable row level security;

-- profiles: read own (admin reads all). Column-level grants restrict updates
-- to display_name only — the role column can only be changed via
-- service_role (Workers), never by the user themselves.
create policy profiles_select on profiles
  for select using (id = auth.uid() or role_at_least('admin'));

create policy profiles_update_own on profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

revoke update on table profiles from authenticated;
grant update (display_name) on table profiles to authenticated;

-- gadgets: published rows are readable by everyone including anon
-- (guest catalog, FR-03). Owners and admin see their drafts.
create policy gadgets_select on gadgets
  for select using (
    status = 'published'
    or owner_id = auth.uid()
    or role_at_least('admin')
  );

create policy gadgets_insert_developer on gadgets
  for insert with check (role_at_least('developer') and owner_id = auth.uid());

-- Status transitions to published/suspended are additionally verified in
-- Workers (FR-08/FR-09); RLS here limits writes to owner and admin.
create policy gadgets_update_owner_or_admin on gadgets
  for update using (owner_id = auth.uid() or role_at_least('admin'));

-- gadget_versions: published versions are public; owners see their own.
create policy gadget_versions_select on gadget_versions
  for select using (
    published_at is not null
    or exists (
      select 1 from gadgets g
      where g.id = gadget_versions.gadget_id and g.owner_id = auth.uid()
    )
    or role_at_least('admin')
  );

-- Owners submit new versions, but cannot self-publish:
-- published_at / approved_by must be null on insert (admin sets them, ADR-003).
create policy gadget_versions_insert_owner on gadget_versions
  for insert with check (
    role_at_least('developer')
    and exists (
      select 1 from gadgets g
      where g.id = gadget_versions.gadget_id and g.owner_id = auth.uid()
    )
    and published_at is null
    and approved_by is null
  );

create policy gadget_versions_update_admin on gadget_versions
  for update using (role_at_least('admin'));

-- installations: users manage their own rows; guests cannot install
-- (requirements §3). Only published gadgets can be installed.
create policy installations_select_own on installations
  for select using (user_id = auth.uid());

create policy installations_insert_own on installations
  for insert with check (
    user_id = auth.uid()
    and role_at_least('user')
    and exists (
      select 1 from gadgets g
      where g.id = installations.gadget_id and g.status = 'published'
    )
  );

create policy installations_update_own on installations
  for update using (user_id = auth.uid() and role_at_least('user'));

create policy installations_delete_own on installations
  for delete using (user_id = auth.uid());

-- gadget_storage (ADR-003 core rule): only your own rows, and only for
-- gadgets you have installed. Guests cannot write.
create policy gadget_storage_select_own_installed on gadget_storage
  for select using (
    user_id = auth.uid()
    and exists (
      select 1 from installations i
      where i.user_id = auth.uid() and i.gadget_id = gadget_storage.gadget_id
    )
  );

create policy gadget_storage_write_own_installed on gadget_storage
  for insert with check (
    user_id = auth.uid()
    and role_at_least('user')
    and exists (
      select 1 from installations i
      where i.user_id = auth.uid() and i.gadget_id = gadget_storage.gadget_id
    )
  );

create policy gadget_storage_update_own_installed on gadget_storage
  for update using (
    user_id = auth.uid()
    and role_at_least('user')
    and exists (
      select 1 from installations i
      where i.user_id = auth.uid() and i.gadget_id = gadget_storage.gadget_id
    )
  );

create policy gadget_storage_delete_own_installed on gadget_storage
  for delete using (
    user_id = auth.uid()
    and exists (
      select 1 from installations i
      where i.user_id = auth.uid() and i.gadget_id = gadget_storage.gadget_id
    )
  );

-- audit_logs (NFR-05): admin can read; nobody writes through the client API.
-- Inserts happen exclusively via Workers using service_role, which bypasses
-- RLS by design.
create policy audit_logs_select_admin on audit_logs
  for select using (role_at_least('admin'));
