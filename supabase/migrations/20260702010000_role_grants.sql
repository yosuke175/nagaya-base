-- Base table privileges for the API roles.
--
-- Newer Supabase projects do not grant privileges on public tables to
-- anon / authenticated by default, so the RLS policies from
-- 20260702000000_initial_schema.sql never get a chance to run
-- (PostgREST returns 42501 "permission denied" first). This migration
-- defines the base privileges; RLS then restricts WHICH ROWS each user
-- can touch. Keep both layers in mind when adding tables.

grant usage on schema public to anon, authenticated, service_role;

-- Catalog is readable without login (guest role, FR-03).
-- RLS limits visible rows to status = 'published'.
grant select on table gadgets to anon, authenticated;
grant select on table gadget_versions to anon, authenticated;

-- Logged-in users manage their own data (rows limited by RLS).
grant select on table profiles to authenticated;
grant update (display_name) on table profiles to authenticated;
grant select, insert, update, delete on table installations to authenticated;
grant select, insert, update, delete on table gadget_storage to authenticated;

-- developer / admin operations (rows limited by RLS).
grant insert, update on table gadgets to authenticated;
grant insert, update on table gadget_versions to authenticated;

-- Audit logs: read allowed to authenticated (RLS restricts rows to admin);
-- writes happen only via service_role from Workers (NFR-05).
grant select on table audit_logs to authenticated;

-- Workers (service_role) bypass RLS but still need object privileges.
grant all on table profiles, gadgets, gadget_versions, installations,
  gadget_storage, audit_logs to service_role;
grant usage, select on all sequences in schema public to service_role;
