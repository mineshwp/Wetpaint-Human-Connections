-- HR chooses what a Manager login sees: their whole department (default, the
-- existing behaviour) or only their direct reports (employees.manager_id).
-- Applied to production 27 Sep 2026.
alter table public.app_users
  add column if not exists manager_scope text not null default 'department'
  check (manager_scope in ('department', 'reports'));

create or replace function public.hc_can_see_employee(target uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select public.hc_is_hr()
    or target = public.hc_employee_id()
    or exists (
      select 1 from employees t join department_heads h on h.department_id = t.department_id
      where t.id = target and h.employee_id = public.hc_employee_id())
    or exists (
      select 1 from app_users u
      join employees me on me.id = u.employee_id
      join employees t on t.id = target
      where u.id = auth.uid() and u.active_role = 'manager'
        and (
          (u.manager_scope = 'department' and me.department_id is not null and me.department_id = t.department_id)
          or (u.manager_scope = 'reports' and t.manager_id = me.id)))
$$;

create or replace function public.hc_guard_app_users() returns trigger
  language plpgsql set search_path = public as $$
begin
  if current_user = 'authenticated' and (
       new.id is distinct from old.id or new.active_role is distinct from old.active_role
    or new.employee_id is distinct from old.employee_id or new.created_at is distinct from old.created_at
    or new.manager_scope is distinct from old.manager_scope) then
    raise exception 'Only accepted_at can be changed on your own account';
  end if;
  return new;
end $$;
