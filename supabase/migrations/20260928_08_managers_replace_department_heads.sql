-- Department heads replaced by Manager access levels set by HR on the login
-- card (applied 28 Sep 2026): department / reports / line. Managers see
-- published KPI reviews of the people they can see. The test head was removed.
-- The department_heads table itself is dropped in 20260928_09 after deploy.
alter table public.app_users drop constraint if exists app_users_manager_scope_check;
alter table public.app_users add constraint app_users_manager_scope_check
  check (manager_scope in ('department', 'reports', 'line'));

create or replace function public.hc_reporting_line(mgr uuid) returns setof uuid
  language sql stable security definer set search_path = public as $$
  with recursive line(id) as (
    select id from employees where manager_id = mgr and id <> mgr
    union
    select e.id from employees e join line l on e.manager_id = l.id where e.id <> mgr
  )
  select id from line
$$;
revoke all on function public.hc_reporting_line(uuid) from public, anon;
grant execute on function public.hc_reporting_line(uuid) to authenticated;

create or replace function public.hc_can_see_employee(target uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select public.hc_is_hr()
    or target = public.hc_employee_id()
    or exists (
      select 1 from app_users u
      join employees me on me.id = u.employee_id
      join employees t on t.id = target
      where u.id = auth.uid() and u.active_role = 'manager'
        and (
          (u.manager_scope = 'department' and me.department_id is not null and me.department_id = t.department_id)
          or (u.manager_scope = 'reports' and t.manager_id = me.id)
          or (u.manager_scope = 'line' and t.id in (select public.hc_reporting_line(me.id)))))
$$;

create or replace function public.hc_can_view_review(rid uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select public.hc_is_hr() or exists (
    select 1 from kpi_reviews r
    where r.id = rid and (
      exists (select 1 from kpi_review_invitees i where i.review_id = r.id and i.invitee_id = public.hc_employee_id())
      or (r.status in ('active', 'completed') and (
        r.employee_id = public.hc_employee_id()
        or public.hc_is_team_lead_of(r.employee_id)))))
$$;

delete from public.department_heads;
