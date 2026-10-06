-- Queue of staff self-service changes that HR is told about in digest emails:
--   kind 'profile'  -> daily digest (which fields a person changed; never the values)
--   kind 'training' -> weekly digest (courses staff added)
-- Rows are written by the API (service role) and stamped notified_at once emailed.
-- Service role only: RLS on, no policies, nothing granted to anon/authenticated.

create table if not exists public.hr_change_log (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('profile', 'training')),
  employee_id uuid not null references public.employees(id) on delete cascade,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  notified_at timestamptz
);

create index if not exists hr_change_log_pending_idx
  on public.hr_change_log (kind, created_at)
  where notified_at is null;

alter table public.hr_change_log enable row level security;
revoke all on public.hr_change_log from anon, authenticated;
