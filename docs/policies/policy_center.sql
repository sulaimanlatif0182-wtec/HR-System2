-- Policy Center - Engineering Policy & Release Readiness system.
-- Run this in the Supabase SQL editor once before opening the Policy Center.
--
-- Creates the policy_readiness_items table, seeds the six policy items and
-- adds the policy_center feature flag (default enabled).
--
-- Note: the feature_flags table in this project has columns
-- (key, label, category, enabled, updated_by, updated_by_name, updated_at).
-- The original design included a "description" column which does not exist in
-- this schema, so it is intentionally omitted here.

create table if not exists public.policy_readiness_items (
  key text primary key,
  title text not null,
  description text,
  status text not null default 'needs_review',
  owner text,
  evidence text,
  last_reviewed_at timestamptz,
  updated_by bigint,
  updated_by_name text,
  updated_at timestamptz not null default now()
);

insert into policy_readiness_items (key, title, description, status, owner)
values
  ('security_testing', 'Security Testing', 'Semgrep, dependency audit, upload validation and audit review evidence.', 'complete', 'IT'),
  ('code_review', 'Code Review', 'Pull request / review policy and approval evidence.', 'needs_review', 'IT / Management'),
  ('database_setup', 'Database Setup', 'Supabase tables, storage buckets, migrations and backup confirmation.', 'needs_review', 'IT'),
  ('deployment_pipeline', 'Deployment Pipeline', 'GitHub, Vercel, build, environment variables and rollback process.', 'needs_review', 'IT'),
  ('monitoring', 'Monitoring & Incidents', 'System Health, Vercel logs, Supabase logs, SMTP, cron and incident process.', 'needs_review', 'IT'),
  ('release_checklist', 'Release Checklist', 'Final checklist for production release sign-off.', 'needs_review', 'HR / IT')
on conflict (key) do nothing;

-- Feature flag so admins can hide the Policy Center if needed.
insert into feature_flags (key, label, category, enabled)
values (
  'policy_center',
  'Policy Center',
  'Admin Pages',
  true
)
on conflict (key) do nothing;
