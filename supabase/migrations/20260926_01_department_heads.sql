-- Department heads (applied to production 26 Sep 2026). See 20260926_05 for
-- the key change that stops PostgREST treating this as a junction table.
create table if not exists public.department_heads (
  department_id uuid not null references public.departments(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (department_id, employee_id)
);
create index if not exists department_heads_employee_idx on public.department_heads(employee_id);

alter table public.department_heads enable row level security;

create policy "Authenticated can read department heads"
  on public.department_heads for select to authenticated using (true);

create policy "HR can manage department heads"
  on public.department_heads for all to authenticated
  using (exists (select 1 from public.app_users where app_users.id = auth.uid() and app_users.active_role = 'hr'))
  with check (exists (select 1 from public.app_users where app_users.id = auth.uid() and app_users.active_role = 'hr'));
