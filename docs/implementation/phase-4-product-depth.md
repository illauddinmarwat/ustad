# Phase 4 — Product depth & revenue mix (months 9–12)

## Objective

Expand **differentiation** (tracking, subscriptions, quality programs) while keeping the **two-rail booking spine** stable.

## Dependencies

- Stable payment & support from Phase 2–3.  
- Partner conversations for insurance/guarantee if promised publicly.

## Technical deliverables

### Real-time field features (lite)

- Optional worker **en-route** sharing (privacy-safe): coarse ETA, start/stop job timer.  
- Job timeline UI (assigned → in progress → complete).

### Monetization expansion

- **Subscriptions** (Worker Pro / Customer Plus) with feature flags.  
- Featured listings / boosts with impression tracking.

### Quality & trust programs

- Post-job photo prompts, satisfaction micro-surveys.  
- Partnered **guarantee** wording + claims intake (workflow tool).

### Web / PWA

- Customer-facing **web** for browse + confirm + pay (secondary to native).

### UI polish lane (Airtasker-inspired)

- Expand reusable components across native + web so trust/booking patterns look consistent.
- Polish timeline and in-progress states for faster comprehension (assigned, en route, active, complete).
- Add accessibility polish (tap targets, contrast, dynamic type) into the phase definition of done.

## Acceptance criteria

- Subscription billing reconciles with ledger.  
- GPS features have clear privacy copy + opt-in.  
- No regression on Rail B confirm flow (`pending_customer_confirm` still explicit).
- Shared design system coverage for all high-traffic booking screens (native + web where applicable).

---

*Phase 4 — revenue and depth; avoid rewriting hiring state machine.*

## Slice plan (execution order)

1. **Slice 1 — Realtime field features (lite foundation)**  
   Add additive realtime state table + worker RPC controls (en-route, coarse ETA, timer), timeline UI in job detail, and analytics events.  
   **Guardrail:** no edits to `jobs.status` contract; Rail B still uses `pending_customer_confirm`.
2. **Slice 2 — Subscriptions foundation**  
   Add Worker Pro / Customer Plus plans + subscription state + app gating behind `app_settings`.
3. **Slice 3 — Featured listings / boosts**  
   Add boost inventory + impression/click tracking, with deterministic non-boost fallback.
4. **Slice 4 — Quality & trust lane**  
   Add post-job photo prompt metadata, micro-survey capture, and guarantee/claims intake stub.
5. **Slice 5 — Web/PWA + shared UI polish**  
   Customer web browse/confirm/pay pass (secondary), shared design-system coverage, accessibility polish.
6. **Slice 6 — Closeout and hardening**  
   Reliability sweep, docs closeout, KPI validation.

## Slice 1 implementation notes (started 2026-05-07)

- DB migration: `supabase/migrations/20260507220000_phase4_realtime_lite.sql`
  - Seeds `phase4_realtime_enabled` in `app_settings` (default `false`).
  - Adds `job_realtime_states` alongside existing job spine.
  - Adds worker-only RPC `worker_set_job_realtime_state(...)` (security definer) with coarse ETA bucketing and additive timer accumulation.
- DB tests: `supabase/tests/database/phase4_realtime_lite.test.sql` validates table shape, function existence, and ETA bucketing.
- Mobile:
  - Adds `mobile/src/lib/phase4Flags.ts` for feature-gated rollout (default off on failures).
  - Adds realtime helper utilities and Jest coverage in `mobile/src/lib/realtime.ts` and `mobile/src/lib/realtime.test.ts`.
  - Adds timeline + worker en-route/timer controls in `mobile/src/screens/app/JobDetailScreen.tsx` behind `phase4_realtime_enabled`.

## Notes

- This slice intentionally keeps realtime as "lite": no background location streaming and no booking lifecycle rewrite.
- All new behavior is additive and non-blocking when flags are off or RPC calls fail.

## Slice 2 implementation notes (started 2026-05-07)

- DB migration: `supabase/migrations/20260507230000_phase4_subscriptions_foundation.sql`
  - Seeds `phase4_subscriptions_enabled` in `app_settings` (default `false`).
  - Adds additive monetization tables: `subscription_plans`, `user_subscriptions`, `subscription_ledger_links`.
  - Adds `subscribe_me_to_plan(...)` and `get_my_subscription_features()` RPCs (security definer).
  - Adds internal `phase4_subscription_perks(...)` helper with explicit execute revokes for client roles.
- DB tests: `supabase/tests/database/phase4_subscriptions_foundation.test.sql` validates schema/function/flag defaults and revokes.
- Mobile:
  - Extends `mobile/src/lib/phase4Flags.ts` with `subscriptionsEnabled`.
  - Adds subscription helpers + Jest coverage in `mobile/src/lib/subscriptions.ts` and `mobile/src/lib/subscriptions.test.ts`.
  - Adds account membership card and self-activation CTA in `mobile/src/screens/app/AccountScreen.tsx` (flag-gated).
  - Adds admin rollout toggles for `phase4_realtime_enabled` and `phase4_subscriptions_enabled` in `mobile/src/screens/app/AdminOpsScreen.tsx`.

