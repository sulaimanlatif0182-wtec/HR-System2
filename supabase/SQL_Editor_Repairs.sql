-- ============================================================================
-- WtecHR — RLS REPAIR (run AFTER the main "SQL Editor Backup" script)
-- ----------------------------------------------------------------------------
-- WHY THIS EXISTS
--   The main script ended with a loop that created broad policies named
--   "authenticated_read_<table>" with:
--       FOR SELECT USING (auth.role() = 'authenticated')
--   for EVERY table — including payroll, claims, employee_documents,
--   system_audit_logs, hr_letters, performance_reviews, evaluations, etc.
--   That means ANY logged-in user could SELECT all rows of all tables via a
--   direct Supabase query (salaries, PII, audit logs). It also OR's with the
--   correct email-scoped policies, so the broad policy wins.
--
--   It also left the original 0001 migration policies (id = auth.uid()) which
--   can NEVER match because employees.id is a BIGINT and auth.uid() is a UUID.
--
--   The app reads/writes data ONLY through the API (service_role client), which
--   BYPASSES RLS, so removing these broad policies does NOT affect the app.
--
--   This script is idempotent and safe to re-run.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0) Email-based resolver functions (idempotent). The app links an auth user
--    to an employee by EMAIL, never by id.
-- ---------------------------------------------------------------------------
create or replace function public.current_employee_id()
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select e.id
  from employees e
  where lower(e.email) = (
    select lower(u.email) from auth.users u where u.id = auth.uid()
  )
  limit 1;
$$;

create or replace function public.current_employee_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(e.role, 'employee')
  from employees e
  where lower(e.email) = (
    select lower(u.email) from auth.users u where u.id = auth.uid()
  )
  limit 1;
$$;

grant execute on function public.current_employee_id() to authenticated, anon;
grant execute on function public.current_employee_role() to authenticated, anon;

-- ---------------------------------------------------------------------------
-- 1) DROP the over-broad "authenticated_read_*" policies (the exposure).
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'employees','attendance','leave_requests','payroll','claims','departments',
    'company_announcements','hr_letters','performance_reviews','employee_documents',
    'feature_flags','reminder_rules','reminder_logs','system_audit_logs',
    'employee_profile_update_requests','attendance_correction_requests','evaluations',
    'evaluation_templates','worker_evaluation_rules','policy_readiness_items',
    'admin_configurations','company_holidays'
  ] loop
    execute format('drop policy if exists %I on %I;', 'authenticated_read_' || t, t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 2) DROP the broken original 0001 policies (id = auth.uid() never matches).
-- ---------------------------------------------------------------------------
drop policy if exists employees_select on public.employees;
drop policy if exists employees_write on public.employees;
drop policy if exists attendance_policy on public.attendance;
drop policy if exists leave_policy on public.leave_requests;
drop policy if exists payroll_select on public.payroll;
drop policy if exists payroll_write on public.payroll;
drop policy if exists claims_policy on public.claims;

