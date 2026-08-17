-- 0003_run_system_maintenance.sql
-- One-click maintenance routine for the System Health page.
-- Refreshes planner statistics (fixes slow queries / "lag"), prunes stale
-- reminder logs, and returns a summary the API surfaces to the admin UI.
-- Idempotent: can be run multiple times safely.

create or replace function run_system_maintenance()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  tables text[] := array[
    'employees', 'attendance', 'leave_requests', 'claims', 'payroll',
    'company_announcements', 'reminder_rules', 'reminder_logs',
    'system_audit_logs', 'employee_documents'
  ];
  analyzed text[] := '{}';
  pruned int := 0;
  t text;
begin
  foreach t in array tables loop
    begin
      execute format('analyze %I', t);
      analyzed := array_append(analyzed, t);
    exception when others then
      -- table may not exist yet; skip quietly
    end;
  end loop;

  delete from reminder_logs
  where created_at < now() - interval '90 days';

  get diagnostics pruned = row_count;

  return jsonb_build_object(
    'analyzed_tables', to_jsonb(analyzed),
    'pruned_reminders', pruned,
    'ran_at', to_jsonb(now())
  );
end;
$$;

grant execute on function run_system_maintenance() to service_role;