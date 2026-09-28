-- TEMPORARY (applied 26 Sep 2026): the app deployed at that time still read
-- sensitive employee columns with the signed-in session. Once the code that
-- reads full records with the service client is deployed, run
-- 20260926_06_reapply_employee_column_grants.sql to undo this.
grant select on public.employees to authenticated;
