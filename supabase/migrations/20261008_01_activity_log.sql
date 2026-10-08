-- Audit trail for the HR "Logs" page: who signed in, and who changed what.
--   event 'login'  -> one row per sign-in (deduped on user_id + signed_in_at)
--   event 'change' -> one row per successful write, with the section touched.
-- Field NAMES are recorded for profile edits, never the values.
-- Written by the API (service role); read only by HR through /api/logs.
-- Service role only: RLS on, no policies, nothing granted to anon/authenticated.

create table if not exists public.activity_log (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  event text not null check (event in ('login', 'change')),
  user_id uuid,
  actor_employee_id uuid references public.employees(id) on delete set null,
  actor_name text,
  section text,
  action text,
  target_employee_id uuid references public.employees(id) on delete set null,
  target_name text,
  detail text,
  fields text[],
  signed_in_at timestamptz,
  ip text,
  user_agent text,
  unique (user_id, signed_in_at)
);

create index if not exists activity_log_created_idx on public.activity_log (created_at desc);
create index if not exists activity_log_actor_idx on public.activity_log (actor_employee_id, created_at desc);

alter table public.activity_log enable row level security;
revoke all on public.activity_log from anon, authenticated;