## Slice 3 implementation notes (started 2026-05-07)

- DB migration: `supabase/migrations/20260508000000_phase4_featured_boosts.sql`
  - Seeds `phase4_boosts_enabled` in `app_settings` (default `false`).
  - Adds additive monetization/analytics tables: `listing_boosts`, `listing_promo_events`.
  - Adds `rank_listings_with_boosts(...)` (security definer) for deterministic boost-aware ordering.
  - Adds `track_listing_promo_event(...)` (security definer) for impression/click capture.
- DB tests: `supabase/tests/database/phase4_featured_boosts.test.sql` validates schema/functions/indexes/flag defaults.
- Mobile:
  - Extends `mobile/src/lib/phase4Flags.ts` with `boostsEnabled`.
  - Adds boost helper + Jest coverage in `mobile/src/lib/boosts.ts` and `mobile/src/lib/boosts.test.ts`.
  - Updates `mobile/src/screens/app/ServicesScreen.tsx` to:
    - use boost-aware RPC when ranking + boosts flags are enabled,
    - render `Featured` chip on boosted rows,
    - record per-row promo impressions/clicks via `track_listing_promo_event`,
    - preserve deterministic fallback to Phase 3 ranking or legacy listing sort.
  - Adds `phase4_boosts_enabled` admin toggle in `mobile/src/screens/app/AdminOpsScreen.tsx`.

## Slice 4 implementation notes (started 2026-05-07)

- DB migration: `supabase/migrations/20260508010000_phase4_quality_trust.sql`
  - Seeds `phase4_quality_enabled` in `app_settings` (default `false`).
  - Adds additive quality/trust tables: `job_completion_photos`, `job_quality_surveys`, `guarantee_claim_intakes`.
  - Adds `submit_job_quality_survey(...)` and `submit_guarantee_claim_intake(...)` RPCs (security definer).
  - Adds participant/admin-safe RLS with completed-job checks for write paths.
- DB tests: `supabase/tests/database/phase4_quality_trust.test.sql` validates schema/functions/indexes/flag defaults.
- Mobile:
  - Extends `mobile/src/lib/phase4Flags.ts` with `qualityEnabled`.
  - Adds quality helper + Jest coverage in `mobile/src/lib/quality.ts` and `mobile/src/lib/quality.test.ts`.
  - Updates `mobile/src/screens/app/JobDetailScreen.tsx` to add flag-gated:
    - post-job photo prompt capture stub,
    - customer micro-survey submission/update,
    - guarantee/claims intake stub.
  - Adds `phase4_quality_enabled` admin toggle in `mobile/src/screens/app/AdminOpsScreen.tsx`.

## Slice 5 implementation notes (started 2026-05-07)

- DB migration: `supabase/migrations/20260508020000_phase4_web_pwa_accessibility.sql`
  - Seeds `phase4_web_enabled` in `app_settings` (default `false`).
  - Adds additive `web_checkout_sessions` table for customer web checkout handoff state.
  - Adds `create_web_checkout_session(...)` RPC (security definer) for customer-side session creation.
- DB tests: `supabase/tests/database/phase4_web_pwa_accessibility.test.sql` validates schema/function/index/flag defaults.
- Mobile:
  - Extends `mobile/src/lib/phase4Flags.ts` with `webEnabled`.
  - Adds web checkout URL helper + Jest coverage in `mobile/src/lib/webCheckout.ts` and `mobile/src/lib/webCheckout.test.ts`.
  - Updates `mobile/src/screens/app/ListingDetailScreen.tsx` with flag-gated "Create web checkout (pilot)" action and returned link display.
  - Adds `phase4_web_enabled` admin toggle in `mobile/src/screens/app/AdminOpsScreen.tsx`.
- Shared UI/accessibility polish:
  - `mobile/src/components/ui/Primitives.tsx`: `PrimaryButton` now has button role/label, hitSlop, and 44px minimum tap target.
  - `mobile/src/screens/app/ListingDetailScreen.tsx`: modal action pressables include button role + hitSlop.

## Slice 6 implementation notes (started 2026-05-07)

- DB migration: `supabase/migrations/20260508030000_phase4_closeout_hardening.sql`
  - Adds `v_analytics_phase4_events` export view for phase KPI queries.
  - Adds internal `phase4_kpi_snapshot(interval)` helper returning JSON KPI snapshot.
  - Explicitly revokes execute on `phase4_kpi_snapshot` from client roles.
- DB tests: `supabase/tests/database/phase4_closeout_hardening.test.sql` validates view/function/revokes.
- Mobile:
  - Adds `mobile/src/lib/phase4Readiness.ts` and `phase4Readiness.test.ts` for deterministic closeout threshold checks.
- Docs:
  - Adds `docs/implementation/phase-4-kpi-template.md`.
  - Adds `docs/implementation/phase-4-closeout.md` with evidence + acceptance gate checklist.
