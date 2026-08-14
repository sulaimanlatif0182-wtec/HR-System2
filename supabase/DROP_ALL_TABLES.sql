-- ============================================================================
-- DROP ALL TABLES in the public schema (IRREVERSIBLE — back up first!)
-- Cascades foreign keys, indexes and RLS policies.
-- Does NOT drop auth.users, storage buckets/objects, or functions.
-- ============================================================================
do $$
declare
  r record;
begin
  for r in (
    select tablename
    from pg_tables
    where schemaname = 'public'
  ) loop
    execute format('drop table if exists public.%I cascade;', r.tablename);
  end loop;
end $$;

-- Optional: also drop the email-resolver helper functions (run only if you
-- want a fully clean slate and will recreate them from the repair script).
-- drop function if exists public.current_employee_id();
-- drop function if exists public.current_employee_role();

-- Reload PostgREST cache after dropping.
notify pgrst, 'reload schema';
