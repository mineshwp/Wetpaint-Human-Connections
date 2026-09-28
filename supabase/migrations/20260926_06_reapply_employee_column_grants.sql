-- NOT YET APPLIED. Run AFTER the service-client code (profile page, profile
-- API, edit page) is live in production. Undoes 20260926_03: signed-in users
-- can read only directory columns; ID, DOB, banking, salary, personal details
-- and next of kin are readable only by the server's service client.
revoke select on public.employees from authenticated;
grant select (id, employee_number, first_name, last_name, email, work_email, phone, job_title,
  department_id, manager_id, status, start_date, avatar_initials, profile_photo_url, is_archived,
  contract_type, contract_end_date, contract_term_months, contract_is_renewable, created_at, updated_at)
  on public.employees to authenticated;
