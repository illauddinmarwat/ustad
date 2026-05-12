# Phase 2 ops runbook (staging -> production)

## 1) Pre-deploy

- Confirm branch/tag and migration list.
- Confirm backup point (Supabase point-in-time restore window or manual backup snapshot).
- Confirm rollback owner and communication channel.

## 2) Staging dry run

1. Apply pending migrations on staging.
2. Run DB tests: `npx supabase test db` (or linked equivalent).
3. Run mobile typecheck/tests:
   - `cd mobile && npm run typecheck`
   - `npm test`
4. Execute smoke checks:
   - Auth sign-in
   - Rail A: post -> quote -> assign
   - Rail B: apply -> accept -> confirm -> assign
   - Job complete + review
   - Admin suspend/resolve report

## 3) Production deployment

1. Announce deployment window.
2. Apply migrations in order.
3. Validate schema health and RPC availability.
4. Release app build/profile if needed.

## 4) Post-deploy verification

- Check app events ingestion (`app_events` volume).
- Verify payment ledger insert path (`mark_job_paid`).
- Verify abuse report queue visibility for admin.
- Monitor errors for first 30 minutes.

## 5) Rollback

- App rollback: ship previous build/profile.
- DB rollback: avoid destructive down-migrations on live data; prefer hotfix migration.
- If critical, restore DB to backup point and re-run smoke checks.
