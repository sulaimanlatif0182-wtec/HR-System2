-- Tri-state Feature Access: differentiate performance-increment templates (admin)
-- from evaluation templates (worker/manager) inside the Evaluation module.
ALTER TABLE public.evaluation_templates
  ADD COLUMN IF NOT EXISTS type text NOT NULL DEFAULT 'performance_increment',
  ADD COLUMN IF NOT EXISTS created_by_role text NOT NULL DEFAULT 'admin';

-- Make sure old rows are correctly attributed
UPDATE public.evaluation_templates SET type = 'performance_increment' WHERE type IS NULL;
UPDATE public.evaluation_templates SET created_by_role = 'admin' WHERE created_by_role IS NULL;

-- PostgREST schema cache refresh so new columns are exposed through the REST API immediately
NOTIFY pgrst, 'reload schema';
