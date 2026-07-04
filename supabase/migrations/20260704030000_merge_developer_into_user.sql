-- 店子(user)と職人(developer)の権限差をなくす（2026-07-04 決定）。
--
-- 「何をもって職人か」の線引きができない（店子でも開発環境は入れられる）ため、
-- 入居者はロール1つ（user）に統合する。user が道具の利用に加えて
-- **登録・更新・公開**もできるようにする。guest（閲覧のみ）と admin（全権）は不変。
--
-- developer は enum に残す（既存行や履歴のため）が、今後は付与しない。
-- role_at_least の階層では developer は user 以上なので、これまで developer だった
-- アカウントも引き続き同じことができる（実害なし）。

-- 道具の登録: developer → user
drop policy gadgets_insert_developer on gadgets;
create policy gadgets_insert_user on gadgets
  for insert with check (role_at_least('user') and owner_id = auth.uid());

-- バージョンの提出: developer → user（自己公開の禁止条件はそのまま）
drop policy gadget_versions_insert_owner on gadget_versions;
create policy gadget_versions_insert_user on gadget_versions
  for insert with check (
    role_at_least('user')
    and exists (
      select 1 from gadgets g
      where g.id = gadget_versions.gadget_id and g.owner_id = auth.uid()
    )
    and published_at is null
    and approved_by is null
  );
