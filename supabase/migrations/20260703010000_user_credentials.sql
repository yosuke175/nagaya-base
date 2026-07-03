-- Encrypted per-user credentials (platform AI settings and gadget BYOK
-- keys), written ONLY by the credentials Pages Function using service_role
-- (ADR-005: AES-GCM encryption happens in the Workers layer; the key lives
-- in a Workers/Pages Secret).
--
-- RLS is enabled with NO policies and no grants to anon/authenticated:
-- clients can never read this table through the API, not even their own
-- rows. All access goes through /api/credentials.

create table user_credentials (
  user_id uuid not null references profiles (id) on delete cascade,
  credential_id text not null check (char_length(credential_id) <= 200),
  ciphertext text not null,
  iv text not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, credential_id)
);

alter table user_credentials enable row level security;

grant all on table user_credentials to service_role;

create trigger user_credentials_updated_at
  before update on user_credentials
  for each row execute function set_updated_at();
