-- Feature flags table for admin-controlled module toggles.
-- Run this in the Supabase SQL editor once before toggling features.
-- If the table already exists (old key/enabled-only schema), drop and re-run:
--   drop table if exists public.feature_flags;

create table if not exists public.feature_flags (
  key text primary key,
  label text not null,
  category text not null default 'General',
  enabled boolean not null default true,
  updated_by text,
  updated_by_name text,
  updated_at timestamptz not null default now()
);

insert into public.feature_flags (key, label, category, enabled) values
  ('leave_request', 'Leave Requests', 'Leave', true),
  ('leave_approval', 'Leave Approvals', 'Leave', true),
  ('claims_request', 'Claims Submission', 'Claims', true),
  ('claims_approval', 'Claims Approvals', 'Claims', true),
  ('attendance', 'Attendance', 'Attendance', true),
  ('payroll', 'Payroll', 'Payroll', true),
  ('announcements', 'Announcements', 'Communication', true),
  ('hr_letters', 'HR Letters', 'HR Documents', true),
  ('performance', 'Performance Reviews', 'Performance', true),
  ('monthly_reports', 'Monthly Reports', 'Reports', true),
  ('backup', 'Backup Center', 'Administration', true),
  ('system_health', 'System Health', 'Administration', true),
  ('org_chart', 'Org Chart', 'Organization', true),
  ('audit_logs', 'Audit Logs', 'Administration', true),
  ('profile_updates', 'Profile Updates', 'Profile', true),
  ('employees', 'Employee Directory', 'Employees', true)
on conflict (key) do update set
  label = excluded.label,
  category = excluded.category;
