# Code Review Policy

## Purpose
Ensure no production change is released without human code review and
documented approval. Code review is the primary quality and safety gate for
the WtecHR portal.

## Branching Rule
- All development work is done on a branch or fork.
- The `main` branch is the protected integration branch.
- Direct changes to `main` without a pull request are not allowed.

## No Direct Production Change Without Review
- No commit may be pushed straight to the production branch without a review.
- Production changes require at least one approved review before merge.
- Emergency hotfixes still require review; a second reviewer may be added
  immediately after the fix is applied.

## Minimum Reviewer Rule
- At least one (1) reviewer must approve a pull request before merge.
- Reviewers must not be the author of the change unless it is a trivial
  administrative change that is logged.

## AI-Assisted Code Review
- AI-assisted review is allowed and encouraged as a first pass.
- AI assistance is NOT the sole approval. A human reviewer must confirm
  correctness, security and business logic before merge.

## Checklist Before Merge
Verify each of the following before merging:

- [ ] Security: no injection, exposed secrets, or unsafe file handling
- [ ] Roles/permissions: admin/manager/employee access is correct
- [ ] Database changes: migrations, tables and backups documented
- [ ] Environment variables: new variables listed in `.env.example` and Vercel
- [ ] File upload/storage: bucket policy and path validation reviewed
- [ ] Payroll/privacy impact: no sensitive data exposed or logged
- [ ] Vercel function count: no new API files unless required
- [ ] Build passes: `npm run build` is green

## Sign-off Template

```text
Change / PR:
Author:
Reviewer:
Review date:
Build passed: [Yes / No]
Security checked: [Yes / No]
DB changes reviewed: [Yes / No]
AI-assisted review used: [Yes / No] (human approval still required)
Approved: [Yes / No]
Notes:
```
