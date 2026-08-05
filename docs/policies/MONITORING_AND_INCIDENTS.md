# Monitoring and Incidents

## Purpose
Document how the WtecHR portal is monitored and how incidents are handled so
operational issues are detected early and responded to consistently.

## System Health Page
- Admin page at `/system-health`.
- Checks Supabase tables, storage buckets, SMTP/cron configuration and recent
  reminder logs.
- Returns an overall Healthy / Needs Check status.
- Also reports Policy Readiness table status and incomplete policy count.

## Vercel Deployment Logs
- Vercel shows build and deployment logs for every push to `main`.
- A red build or deployment blocks the release.
- Check runtime function logs for errors after each deploy.

## Supabase Logs
- Supabase logs include authentication, database queries and errors.
- Review for failed auth attempts, permission errors and slow queries.

## SMTP / Reminder Email Validation
- Reminder scheduler sends a summary to admin emails.
- Validate SMTP by confirming sent status and delivery in Vercel function logs.
- Check the System Health environment status for SMTP variables.

## Cron Validation
- Cron is configured in `vercel.json` (`/api/employees?cron_reminders=1`).
- Confirm the scheduled run appears in Vercel logs at the expected time.
- The endpoint must return success with a count of reminders.

## Backup / Export Center
- Admin page at `/backup` (Backup Center).
- Used to export/back up HR data before changes or on schedule.
- Backups are the primary recovery source for data loss.

## Incident Severity Levels

| Level | Description | Example |
| --- | --- | --- |
| P1 - Critical | Portal down, payroll/attendance blocked, data loss | App unavailable, DB unreachable |
| P2 - High | Major feature broken, sensitive data exposed | Payroll wrong, documents inaccessible |
| P3 - Medium | Feature degraded, workaround available | Email sending failing |
| P4 - Low | Cosmetic / non-blocking | Styling or wording issue |

## Incident Response Flow
1. Detect and confirm the incident (System Health, logs, user report).
2. Classify severity (P1-P4).
3. Mitigate: roll back via git tag or disable a feature flag.
4. Notify affected users (HR/IT) for P1/P2.
5. Investigate root cause using Vercel/Supabase logs.
6. Fix with a reviewed PR, deploy, and confirm green.
7. Write a post-incident review for P1/P2 incidents.

## Post-Incident Review Template

```text
Incident ID:
Date / time:
Severity:
Summary:
Impact:
Root cause:
How detected:
Resolution:
Prevention:
Follow-up owner:
Sign-off:
```
