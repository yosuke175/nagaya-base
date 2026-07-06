-- Seed the debug-console gadget as published so it installs straight from the
-- catalog (道具市), the same way 20260703000000 seeds schedule-secretary.
--
-- Why this is needed: a repo built-in gadget (gadgets/<id>/) shows up in the
-- static catalog (/gadgets/index.json), but installation writes an
-- installations row whose FK + "published only" RLS require a matching
-- gadgets-table row. Without this seed, installing debug-console from the
-- 道具市 fails, and the only way to make it work is to register+publish it by
-- hand in the 工房. This is the same interim measure noted in
-- 20260703000000; the Phase 2 developer-registration flow (FR-08) will
-- replace manual seeding.
--
-- on conflict do nothing: if it was already published by hand via the 工房
-- (owner_id set), that row is kept as-is.

insert into gadgets (id, status)
values ('debug-console', 'published')
on conflict (id) do nothing;
