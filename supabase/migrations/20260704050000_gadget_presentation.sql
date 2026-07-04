-- 道具のGUI編集（指示: フェーズ4）
--
-- 道具市カードの「画像・表示名・説明」を、manifest を触らず NAGAYA-BASE 上の
-- GUI で上書きできるようにする。上書きは DB に持ち、カタログ表示時に
-- ファイル由来の manifest とマージする。画像はクライアント圧縮済みの
-- data-URL（「軽い画像だけ」）。
--
-- 編集できるのは「その道具の owner（gadgets.owner_id）」または admin。
-- 表示（SELECT）は全ログインユーザー。

create table gadget_presentation (
  gadget_id text primary key,
  display_name text,
  description text,
  cover_image text, -- 圧縮済み data-URL（任意）
  updated_by uuid references profiles (id),
  updated_at timestamptz not null default now()
);

alter table gadget_presentation enable row level security;

create policy gadget_presentation_select on gadget_presentation
  for select using (auth.uid() is not null);

-- owner か admin だけが上書きできる（owner 判定は gadgets.owner_id）
create policy gadget_presentation_owner_write on gadget_presentation
  for insert with check (
    role_at_least('admin')
    or exists (
      select 1 from gadgets g where g.id = gadget_presentation.gadget_id and g.owner_id = auth.uid()
    )
  );
create policy gadget_presentation_owner_update on gadget_presentation
  for update using (
    role_at_least('admin')
    or exists (
      select 1 from gadgets g where g.id = gadget_presentation.gadget_id and g.owner_id = auth.uid()
    )
  );
create policy gadget_presentation_owner_delete on gadget_presentation
  for delete using (
    role_at_least('admin')
    or exists (
      select 1 from gadgets g where g.id = gadget_presentation.gadget_id and g.owner_id = auth.uid()
    )
  );

create trigger gadget_presentation_updated_at
  before update on gadget_presentation
  for each row execute function set_updated_at();

grant select, insert, update, delete on table gadget_presentation to authenticated;
grant all on table gadget_presentation to service_role;
