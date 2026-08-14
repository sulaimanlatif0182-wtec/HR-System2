-- NimbusHR: RLS + worker_sessions (run in Supabase SQL editor)
-- 1) Worker session table (used by /api/auth/worker-login)
create table if not exists public.worker_sessions (
  id uuid primary key default gen_random_uuid(),
  employee_id bigint not null references public.employees(id) on delete cascade,
  token text unique not null,
  expires_at timestamptz not null,
  created_at timestamptz default now()
);
create index if not exists worker_sessions_token_idx on public.worker_sessions(token);
create index if not exists worker_sessions_employee_idx on public.worker_sessions(employee_id);
alter table public.worker_sessions enable row level security;

-- 2) Enable RLS on application tables
alter table public.employees enable row level security;
alter table public.attendance enable row level security;
alter table public.leave_requests enable row level security;
alter table public.payroll enable row level security;
alter table public.claims enable row level security;
alter table public.departments enable row level security;
alter table public.company_announcements enable row level security;
alter table public.employee_documents enable row level security;
alter table public.reminder_rules enable row level security;
alter table public.reminder_logs enable row level security;
alter table public.system_audit_logs enable row level security;
alter table public.employee_profile_update_requests enable row level security;
alter table public.attendance_correction_requests enable row level security;
alter table public.hr_letters enable row level security;
alter table public.performance_reviews enable row level security;
alter table public.evaluations enable row level security;
alter table public.evaluation_templates enable row level security;
alter table public.worker_evaluation_rules enable row level security;
alter table public.policy_readiness_items enable row level security;
alter table public.admin_configurations enable row level security;
alter table public.company_holidays enable row level security;

-- 3) Helper: caller's role from employees (auth.uid() == employees.id)
create or replace function public.current_employee_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(role, 'employee') from public.employees where id = auth.uid() limit 1;
$$;

-- 4) Anon = no direct table access (default-deny). Authenticated policies below.
drop policy if exists employees_select on public.employees;
create policy employees_select on public.employees
  for select using (id = auth.uid() or public.current_employee_role() = 'admin');
drop policy if exists employees_write on public.employees;
create policy employees_write on public.employees
  for all using (id = auth.uid() or public.current_employee_role() = 'admin')
  with check (id = auth.uid() or public.current_employee_role() = 'admin');

drop policy if exists attendance_policy on public.attendance;
create policy attendance_policy on public.attendance
  for all using (employee_id = auth.uid() or public.current_employee_role() in ('admin','manager'))
  with check (employee_id = auth.uid() or public.current_employee_role() in ('admin','manager'));

drop policy if exists leave_policy on public.leave_requests;
create policy leave_policy on public.leave_requests
  for all using (employee_id = auth.uid() or public.current_employee_role() in ('admin','manager'))
  with check (employee_id = auth.uid() or public.current_employee_role() in ('admin','manager'));

drop policy if exists payroll_select on public.payroll;
create policy payroll_select on public.payroll
  for select using (employee_id = auth.uid() or public.current_employee_role() in ('admin','manager'));
drop policy if exists payroll_write on public.payroll;
create policy payroll_write on public.payroll
  for all using (public.current_employee_role() in ('admin','manager'))
  with check (public.current_employee_role() in ('admin','manager'));

drop policy if exists claims_policy on public.claims;
create policy claims_policy on public.claims
  for all using (employee_id = auth.uid() or public.current_employee_role() in ('admin','manager'))
  with check (employee_id = auth.uid() or public.current_employee_role() in ('admin','manager'));

-- Admin-only config-type tables
do $$
declare t text;
begin
  foreach t in array array[
    'departments','company_announcements','employee_documents','reminder_rules','reminder_logs',
    'system_audit_logs','employee_profile_update_requests','attendance_correction_requests','hr_letters',
    'performance_reviews','evaluations','evaluation_templates','worker_evaluation_rules',
    'policy_readiness_items','admin_configurations','company_holidays'
  ]
  loop
    execute format('drop policy if exists %1$I_admin on public.%1$I', t);
    execute format(
      'create policy %1$I_admin on public.%1$I for all using (public.current_employee_role() = ''admin'') with check (public.current_employee_role() = ''admin'')',
      t
    );
  end loop;
end $$;
