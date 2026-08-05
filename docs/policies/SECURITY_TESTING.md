# Security Testing Policy

## Purpose
Define how the WtecHR portal is security-tested before every release so that
code shipped to production has documented security evidence. This satisfies
internal review requirements for confirmed security testing.

## Security Scan Approach
Security testing combines automated scanning with manual review across the
following layers:

- Static code analysis (Semgrep) for injection, auth, secrets and data issues
- Dependency vulnerability audit (npm audit)
- File upload / storage validation review
- Authentication and role/permission review
- Audit log review

## Semgrep Usage
Semgrep scans the repository for security anti-patterns. Run it before every
release and record the result in the release evidence.

### Example commands

```powershell
# Build must pass before scanning
npm run build

# Dependency audit (fails on high or critical vulnerabilities)
npm audit --audit-level=high

# Semgrep scan of the whole repository
npx semgrep --config auto .
```

If Semgrep is not installed globally, it can be run via `npx` (as above) or
as a step in CI. No global installation is required.

## Dependency Audit
- Run `npm audit --audit-level=high` before release.
- Fix or document every `high` / `critical` finding.
- Keep `package-lock.json` in sync and committed.

## Upload / File Handling Checks
- Only allow the configured file types per feature (employee documents,
  leave attachments, claim attachments).
- Files are stored in Supabase Storage buckets, not on the app server.
- Review bucket policies so private HR files are not public.
- Validate file paths before generating signed URLs.

## Auth / Role Review
- Confirm Admin pages are Admin-only at the route level and at the API level.
- Confirm manager pages are limited to admin + manager.
- Confirm employees can only read/edit their own records.
- Feature toggles must be enforced in the API as well as the UI.

## Audit Log Review
- `system_audit_logs` must record module, action, record id, actor and change data.
- Confirm sensitive actions (config change, payroll, document upload/delete,
  policy readiness updates) write an audit entry.
- Audit insert failures must not break the primary save operation.

## How to Run
1. `npm run build`
2. `npm audit --audit-level=high`
3. `npx semgrep --config auto .`
4. Manual upload/auth/role spot checks on the deployed app
5. Confirm audit log entries appear for test actions

## Evidence Checklist
- [ ] `npm run build` passed
- [ ] `npm audit --audit-level=high` passed (no unresolved high/critical)
- [ ] Semgrep scan completed and findings reviewed
- [ ] Upload/file handling review recorded
- [ ] Auth/role review recorded
- [ ] Audit log entries confirmed

## Owner / Sign-off
- Owner: IT
- Review date:
- Sign-off (name / role / date):
