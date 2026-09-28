-- Access belongs to the person, not the login (applied 28 Sep 2026): HR sets
-- a Manager up and arranges their team before they have a portal login.
-- app_users.manager_scope is no longer used (kept for now; drop later).
alter table public.employees
  add column if not exists access_level text not null default 'staff'
  check (access_level in ('staff', 'manager_reports', 'manager_line', 'manager_department'));

update public.employees e
   set access_level = 'manager_' || u.manager_scope
  from public.app_users u
 where u.employee_id = e.id and u.active_role = 'manager';

create or replace function public.hc_can_see_employee(target uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select public.hc_is_hr()
    or target = public.hc_employee_id()
    or exists (
      select 1 from employees me
      join employees t on t.id = target
      where me.id = public.hc_employee_id()
        and (
          (me.access_level = 'manager_department' and me.department_id is not null and me.department_id = t.department_id)
          or (me.access_level = 'manager_reports' and t.manager_id = me.id)
          or (me.access_level = 'manager_line' and t.id in (select public.hc_reporting_line(me.id)))))
$$;
