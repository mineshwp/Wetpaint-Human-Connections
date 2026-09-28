-- ── Helpers (security definer: read app_users / KPI tables without RLS recursion) ──
create or replace function public.hc_employee_id() returns uuid
  language sql stable security definer set search_path = public as $$
  select employee_id from app_users where id = auth.uid()
$$;

create or replace function public.hc_is_hr() returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (select 1 from app_users where id = auth.uid() and active_role = 'hr')
$$;

-- Mirrors canAccessEmployee in src/lib/auth.ts
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
        and me.department_id is not null and me.department_id = t.department_id)
$$;

-- Mirrors canViewReview in src/lib/kpi/access.ts: HR; the staff member once
-- published; any invitee; a head of the staff member's department once published.
create or replace function public.hc_can_view_review(rid uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select public.hc_is_hr() or exists (
    select 1 from kpi_reviews r
    where r.id = rid and (
      (r.employee_id = public.hc_employee_id() and r.status in ('active', 'completed'))
      or exists (select 1 from kpi_review_invitees i where i.review_id = r.id and i.invitee_id = public.hc_employee_id())
      or (r.status in ('active', 'completed') and exists (
        select 1 from employees e join department_heads h on h.department_id = e.department_id
        where e.id = r.employee_id and h.employee_id = public.hc_employee_id()))))
$$;

-- A reviewer may write only on a draft review they have accepted.
create or replace function public.hc_can_score(rid uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from kpi_reviews r join kpi_review_invitees i on i.review_id = r.id
    where r.id = rid and r.status = 'draft'
      and i.invitee_id = public.hc_employee_id() and i.status in ('accepted', 'completed'))
$$;

revoke all on function public.hc_employee_id(), public.hc_is_hr(), public.hc_can_see_employee(uuid),
  public.hc_can_view_review(uuid), public.hc_can_score(uuid) from public, anon;
grant execute on function public.hc_employee_id(), public.hc_is_hr(), public.hc_can_see_employee(uuid),
  public.hc_can_view_review(uuid), public.hc_can_score(uuid) to authenticated;

-- ── Column guards: non-HR sessions may change only a few columns ──
-- security invoker on purpose: current_user must be the caller's role
create or replace function public.hc_guard_app_users() returns trigger
  language plpgsql set search_path = public as $$
begin
  if current_user = 'authenticated' and (
       new.id is distinct from old.id or new.active_role is distinct from old.active_role
    or new.employee_id is distinct from old.employee_id or new.created_at is distinct from old.created_at) then
    raise exception 'Only accepted_at can be changed on your own account';
  end if;
  return new;
end $$;
drop trigger if exists hc_guard_app_users on public.app_users;
create trigger hc_guard_app_users before update on public.app_users
  for each row execute function public.hc_guard_app_users();

-- security invoker on purpose: current_user must be the caller's role
create or replace function public.hc_guard_employees() returns trigger
  language plpgsql set search_path = public as $$
declare
  allowed text[] := array['phone','alternate_phone','personal_email','next_of_kin_name',
                          'next_of_kin_phone','next_of_kin_relationship','updated_at'];
  changed text;
begin
  if current_user = 'authenticated' and not public.hc_is_hr() then
    for changed in
      select key from jsonb_each(to_jsonb(new)) n
      where n.value is distinct from (to_jsonb(old) -> n.key)
    loop
      if not changed = any(allowed) then
        raise exception 'You can only update your contact details and next of kin (tried %)', changed;
      end if;
    end loop;
  end if;
  return new;
end $$;
drop trigger if exists hc_guard_employees on public.employees;
create trigger hc_guard_employees before update on public.employees
  for each row execute function public.hc_guard_employees();

-- security invoker on purpose: current_user must be the caller's role
create or replace function public.hc_guard_invitees() returns trigger
  language plpgsql set search_path = public as $$
begin
  if current_user = 'authenticated' and not public.hc_is_hr() then
    if new.id is distinct from old.id or new.review_id is distinct from old.review_id
       or new.invitee_id is distinct from old.invitee_id or new.created_at is distinct from old.created_at
       or new.status not in ('accepted', 'declined') then
      raise exception 'Reviewers can only accept or decline';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists hc_guard_invitees on public.kpi_review_invitees;
create trigger hc_guard_invitees before update on public.kpi_review_invitees
  for each row execute function public.hc_guard_invitees();

-- ── employees: directory columns readable by everyone signed in; the rest
--    (ID, DOB, banking, salary, personal, next of kin…) only via the server's
--    service client after the app's access check ──
revoke all on public.employees from anon;
revoke select on public.employees from authenticated;
grant select (id, employee_number, first_name, last_name, email, work_email, phone, job_title,
  department_id, manager_id, status, start_date, avatar_initials, profile_photo_url, is_archived,
  contract_type, contract_end_date, contract_term_months, contract_is_renewable, created_at, updated_at)
  on public.employees to authenticated;

drop policy if exists "Authenticated can read employees" on public.employees;
drop policy if exists "Authenticated can update employees" on public.employees;
create policy "Signed-in users read the directory" on public.employees
  for select to authenticated using (true);
create policy "HR or self update" on public.employees
  for update to authenticated using (public.hc_is_hr() or id = public.hc_employee_id())
  with check (public.hc_is_hr() or id = public.hc_employee_id());
create policy "HR insert" on public.employees for insert to authenticated with check (public.hc_is_hr());
create policy "HR delete" on public.employees for delete to authenticated using (public.hc_is_hr());

-- ── departments: everyone reads, HR writes ──
drop policy if exists "HR manage departments" on public.departments;
create policy "HR manage departments" on public.departments
  for all to authenticated using (public.hc_is_hr()) with check (public.hc_is_hr());

-- ── hr_notes: HR only ──
drop policy if exists "Authenticated can read hr_notes" on public.hr_notes;
drop policy if exists "Authenticated can insert hr_notes" on public.hr_notes;
create policy "HR manage notes" on public.hr_notes
  for all to authenticated using (public.hc_is_hr()) with check (public.hc_is_hr());

-- ── documents: HR, or your own non-hidden documents ──
drop policy if exists "Authenticated can read documents" on public.documents;
drop policy if exists "Authenticated can update documents" on public.documents;
create policy "HR or own visible documents" on public.documents
  for select to authenticated
  using (public.hc_is_hr() or (employee_id = public.hc_employee_id() and not hidden_from_employee));
create policy "HR manage documents" on public.documents
  for all to authenticated using (public.hc_is_hr()) with check (public.hc_is_hr());

-- ── leave_balances (future module): HR or own ──
drop policy if exists "Authenticated can read leave_balances" on public.leave_balances;
create policy "HR or own leave" on public.leave_balances
  for select to authenticated using (public.hc_is_hr() or employee_id = public.hc_employee_id());

-- ── training: team (manager / head) can view too ──
drop policy if exists "Staff can view own training" on public.employee_training;
create policy "View training you can see" on public.employee_training
  for select to authenticated using (public.hc_can_see_employee(employee_id));

-- ── KPI reviews ──
drop policy if exists "Authenticated can read kpi_reviews" on public.kpi_reviews;
drop policy if exists "Authenticated can insert kpi_reviews" on public.kpi_reviews;
drop policy if exists "Authenticated can update kpi_reviews" on public.kpi_reviews;
drop policy if exists "Authenticated can delete kpi_reviews" on public.kpi_reviews;
create policy "View reviews you can see" on public.kpi_reviews
  for select to authenticated using (public.hc_can_view_review(id));
create policy "HR manage reviews" on public.kpi_reviews
  for all to authenticated using (public.hc_is_hr()) with check (public.hc_is_hr());

drop policy if exists "hr can manage invitees" on public.kpi_review_invitees;
create policy "View invitees" on public.kpi_review_invitees
  for select to authenticated
  using (invitee_id = public.hc_employee_id() or public.hc_can_view_review(review_id));
create policy "HR manage invitees" on public.kpi_review_invitees
  for all to authenticated using (public.hc_is_hr()) with check (public.hc_is_hr());
create policy "Invitee responds" on public.kpi_review_invitees
  for update to authenticated using (invitee_id = public.hc_employee_id())
  with check (invitee_id = public.hc_employee_id());

drop policy if exists "hr can manage invitee sections" on public.kpi_review_invitee_sections;
create policy "View invitee sections" on public.kpi_review_invitee_sections
  for select to authenticated using (exists (
    select 1 from kpi_review_invitees i where i.id = review_invitee_id
      and (i.invitee_id = public.hc_employee_id() or public.hc_can_view_review(i.review_id))));
create policy "HR manage invitee sections" on public.kpi_review_invitee_sections
  for all to authenticated using (public.hc_is_hr()) with check (public.hc_is_hr());

drop policy if exists "hr can manage item overrides" on public.kpi_review_item_overrides;
create policy "View item overrides" on public.kpi_review_item_overrides
  for select to authenticated using (public.hc_can_view_review(review_id));
create policy "HR manage item overrides" on public.kpi_review_item_overrides
  for all to authenticated using (public.hc_is_hr()) with check (public.hc_is_hr());

drop policy if exists "hr can manage scores" on public.kpi_scores;
create policy "View scores" on public.kpi_scores
  for select to authenticated using (public.hc_can_view_review(review_id));
create policy "HR manage scores" on public.kpi_scores
  for all to authenticated using (public.hc_is_hr()) with check (public.hc_is_hr());
create policy "Reviewer adds own score on draft" on public.kpi_scores
  for insert to authenticated
  with check (scorer_id = public.hc_employee_id() and public.hc_can_score(review_id));
create policy "Reviewer edits own score on draft" on public.kpi_scores
  for update to authenticated
  using (scorer_id = public.hc_employee_id() and public.hc_can_score(review_id))
  with check (scorer_id = public.hc_employee_id() and public.hc_can_score(review_id));

drop policy if exists "authenticated can manage final comments" on public.kpi_final_comments;
create policy "View final comments" on public.kpi_final_comments
  for select to authenticated using (public.hc_can_view_review(review_id));
create policy "HR manage final comments" on public.kpi_final_comments
  for all to authenticated using (public.hc_is_hr()) with check (public.hc_is_hr());
create policy "Reviewer adds own comment on draft" on public.kpi_final_comments
  for insert to authenticated
  with check (author_id = public.hc_employee_id() and public.hc_can_score(review_id));
create policy "Reviewer edits own comment on draft" on public.kpi_final_comments
  for update to authenticated
  using (author_id = public.hc_employee_id() and public.hc_can_score(review_id))
  with check (author_id = public.hc_employee_id() and public.hc_can_score(review_id));

-- ── Templates, settings, rating guide: everyone signed in reads, HR writes.
--    A review's custom items follow that review's visibility. ──
drop policy if exists "hr can manage template items" on public.kpi_template_items;
create policy "View template items" on public.kpi_template_items
  for select to authenticated using (review_id is null or public.hc_can_view_review(review_id));
create policy "HR manage template items" on public.kpi_template_items
  for all to authenticated using (public.hc_is_hr()) with check (public.hc_is_hr());

drop policy if exists "hr can manage template sections" on public.kpi_template_sections;
create policy "View template sections" on public.kpi_template_sections
  for select to authenticated using (true);
create policy "HR manage template sections" on public.kpi_template_sections
  for all to authenticated using (public.hc_is_hr()) with check (public.hc_is_hr());

drop policy if exists "hr can manage settings" on public.kpi_settings;
create policy "View settings" on public.kpi_settings for select to authenticated using (true);
create policy "HR manage settings" on public.kpi_settings
  for all to authenticated using (public.hc_is_hr()) with check (public.hc_is_hr());

drop policy if exists "hr can manage rating scale" on public.kpi_rating_scale;
create policy "View rating scale" on public.kpi_rating_scale for select to authenticated using (true);
create policy "HR manage rating scale" on public.kpi_rating_scale
  for all to authenticated using (public.hc_is_hr()) with check (public.hc_is_hr());
