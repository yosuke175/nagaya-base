-- Seed the repo's built-in gadgets as published so installations (FK +
-- "published only" RLS rule) can reference them. Interim measure for
-- Phase 1: the developer registration / admin review flow (FR-08, Phase 2)
-- will replace manual seeding.

insert into gadgets (id, status)
values ('schedule-secretary', 'published')
on conflict (id) do nothing;
