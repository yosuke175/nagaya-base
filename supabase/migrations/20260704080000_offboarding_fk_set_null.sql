-- 退去（アカウント削除）対応: profiles を参照する外部キーを on delete set null に。
--
-- 背景: profiles.id は auth.users(id) を on delete cascade で参照する。退去時に
-- auth ユーザーを消すと profiles 行も消えるが、profiles(id) を参照する下記の列は
-- on delete 指定が無い（＝制限）ため、参照が残っていると削除が外部キー違反で失敗する。
--
-- 方針（ADR-006 現状維持・著作権はUIに出さない）:
--   - gadgets.owner_id → set null = 「道具は長屋に残す。世話役（owner）は大家へ」。
--     owner_id が null の道具は RLS 上 admin だけが管理でき、実質「大家預かり」になる。
--     道具の表示上の作者名は manifest.json（リポジトリ）由来なので変わらない。
--   - 投稿・承認・更新者などの参照（author_id / actor_id / approved_by / updated_by）
--     → set null。投稿文面はスナップショットとして残り、誰の行かだけ匿名化される。
--   - 個人データ（installations / gadget_storage / user_credentials）は既存の
--     on delete cascade でそのまま削除される（プライバシー）。
--   - audit_logs.actor_id は FK なし（uuid のまま）＝監査証跡として退去後も残す。
--
-- 「道具も道具市から下げて退去」を選んだ場合は、削除前に Function 側で当人の
-- gadgets を status='suspended' に更新してから auth 削除する（本マイグレーションは
-- 既定の受け皿＝残す側を保証する）。

alter table gadgets
  drop constraint gadgets_owner_id_fkey,
  add constraint gadgets_owner_id_fkey
    foreign key (owner_id) references profiles (id) on delete set null;

alter table gadget_versions
  drop constraint gadget_versions_approved_by_fkey,
  add constraint gadget_versions_approved_by_fkey
    foreign key (approved_by) references profiles (id) on delete set null;

alter table announcements
  drop constraint announcements_author_id_fkey,
  add constraint announcements_author_id_fkey
    foreign key (author_id) references profiles (id) on delete set null;

alter table events
  drop constraint events_author_id_fkey,
  add constraint events_author_id_fkey
    foreign key (author_id) references profiles (id) on delete set null;

alter table activity_feed
  drop constraint activity_feed_actor_id_fkey,
  add constraint activity_feed_actor_id_fkey
    foreign key (actor_id) references profiles (id) on delete set null;

alter table gadget_presentation
  drop constraint gadget_presentation_updated_by_fkey,
  add constraint gadget_presentation_updated_by_fkey
    foreign key (updated_by) references profiles (id) on delete set null;
