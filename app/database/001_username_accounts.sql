begin;

create schema waterguard_private;
revoke all on schema waterguard_private from public;

create role waterguard_accounts nologin;
grant usage on schema waterguard_private to waterguard_accounts;

create table waterguard_private.accounts (
  id uuid primary key default gen_random_uuid(),
  username text collate "C" not null unique
    check (username ~ '^[a-z0-9][a-z0-9_.-]{2,31}$'),
  password_hash text not null check (password_hash like '$argon2id$%'),
  credential_version integer not null default 1 check (credential_version > 0),
  disabled_at timestamptz,
  created_at timestamptz not null default now()
);

revoke all on table waterguard_private.accounts from public;
alter table waterguard_private.accounts enable row level security;

grant select (id, username, password_hash, credential_version, disabled_at),
  insert (username, password_hash) on waterguard_private.accounts to waterguard_accounts;

create policy runtime_reads_accounts on waterguard_private.accounts
  for select to waterguard_accounts using (true);
create policy runtime_creates_accounts on waterguard_private.accounts
  for insert to waterguard_accounts with check (true);

commit;
