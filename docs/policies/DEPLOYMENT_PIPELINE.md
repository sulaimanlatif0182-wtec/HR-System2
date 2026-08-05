# Deployment Pipeline

## Purpose
Document the production deployment pipeline for the WtecHR portal so every
release is reproducible, verifiable and rollback-able.

## GitHub Main Branch
- `main` is the production integration branch.
- All changes reach `main` through reviewed pull requests (see
  CODE_REVIEW_POLICY.md).
- No direct pushes to `main` without review.

## Vercel Production Deployment
- The Vercel project is linked to the GitHub `main` branch.
- Every push to `main` triggers a production build on Vercel.
- The production domain is defined by `APP_BASE_URL`.

## npm run build Required
- `npm run build` must pass locally before pushing.
- The Vercel build runs `tsc -b && vite build`; a failing build blocks deploy.

## Environment Variable Review
- Before each release, confirm all variables in `.env.example` exist in the
  Vercel project settings.
- New variables must be added to Vercel before the code that reads them ships.

## Vercel Cron
- `vercel.json` defines the cron schedule.
- Current cron: `GET /api/employees?cron_reminders=1` at `0 1 * * *` (UTC).
- The cron endpoint requires the `CRON_SECRET` bearer token.

## Deployment Checklist
- [ ] `npm run build` passed
- [ ] Code review approved
- [ ] Environment variables confirmed
- [ ] Cron schedule verified
- [ ] Deploy green on Vercel
- [ ] Smoke test performed (admin / manager / employee)
- [ ] Rollback tag pushed

## Rollback Process Using Git Tag
If a release must be rolled back, revert to the last stable tag:

```powershell
git tag -l "stable-*"
git checkout stable-hr-release-v1
```

Then force a new deployment from that commit (or re-push the tag's commit to
`main` after fixing the issue).

## Release Tag Convention
- Format: `stable-hr-release-v<N>`
- Example: `stable-hr-release-v1`, `stable-hr-release-v2`

## Example Deployment Commands

```powershell
npm run build
git status
git add .
git commit -m "..."
git pull --rebase origin main
git push origin main

# After the deploy is verified green, tag the release:
git tag stable-hr-release-v1
git push origin stable-hr-release-v1
```
