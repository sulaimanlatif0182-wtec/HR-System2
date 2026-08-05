# Release Checklist

## Purpose
Final pre-release checklist that must be completed and signed off before a
production release of the WtecHR portal.

## Checklist

- [ ] Build passed (`npm run build`)
- [ ] Security scan completed (`npm audit --audit-level=high`, Semgrep)
- [ ] Code review approved
- [ ] Database migration completed and logged
- [ ] Vercel deployment green
- [ ] Smoke test passed (admin / manager / employee)
- [ ] Cron tested
- [ ] Email tested
- [ ] Backup tested
- [ ] Audit logs tested
- [ ] Feature toggles checked
- [ ] Known risks accepted
- [ ] Release approver:
- [ ] Date:
