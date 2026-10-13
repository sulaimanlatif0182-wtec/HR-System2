# HRM internal deploy notes (Path B-slim, code unchanged except VITE_API_PREFIX)

## 1. Build the SPA (on your PC, in Hr-system(2))
# VITE_SUPABASE_URL must be the PUBLIC funnel URL + /hrm (phones reach it).
# VITE_API_PREFIX=/hrm makes apiFetch call /hrm/api/... (funnel subpath).
set VITE_SUPABASE_URL=https://wtec-helpdesk.tail9327a5.ts.net/hrm
set VITE_SUPABASE_ANON_KEY=<anon key from server ~/.secrets/hrm_stack.env>
set VITE_API_PREFIX=/hrm
npx vite build --base=/hrm/
# Output: dist/ -> copy to server ~/hrm-stack/web/ (nginx serves it).

## 2. Server env for internal-api.js (node server/internal-api.js, PORT default 3001)
SUPABASE_URL=http://127.0.0.1:8000          # Kong, reachable from server
VITE_SUPABASE_URL=http://127.0.0.1:8000     # backend JWT verify via GoTrue
VITE_SUPABASE_ANON_KEY=<anon key>
SUPABASE_SERVICE_ROLE_KEY=<service key>
FRONTEND_URL=https://wtec-helpdesk.tail9327a5.ts.net  # CORS allow-list
APP_BASE_URL=https://wtec-helpdesk.tail9327a5.ts.net/hrm
SMTP_*                # same SMTP as today (email keeps working)
CRON_SECRET=<generate: openssl rand -hex 32>

## 3. Cron (replaces 2 Vercel crons) - system crontab on server
# 0 1 * * * curl -s -H "Authorization: Bearer $CRON_SECRET" http://127.0.0.1:3001/api/employees?cron_reminders=1
# 0 2 * * * curl -s -H "Authorization: Bearer $CRON_SECRET" http://127.0.0.1:3001/api/employees?announcement_cleanup=1

## 4. Known gaps (NOT working internally yet)
- Storage uploads (Claims/Leave/Employees attach pages) need storage-api; buckets are empty so nothing to migrate, feature deferred.
- Google sign-in needs GoTrue Google provider + redirect URI config; email+password works now.
- Password reset emails need GoTrue SMTP config; deferred with reset links (choice A at go-live).
- Supabase cloud project stays live as rollback until 2 clean cycles, then delete.