-- ---------------------------------------------------------------------------
-- 3) Re-create PRINCIPLED, email-scoped policies (self / admin / manager).
--    Non-sensitive reference tables (announcements, departments, holidays,
--    feature_flags, templates, settings) stay readable by any authenticated
--    user; everything with PII/finance is restricted to the owner or admin/
--    manager via the email resolver.
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  -- employees
  if to_regclass('public.employees') is not null then
    execute 'alter table public.employees enable row level security';
    execute 'drop policy if exists employees_self_select on public.employees';
    execute 'create policy employees_self_select on public.employees for select using (id = public.current_employee_id() or public.current_employee_role() = ''admin'')';
    execute 'drop policy if exists employees_self_update on public.employees';
    execute 'create policy employees_self_update on public.employees for update using (id = public.current_employee_id()) with check (id = public.current_employee_id())';
    execute 'drop policy if exists employees_admin_write on public.employees';
    execute 'create policy employees_admin_write on public.employees for all using (public.current_employee_role() = ''admin'') with check (public.current_employee_role() = ''admin'')';
  end if;

  -- employee_documents
  if to_regclass('public.employee_documents') is not null then
    execute 'alter table public.employee_documents enable row level security';
    execute 'drop policy if exists docs_owner_or_admin on public.employee_documents';
    execute 'create policy docs_owner_or_admin on public.employee_documents for all using (employee_id = public.current_employee_id() or public.current_employee_role() = ''admin'') with check (employee_id = public.current_employee_id() or public.current_employee_role() = ''admin'')';
  end if;

  -- employee_profile_update_requests (admin only)
  if to_regclass('public.employee_profile_update_requests') is not null then
    execute 'alter table public.employee_profile_update_requests enable row level security';
    execute 'drop policy if exists profile_req_admin on public.employee_profile_update_requests';
    execute 'create policy profile_req_admin on public.employee_profile_update_requests for all using (public.current_employee_role() = ''admin'') with check (public.current_employee_role() = ''admin'')';
  end if;

  -- performance_reviews
  if to_regclass('public.performance_reviews') is not null then
    execute 'alter table public.performance_reviews enable row level security';
    execute 'drop policy if exists perf_self_or_admin on public.performance_reviews';
    execute 'create policy perf_self_or_admin on public.performance_reviews for all using (employee_id = public.current_employee_id() or public.current_employee_role() = ''admin'') with check (employee_id = public.current_employee_id() or public.current_employee_role() = ''admin'')';
  end if;

  -- evaluations
  if to_regclass('public.evaluations') is not null then
    execute 'alter table public.evaluations enable row level security';
    execute 'drop policy if exists eval_self_or_admin on public.evaluations';
    execute 'create policy eval_self_or_admin on public.evaluations for all using (employee_id = public.current_employee_id() or public.current_employee_role() = ''admin'') with check (employee_id = public.current_employee_id() or public.current_employee_role() = ''admin'')';
  end if;

  -- payroll (owner or admin; writes admin only)
  if to_regclass('public.payroll') is not null then
    execute 'alter table public.payroll enable row level security';
    execute 'drop policy if exists payroll_self_or_admin on public.payroll';
    execute 'create policy payroll_self_or_admin on public.payroll for select using (employee_id = public.current_employee_id() or public.current_employee_role() = ''admin'')';
    execute 'drop policy if exists payroll_admin_write on public.payroll';
    execute 'create policy payroll_admin_write on public.payroll for insert with check (public.current_employee_role() = ''admin'')';
    execute 'drop policy if exists payroll_admin_update on public.payroll';
    execute 'create policy payroll_admin_update on public.payroll for update using (public.current_employee_role() = ''admin'') with check (public.current_employee_role() = ''admin'')';
  end if;

  -- leave_requests (owner or admin/manager)
  if to_regclass('public.leave_requests') is not null then
    execute 'alter table public.leave_requests enable row level security';
    execute 'drop policy if exists leave_self_or_admin on public.leave_requests';
    execute 'create policy leave_self_or_admin on public.leave_requests for all using (employee_id = public.current_employee_id() or public.current_employee_role() in (''admin'',''manager'')) with check (employee_id = public.current_employee_id() or public.current_employee_role() in (''admin'',''manager''))';
  end if;

  -- attendance (owner or admin/manager)
  if to_regclass('public.attendance') is not null then
    execute 'alter table public.attendance enable row level security';
    execute 'drop policy if exists attendance_self_or_admin on public.attendance';
    execute 'create policy attendance_self_or_admin on public.attendance for all using (employee_id = public.current_employee_id() or public.current_employee_role() in (''admin'',''manager'')) with check (employee_id = public.current_employee_id() or public.current_employee_role() in (''admin'',''manager''))';
  end if;

  -- claims (owner or admin/manager)
  if to_regclass('public.claims') is not null then
    execute 'alter table public.claims enable row level security';
    execute 'drop policy if exists claims_self_or_admin on public.claims';
    execute 'create policy claims_self_or_admin on public.claims for all using (employee_id = public.current_employee_id() or public.current_employee_role() in (''admin'',''manager'')) with check (employee_id = public.current_employee_id() or public.current_employee_role() in (''admin'',''manager''))';
  end if;

  -- Non-sensitive reference tables: readable by any authenticated user
  foreach t in array array['company_announcements','departments','company_holidays','feature_flags','evaluation_templates','worker_evaluation_rules','attendance_settings','statutory_wage_tables'] loop
    if to_regclass('public.' || t) is not null then
      execute format('alter table %I enable row level security;', t);
      execute format('drop policy if exists %I on %I;', 'auth_read_' || t, t);
      execute format('create policy %I on %I for select using (auth.role() = ''authenticated'');', 'auth_read_' || t, t);
    end if;
  end loop;

  -- Admin-only config / audit / HR tables
  foreach t in array array['reminder_rules','reminder_logs','system_audit_logs','hr_letters','policy_readiness_items','admin_configurations','payroll_settings','leave_adjustments','attendance_audit_logs','sms_reminder_logs','notification_deliveries','webauthn_challenges','device_auth_tokens','employee_devices','leave_balances','payroll_employee_profiles','attendance_correction_requests'] loop
    if to_regclass('public.' || t) is not null then
      execute format('alter table %I enable row level security;', t);
      execute format('drop policy if exists %I on %I;', t || '_admin', t);
      execute format('create policy %I on %I for all using (public.current_employee_role() = ''admin'') with check (public.current_employee_role() = ''admin'');', t || '_admin', t);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 4) Reload PostgREST schema cache.
