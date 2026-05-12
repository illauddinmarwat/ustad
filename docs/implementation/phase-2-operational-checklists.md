# Phase 2 operational checklists

## Feature flag plan

Use flags to ship risky features safely:

- `phase2_payments_manual_enabled`
- `phase2_realtime_messages_enabled`
- `phase2_deeplink_confirm_enabled`
- `phase2_admin_ops_enabled`

Rollout approach:

1. Enable in staging first.
2. Canary on a small beta cohort.
3. Promote gradually by city/cohort.
4. Keep instant rollback path (disable flag, no redeploy).

## Error triage routine (daily)

- Check crash/error dashboard twice daily.
- Triage into P0/P1/P2 with owner and ETA.
- P0: fix same day; P1: within 24h.
- Weekly review: top recurring error classes and root causes.

## Payment reconciliation checklist

Daily:

- Compare `payment_ledger` count and amount totals vs expected paid jobs.
- Review `disputed` and `refunded` statuses with notes.
- Confirm no negative or null monetary anomalies.

Weekly:

- Export ledger summary by status and method.
- Review unresolved disputes with ops owner.

## Regression checklist (Phase 2)

- Auth sign-in/sign-out (customer, worker, admin).
- Rail A: post -> quote -> assign -> complete -> review.
- Rail B: apply -> accept -> confirm -> assign -> complete -> review.
- Payment ledger: mark paid from job detail; update status from admin ops.
- Moderation: submit report from job thread; resolve/dismiss in admin ops.
- Template management: activate/pause in admin ops.

## Go/no-go note template

- Date / release tag:
- Scope included:
- KPI baseline:
- Open risks:
- P0/P1 defect status:
- Rollback plan owner:
- Decision: **GO** / **NO-GO**
