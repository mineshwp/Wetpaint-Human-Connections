-- Throttle for the public "forgot password" endpoint: one request per person per
-- hour. Service role only (RLS on, no policies, nothing granted to anon/authenticated).

create table if not exists public.password_reset_requests (
  employee_id uuid primary key references public.employees(id) on delete cascade,
  last_requested_at timestamptz not null default now()
);

alter table public.password_reset_requests enable row level security;
revoke all on public.password_reset_requests from anon, authenticated;