-- ---------------------------------------------------------------------------
notify pgrst, 'reload schema';

-- ============================================================================
-- RECOMMENDATIONS (apply separately / next time)
-- ----------------------------------------------------------------------------
-- 1) SEPARATE CONCERNS. Move the following OUT of the repeatable schema script
--    into clearly-named one-off scripts:
--      * The DO $$ block that DELETES a user by email ('acidlati...@gmail.com').
--        It is destructive and the placeholder email will not match anything.
--        Keep data-deletion scripts isolated and double-confirm the email.
--      * The `update employee_devices set status='approved' where employee_id=1`
--        one-off fix (hardcoded IDs 1 / 55).
-- 2) REMOVE the `raw_user_meta_data -> {"role":"admin"}` update for
--    it1@wtecgroup.com.my. The app resolves role from employees.role, NOT from
--    auth user metadata — that metadata is unused and misleading.
-- 3) ADD FOREIGN KEYS for referential integrity + cascade deletes:
--      alter table attendance      add constraint fk_attendance_emp   foreign key (employee_id) references employees(id) on delete cascade;
--      alter table leave_requests   add constraint fk_leave_emp       foreign key (employee_id) references employees(id) on delete cascade;
--      alter table claims           add constraint fk_claims_emp      foreign key (employee_id) references employees(id) on delete cascade;
--      alter table payroll          add constraint fk_payroll_emp     foreign key (employee_id) references employees(id) on delete cascade;
--      alter table employees        add constraint fk_emp_supervisor  foreign key (supervisor_id) references employees(id) on delete set null;
--    (employee_documents already has the cascade FK.)
-- 4) ADD INDEXES on the FK columns above (employee_id) for query performance.
-- 5) CONSOLIDATE the many `create table if not exists` duplicates
--    (notification_deliveries, employee_documents, company_announcements,
--    hr_letters, performance_reviews appear 2x) into ONE clean migration file
--    that is the source of truth; keep this accumulated file only as history.
-- 6) RLS is now default-deny for direct clients — correct. The API uses the
--    service_role key (bypasses RLS), so application behaviour is unchanged.
-- 7) Storage: leave-attachments / claim-attachments are public-readable
--    (acceptable for shared docs); employee-documents is private (correct).
-- ============================================================================
