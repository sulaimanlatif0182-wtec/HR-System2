-- WtecHR: Per-employee feature access (Options 1 + 2)
-- 1) employee_feature_access  = per-employee overrides (Option 1)
-- 2) role_feature_defaults    = default access per role (Option 2)
-- Effective rule: feature visible iff global flag enabled
--   AND (no role default OR role default enabled)
--   AND (no employee override OR employee override enabled)
-- Run in Supabase SQL editor. Safe to run repeatedly.

create table if not exists public.employee_feature_access (
  employee_id bigint not null references public.employees(id) on delete cascade,
  feature_key text not null,
  enabled boolean not null,
  primary key (employee_id, feature_key)
);

create index if not exists employee_feature_access_employee_idx
  on public.employee_feature_access (employee_id);

create table if not exists public.role_feature_defaults (
  role text not null,
  feature_key text not null,
  enabled boolean not null,
  primary key (role, feature_key)
);

create index if not exists role_feature_defaults_role_idx
  on public.role_feature_defaults (role);

-- Only the API service role may touch these tables (mirrors worker_sessions).
alter table public.employee_feature_access enable row level security;
drop policy if exists "service_only_employee_feature_access" on public.employee_feature_access;
create policy "service_only_employee_feature_access" on public.employee_feature_access
  for all using (false) with check (false);

alter table public.role_feature_defaults enable row level security;
drop policy if exists "service_only_role_feature_defaults" on public.role_feature_defaults;
create policy "service_only_role_feature_defaults" on public.role_feature_defaults
  for all using (false) with check (false);

-- ---------------------------------------------------------------------------
-- Seed role defaults (safe to re-run)
-- ---------------------------------------------------------------------------
insert into public.role_feature_defaults (role, feature_key, enabled)
select role, feature_key, enabled
from (
  values
    ('admin',   'leave_request',     true),
    ('admin',   'leave_approval',    true),
    ('admin',   'claims_request',    true),
    ('admin',   'claims_approval',   true),
    ('admin',   'attendance',        true),
    ('admin',   'payroll',           true),
    ('admin',   'announcements',     true),
    ('admin',   'hr_letters',        true),
    ('admin',   'performance',       true),
    ('admin',   'monthly_reports',   true),
    ('admin',   'backup',            true),
    ('admin',   'system_health',     true),
    ('admin',   'org_chart',         true),
    ('admin',   'audit_logs',        true),
    ('admin',   'profile_updates',   true),
    ('admin',   'employees',         true),
    ('admin',   'reminder_scheduler',true),
    ('admin',   'policy_center',     true),

    ('manager', 'leave_request',     true),
    ('manager', 'leave_approval',    true),
    ('manager', 'claims_request',    true),
    ('manager', 'claims_approval',   true),
    ('manager', 'attendance',        true),
    ('manager', 'payroll',           true),
    ('manager', 'announcements',     true),
    ('manager', 'hr_letters',        true),
    ('manager', 'performance',       true),
    ('manager', 'monthly_reports',   true),
    ('manager', 'backup',            true),
    ('manager', 'system_health',     true),
    ('manager', 'org_chart',         true),
    ('manager', 'audit_logs',        true),
    ('manager', 'profile_updates',   true),
    ('manager', 'employees',         true),
    ('manager', 'reminder_scheduler',true),
    ('manager', 'policy_center',     true),

    ('employee', 'leave_request',    true),
    ('employee', 'leave_approval',   true),
    ('employee', 'claims_request',   true),
    ('employee', 'claims_approval',  true),
    ('employee', 'attendance',       true),
    ('employee', 'payroll',          true),
    ('employee', 'announcements',    true),
    ('employee', 'hr_letters',       true),
    ('employee', 'performance',      true),
    ('employee', 'monthly_reports',  true),
    ('employee', 'backup',           true),
    ('employee', 'system_health',    true),
    ('employee', 'org_chart',        true),
    ('employee', 'audit_logs',       true),
    ('employee', 'profile_updates',  true),
    ('employee', 'employees',        true),
    ('employee', 'reminder_scheduler',true),
    ('employee', 'policy_center',    true),

    ('worker',  'leave_request',     true),
    ('worker',  'leave_approval',    true),
    ('worker',  'claims_request',    true),
    ('worker',  'claims_approval',   true),
    ('worker',  'attendance',        true),
    ('worker',  'payroll',           false),
    ('worker',  'announcements',     true),
    ('worker',  'hr_letters',        false),
    ('worker',  'performance',       true),
    ('worker',  'monthly_reports',   false),
    ('worker',  'backup',            false),
    ('worker',  'system_health',     false),
    ('worker',  'org_chart',         false),
    ('worker',  'audit_logs',        false),
    ('worker',  'profile_updates',   true),
    ('worker',  'employees',         false),
    ('worker',  'reminder_scheduler',false),
    ('worker',  'policy_center',     false)
) as seed(role, feature_key, enabled)
on conflict (role, feature_key) do nothing;