-- Error log behind the HR "Logs" page → Errors tab: failed saves and server
-- errors, so HR can see what users hit (Vercel only keeps runtime logs for 1h).
--   source 'api'    -> a write route answered with an error (4xx/5xx) or threw
--   source 'client' -> the browser reported a failure (e.g. couldn't reach the server)
-- Messages are the error text only; never request bodies (no feedback text, no personal data).
-- Written by the API (service role); read only by HR through /api/logs/errors.
-- Service role only: RLS on, no policies, nothing granted to anon/authenticated.

create table if not exists public.error_log (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  source text not null check (source in ('api', 'client')),
  user_id uuid,
  actor_employee_id uuid references public.employees(id) on delete set null,
  actor_name text,
  method text,
  route text,
  status int,
  message text,
  section text,
  target_name text,
  detail text,
  user_agent text
);

create index if not exists error_log_created_idx on public.error_log (created_at desc);
create index if not exists error_log_actor_idx on public.error_log (actor_employee_id, created_at desc);

alter table public.error_log enable row level security;
revoke all on public.error_log from anon, authenticated;
