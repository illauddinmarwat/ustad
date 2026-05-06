# Phase 1 — MVP foundations (months 0–3)

## Objective

Ship a **single-city** marketplace with **two rails** on **Supabase**, proving repeat completed jobs with reviews. **Rail B** must implement **`pending_customer_confirm` → customer confirm → `assigned`**. **No admin approval** for listing publish or worker signup.

## Repository scaffolding (this codebase)

| Item | Location |
|------|----------|
| Expo app | `mobile/` |
| Supabase schema + RPCs | `supabase/migrations/` |
| Env template | `mobile/.env.example`, fixture sample `mobile/env.fixture.sample` |
| Offline dev | `EXPO_PUBLIC_USE_FIXTURES=1` — see [`docs/local-development.md`](../../docs/local-development.md) |
| Runner README | Repo root [`README.md`](../../README.md) |

## Dependencies

- Supabase project (prod + staging), app store dev accounts, FCM project, SMS/OTP provider choice.
- Legal: basic ToS / privacy draft for pilot (counsel recommended before public launch).

## Technical deliverables

### Data & API

- Schema: `profiles`, `jobs` (with `origin`, `pending_customer_confirm`), `quotes`, `messages`, `reviews`, `service_templates`, `worker_service_listings`, `listing_applications`.  
- **RLS** on all tables; privileged transitions via **Edge Functions** or `SECURITY DEFINER` RPCs:  
  - Rail A: accept quote → `assigned`.  
  - Rail B: worker accept application → insert job `pending_customer_confirm`; customer confirm → `assigned`.  
- Storage buckets: private (CNIC); public/signed (avatars, job photos, listing photos).  
- Idempotent “accept application” handler (no duplicate jobs on double-tap).

### Clients

- **React Native** app: customer + worker flows; separate **admin/ops** surface for **templates only** (Retool, internal web, or RN admin role).  
- Screens/modals per [`WorkerzPk-MVP-SinglePage.md`](../../WorkerzPk-MVP-SinglePage.md): browse services, listing detail, apply, **confirm booking**, post job, quotes, applications inbox, publish listing.  
- Notifications: at minimum **push** for “worker accepted — confirm booking,” quote accepted, new message (best-effort).

### Quality

- Error tracking (e.g. Sentry), basic structured logging on Edge Functions.  
- Seed script: categories/templates for pilot city.

## Out of scope (Phase 1)

- Escrow, multi-PSP, ML matching, police verification, per-listing admin QA, instant `assigned` on Rail B.

## Acceptance criteria

- End-to-end **Rail A**: post → quote → accept → complete → review.  
- End-to-end **Rail B**: listing live without approval → apply → worker accept → **`pending_customer_confirm`** visible to customer → **confirm** → `assigned` → complete → review.  
- No trust path requires a human approver for listing or signup.  
- Documented RLS + Edge Function contract for booking state machine.

## Risks & mitigations

| Risk | Mitigation |
|------|------------|
| RLS complexity | Start with strict read rules + server-side transitions only for critical writes |
| Fraud / fake listings | Reports + block user; plan Phase 2 moderation dashboard |
| Customer never confirms | Notification + optional auto-cancel timeout (configurable) |

---

*Phase 1 — last aligned with repo MVP spec (Rail B confirm step, no admin publish gate).*
