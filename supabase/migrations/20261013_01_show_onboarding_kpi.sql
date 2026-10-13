-- HR can switch on the 3-month (Month 1–3) KPI for a permanent staff member.
-- Month reviews are never deleted when someone becomes permanent; this flag
-- lets HR keep adding/viewing them. NOT YET APPLIED.
alter table public.employees add column if not exists show_onboarding_kpi boolean not null default false;
grant select (show_onboarding_kpi) on public.employees to authenticated;
