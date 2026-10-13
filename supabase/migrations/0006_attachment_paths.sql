-- Attachment storage paths for private buckets (replaces public URLs).
-- Applied internally during migration; re-apply on Supabase at cutover.
alter table public.claims
  add column if not exists attachment_path text;
alter table public.leave_requests
  add column if not exists attachment_path text;
