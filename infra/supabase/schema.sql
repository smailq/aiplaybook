-- AI Playbook - Phase 0 Supabase schema.
--
-- Maps each authenticated user to their own Fly-hosted backend URL. RLS ensures
-- a user can read only their own row (the browser holds only the user's own
-- short-lived token). Writes are done by the provisioning script using the
-- service-role key, which bypasses RLS.
--
-- Apply via: Supabase Studio -> SQL editor -> paste + run,
-- or:        psql "$SUPABASE_DB_URL" -f infra/supabase/schema.sql

create table if not exists public.user_backends (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  backend_url text not null,
  machine_id  text,
  created_at  timestamptz not null default now()
);

alter table public.user_backends enable row level security;

-- A user may read only their own backend row.
drop policy if exists "read own backend" on public.user_backends;
create policy "read own backend"
  on public.user_backends
  for select
  using (auth.uid() = user_id);

-- No insert/update/delete policies are defined, so the anon and authenticated
-- roles cannot write. Provisioning uses the service-role key, which bypasses RLS.
