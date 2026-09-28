-- Monthly manager check-ins (applied 26 Sep 2026).
create table if not exists public.kpi_monthly_checkins (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  month date not null check (extract(day from month) = 1),
  author_id uuid references public.employees(id) on delete set null,
  status text not null check (status in ('on_track', 'needs_support', 'concern')),
  comment text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (employee_id, month)
);
create index if not exists kpi_monthly_checkins_month_idx on public.kpi_monthly_checkins(month);

create or replace function public.hc_is_team_lead_of(target uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select target is distinct from public.hc_employee_id()
     and public.hc_can_see_employee(target)
     and not public.hc_is_hr()
$$;
revoke all on function public.hc_is_team_lead_of(uuid) from public, anon;
grant execute on function public.hc_is_team_lead_of(uuid) to authenticated;

alter table public.kpi_monthly_checkins enable row level security;
create policy "HR manage check-ins" on public.kpi_monthly_checkins
  for all to authenticated using (public.hc_is_hr()) with check (public.hc_is_hr());
create policy "Team leads view check-ins" on public.kpi_monthly_checkins
  for select to authenticated using (public.hc_is_team_lead_of(employee_id));
create policy "Team leads add check-ins" on public.kpi_monthly_checkins
  for insert to authenticated
  with check (public.hc_is_team_lead_of(employee_id) and author_id = public.hc_employee_id());
create policy "Team leads edit check-ins" on public.kpi_monthly_checkins
  for update to authenticated using (public.hc_is_team_lead_of(employee_id))
  with check (public.hc_is_team_lead_of(employee_id) and author_id = public.hc_employee_id());
revoke all on public.kpi_monthly_checkins from anon;
