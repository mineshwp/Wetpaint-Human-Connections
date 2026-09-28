-- department_heads' composite primary key made PostgREST treat it as a
-- many-to-many junction between employees and departments, so every
-- `employees -> departments(...)` embed became ambiguous (PGRST201) and the
-- KPI reviews list and staff directory failed. Surrogate key + unique INDEX
-- (not a constraint) avoids junction detection; upserts still work.
alter table public.department_heads drop constraint department_heads_pkey;
alter table public.department_heads add column id uuid not null default gen_random_uuid();
alter table public.department_heads add primary key (id);
create unique index if not exists department_heads_dept_emp_uidx
  on public.department_heads (department_id, employee_id);
notify pgrst, 'reload schema';
