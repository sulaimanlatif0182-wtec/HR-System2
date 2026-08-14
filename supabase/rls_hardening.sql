-- ============================================================================
-- NimbusHR — RLS hardening script  (REVISED, failure-tolerant)
-- Run this in the Supabase dashboard: SQL Editor -> paste -> Run.
--
-- This version GUARDS every statement with an existence check, so if a table
-- does not exist in YOUR database the script skips it instead of aborting.
-- (Your schema differs from the assumed names: e.g. there is no
-- `employee_profiles`; the migration uses `employee_profile_update_requests`,
-- `company_announcements`, etc.)
--
-- LINK MODEL (unchanged from prior reasoning):
--   employees.id is an INTEGER (bigint), auth.uid() is a UUID -> they can never
--   be equal. The app links an auth user to an employee by EMAIL (register.js
--   whitelists by email and never stores a uuid on the employee row). So we
--   resolve the caller's employee id/role via their auth email.
--
-- After running, check the "missing tables" note at the bottom and tell me the
-- real names if you want RLS applied to tables this script skipped.
-- ============================================================================

-- 1) Resolve the caller's employee id / role via their auth EMAIL.
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

-- 2) All RLS + policies guarded by table existence (skip missing tables).
do $$
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

  -- employee_profiles / employee_profile_update_requests
  if to_regclass('public.employee_profiles') is not null then
    execute 'alter table public.employee_profiles enable row level security';
    execute 'drop policy if exists profiles_self_or_admin on public.employee_profiles';
    execute 'create policy profiles_self_or_admin on public.employee_profiles for all using (employee_id = public.current_employee_id() or public.current_employee_role() = ''admin'') with check (employee_id = public.current_employee_id() or public.current_employee_role() = ''admin'')';
  end if;
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

  -- payroll
  if to_regclass('public.payroll') is not null then
    execute 'alter table public.payroll enable row level security';
    execute 'drop policy if exists payroll_self_or_admin on public.payroll';
    execute 'create policy payroll_self_or_admin on public.payroll for select using (employee_id = public.current_employee_id() or public.current_employee_role() = ''admin'')';
    execute 'drop policy if exists payroll_admin_write on public.payroll';
    execute 'create policy payroll_admin_write on public.payroll for insert with check (public.current_employee_role() = ''admin'')';
    execute 'drop policy if exists payroll_admin_update on public.payroll';
    execute 'create policy payroll_admin_update on public.payroll for update using (public.current_employee_role() = ''admin'') with check (public.current_employee_role() = ''admin'')';
  end if;

  -- leave_requests
  if to_regclass('public.leave_requests') is not null then
    execute 'alter table public.leave_requests enable row level security';
    execute 'drop policy if exists leave_self_or_admin on public.leave_requests';
    execute 'create policy leave_self_or_admin on public.leave_requests for all using (employee_id = public.current_employee_id() or public.current_employee_role() in (''admin'',''manager'')) with check (employee_id = public.current_employee_id() or public.current_employee_role() in (''admin'',''manager''))';
  end if;

  -- attendance
  if to_regclass('public.attendance') is not null then
    execute 'alter table public.attendance enable row level security';
    execute 'drop policy if exists attendance_self_or_admin on public.attendance';
    execute 'create policy attendance_self_or_admin on public.attendance for all using (employee_id = public.current_employee_id() or public.current_employee_role() in (''admin'',''manager'')) with check (employee_id = public.current_employee_id() or public.current_employee_role() in (''admin'',''manager''))';
  end if;

  -- claims
  if to_regclass('public.claims') is not null then
    execute 'alter table public.claims enable row level security';
    execute 'drop policy if exists claims_self_or_admin on public.claims';
    execute 'create policy claims_self_or_admin on public.claims for all using (employee_id = public.current_employee_id() or public.current_employee_role() in (''admin'',''manager'')) with check (employee_id = public.current_employee_id() or public.current_employee_role() in (''admin'',''manager''))';
  end if;

  -- reminders / reminder_rules / reminder_logs
  if to_regclass('public.reminders') is not null then
    execute 'alter table public.reminders enable row level security';
    execute 'drop policy if exists reminders_auth_read on public.reminders';
    execute 'create policy reminders_auth_read on public.reminders for select using (auth.role() = ''authenticated'')';
    execute 'drop policy if exists reminders_admin_write on public.reminders';
    execute 'create policy reminders_admin_write on public.reminders for all using (public.current_employee_role() = ''admin'') with check (public.current_employee_role() = ''admin'')';
  end if;
  if to_regclass('public.reminder_rules') is not null then
    execute 'alter table public.reminder_rules enable row level security';
    execute 'drop policy if exists reminder_rules_admin on public.reminder_rules';
    execute 'create policy reminder_rules_admin on public.reminder_rules for all using (public.current_employee_role() = ''admin'') with check (public.current_employee_role() = ''admin'')';
  end if;
  if to_regclass('public.reminder_logs') is not null then
    execute 'alter table public.reminder_logs enable row level security';
    execute 'drop policy if exists reminder_logs_admin on public.reminder_logs';
    execute 'create policy reminder_logs_admin on public.reminder_logs for all using (public.current_employee_role() = ''admin'') with check (public.current_employee_role() = ''admin'')';
  end if;

  -- notifications
  if to_regclass('public.notifications') is not null then
    execute 'alter table public.notifications enable row level security';
    execute 'drop policy if exists notifications_auth_read on public.notifications';
    execute 'create policy notifications_auth_read on public.notifications for select using (auth.role() = ''authenticated'')';
  end if;

  -- announcements / company_announcements
  if to_regclass('public.announcements') is not null then
    execute 'alter table public.announcements enable row level security';
    execute 'drop policy if exists announcements_auth_read on public.announcements';
    execute 'create policy announcements_auth_read on public.announcements for select using (auth.role() = ''authenticated'')';
    execute 'drop policy if exists announcements_admin_write on public.announcements';
    execute 'create policy announcements_admin_write on public.announcements for all using (public.current_employee_role() = ''admin'') with check (public.current_employee_role() = ''admin'')';
  end if;
  if to_regclass('public.company_announcements') is not null then
    execute 'alter table public.company_announcements enable row level security';
    execute 'drop policy if exists company_announcements_auth_read on public.company_announcements';
    execute 'create policy company_announcements_auth_read on public.company_announcements for select using (auth.role() = ''authenticated'')';
    execute 'drop policy if exists company_announcements_admin_write on public.company_announcements';
    execute 'create policy company_announcements_admin_write on public.company_announcements for all using (public.current_employee_role() = ''admin'') with check (public.current_employee_role() = ''admin'')';
  end if;

  -- admin-only config / audit tables
  if to_regclass('public.admin_configurations') is not null then
    execute 'alter table public.admin_configurations enable row level security';
    execute 'drop policy if exists admin_config_admin on public.admin_configurations';
    execute 'create policy admin_config_admin on public.admin_configurations for all using (public.current_employee_role() = ''admin'') with check (public.current_employee_role() = ''admin'')';
  end if;
  if to_regclass('public.system_audit_logs') is not null then
    execute 'alter table public.system_audit_logs enable row level security';
    execute 'drop policy if exists audit_admin on public.system_audit_logs';
    execute 'create policy audit_admin on public.system_audit_logs for select using (public.current_employee_role() = ''admin'')';
  end if;
  if to_regclass('public.hr_letters') is not null then
    execute 'alter table public.hr_letters enable row level security';
    execute 'drop policy if exists hr_letters_admin on public.hr_letters';
    execute 'create policy hr_letters_admin on public.hr_letters for all using (public.current_employee_role() = ''admin'') with check (public.current_employee_role() = ''admin'')';
  end if;
  if to_regclass('public.policy_readiness_items') is not null then
    execute 'alter table public.policy_readiness_items enable row level security';
    execute 'drop policy if exists policy_readiness_admin on public.policy_readiness_items';
    execute 'create policy policy_readiness_admin on public.policy_readiness_items for all using (public.current_employee_role() = ''admin'') with check (public.current_employee_role() = ''admin'')';
  end if;
  if to_regclass('public.departments') is not null then
    execute 'alter table public.departments enable row level security';
    execute 'drop policy if exists departments_admin on public.departments';
    execute 'create policy departments_admin on public.departments for all using (public.current_employee_role() = ''admin'') with check (public.current_employee_role() = ''admin'')';
  end if;
  if to_regclass('public.company_holidays') is not null then
    execute 'alter table public.company_holidays enable row level security';
    execute 'drop policy if exists company_holidays_admin on public.company_holidays';
    execute 'create policy company_holidays_admin on public.company_holidays for all using (public.current_employee_role() = ''admin'') with check (public.current_employee_role() = ''admin'')';
  end if;
end $$;

-- 3) Show which guarded tables actually exist, so you can see what was covered.
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_type = 'BASE TABLE'
order by table_name;
