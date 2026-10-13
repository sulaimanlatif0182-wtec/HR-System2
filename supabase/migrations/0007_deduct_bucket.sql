-- Deduct bucket for EL cascade rows (which bucket an approved row counts
-- against). NULL means the row's own leave_type (legacy behavior).
-- Applied internally during migration; re-apply on Supabase at cutover.
alter table public.leave_requests
  add column if not exists deduct_bucket text;
