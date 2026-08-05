# Database Setup

## Purpose
Document the Supabase project structure and the process for applying and
verifying database changes so database setup is reproducible and confirmed.

## Supabase Project Overview
- Hosting: Supabase (PostgreSQL + Auth + Storage)
- Project reference: defined by `SUPABASE_URL` / `VITE_SUPABASE_URL`
- Client: `@supabase/supabase-js`
- Server access: `SUPABASE_SERVICE_ROLE_KEY`

## Required Tables
The following tables are expected to exist in the `public` schema:

| Area | Tables |
| --- | --- |
| People | `employees` |
| Attendance | `attendance`, `attendance_settings`, `company_holidays`, `attendance_audit_logs`, `attendance_correction_requests` |
| Leave | `leave_requests`, `leave_balances`, `leave_adjustments`, `leave_balance_audit_logs` |
| Claims | `claims` |
| Payroll | `payroll`, `payroll_batches`, `payroll_settings`, `payroll_employee_profiles`, `statutory_wage_tables` |
| HR Documents | `employee_documents`, `employee_profile_update_requests`, `performance_reviews`, `hr_letters`, `company_announcements` |
| Administration | `system_audit_logs`, `admin_configurations`, `reminder_rules`, `reminder_logs`, `feature_flags` |
| Policy | `policy_readiness_items` |

## Required Buckets
Supabase Storage buckets that must exist:

- `employee-documents`
- `leave-attachments`
- `claim-attachments`

## Required Auth Settings
- Authentication provider enabled for email/password sign-in.
- Registered users must be linked to an `employees` row by email.
- Public sign-up is disabled; accounts are provisioned through the portal.
- Admin, manager and employee role assignments are stored on `employees.role`.

## Required Environment Variables
| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` / `VITE_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `VITE_SUPABASE_ANON_KEY` | Public anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-side service role key |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`, `SMTP_FROM_NAME` | Email sending |
| `APP_BASE_URL` | Public app URL used in emails |
| `CRON_SECRET` | Bearer token for Vercel cron calls |

## Migration Process
1. Write the migration as a `.sql` file under `database/` or `docs/policies/`.
2. Review the SQL for destructive statements (`drop`, `truncate`, `delete`).
3. Back up the affected tables (see Backup Before Migration).
4. Run the migration in the Supabase SQL editor or via the CLI.
5. Confirm the new tables/columns are present.
6. Log the execution in the SQL Execution Log.

## Backup Before Migration
- For table additions only: no backup required, but log the migration.
- For table/column changes that touch existing data: export the affected
  tables to CSV or use a Supabase backup before applying.
- Never run a migration that drops a table with live data without a backup.

## Rollback Notes
- Prefer additive migrations so rollback is a no-op.
- If a migration must be rolled back, re-apply the previous schema from the
  prior backup or a documented down-migration.
- Log the rollback in the SQL Execution Log with the reason.

## SQL Execution Log Template

```text
Date:
Executed by:
Environment (prod/staging):
Script:
Description:
Backup taken: [Yes / No] (file/location)
Result: [Success / Failed]
Rollback needed: [Yes / No]
Notes:
```
