-- Per-user UI settings: entrance choice (職人/店子), tutorial progress, and
-- future cosmetic preferences (theme sync etc.).
--
-- IMPORTANT (2026-07-04 decision): the entrance 職人/店子 choice is a
-- BEHAVIORAL branch only — a self-declared "dress-up" with no status or
-- permission implications. It is stored here in `settings`, NEVER in `role`.
-- Security roles remain admin-assigned via service_role only (ADR-003).

alter table profiles add column settings jsonb not null default '{}';

-- Re-issue the column-level grant so authenticated users can update their
-- own display_name and settings — and still nothing else (role stays locked).
revoke update on table profiles from authenticated;
grant update (display_name, settings) on table profiles to authenticated;
