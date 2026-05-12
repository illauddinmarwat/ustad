# Phase 5 — Multi-city scale & growth (months 12–18)

## Objective

**Replicate** the playbook city-by-city with **infra headroom**, **marketing instrumentation**, and **community-lite** surfaces.

## Dependencies

- Phase 4 revenue/support stable.  
- Playbook doc from Phase 2 beta (what worked in city #1).

## Phase-0 smoke checklist (before deeper Phase 5 rollout)

- [x] Local Supabase running and reachable (`http://127.0.0.1:54321`).
- [x] All migrations applied locally (`npx supabase db push --local`).
- [x] Baseline auth users created for smoke paths (admin + workers + customers).
- [x] Domain seed applied (profiles/roles, worker profiles, active listings, open jobs).
- [x] Core automated checks green:
  - `npx supabase test db`
  - `cd mobile && npm run typecheck`
  - `cd mobile && npm test`
- [x] Manual Rail A smoke completed (post job -> quote -> accept -> complete).
- [x] Manual Rail B smoke completed (`pending_customer_confirm` -> confirm -> `assigned`).

## Technical deliverables

### Multi-tenancy by geography

- City/region dimensions on listings and jobs; admin config per market.  
- SEO/localized landing (if web exists).

### Infra scale

- Read replicas or connection pooling; CDN for media; background workers for notifications and reports.  
- Rate limiting and bot protection at edge.

### Growth & community (selective)

- Referral tracking, campaign UTM ingestion.  
- Optional worker forums or tips feed (moderation budget required).

### Social integrations

- WhatsApp deep links / share cards for listings (no full social graph required).

### UI polish lane (Airtasker-inspired)

- Localize copy and city context while preserving one consistent booking interaction model.
- Add growth UI surfaces (referral/promo cards) without reducing booking clarity or trust visibility.
- Tune list rendering/performance on low-end Android while keeping polished cards and readable density.

## Slice plan (execution order)

- **Slice 1 — Multi-city config foundation:** add `cities`, `city_rollout_configs`, and `city_service_availability` side tables + Phase 5 flags (`phase5_*`) default false + deterministic fallback to Karachi when flags/services are unavailable.
- **Slice 2 — City-aware availability read path:** add additive city-filter read functions/views (no booking RPC rewrites), wire mobile discovery query gating and fallback to existing non-city listing path.
- **Slice 3 — Rollout controls + admin ops:** extend Admin Ops with city activation/service-stage controls via admin-safe paths; keep flag flips through `admin_set_app_setting`.
- **Slice 4 — Campaign primitives + attribution basics:** add campaign and attribution side tables/events (UTM first-touch, referral token) with deterministic no-op fallback.
- **Slice 5 — Scale hardening hooks:** additive infra-facing tables/functions for queue/backoff/rate-limit observability where represented in repo; no core booking function overloading.
- **Slice 6 — Optional community-lite and UI polish pass (current):** gated community/tips surface if low-risk, plus accessibility and city-context UI consistency checks.

## Acceptance criteria

- SLOs for API and chat under target concurrent users.  
- At least **N** cities live with templated rollout checklist.  
- Cost per acquisition vs LTV modeled (even roughly).
- UX consistency maintained across launched cities (no city-specific booking UX drift).

## Slice 1 implementation status

Status: **CODE COMPLETE (validated)**

Delivered in this slice:

- Migration: `supabase/migrations/20260508040000_phase5_multi_city_foundations.sql`
  - Adds `phase5_multi_city_enabled`, `phase5_city_campaigns_enabled`, `phase5_city_community_enabled` app flags (default `false`).
  - Adds side tables `cities`, `city_rollout_configs`, `city_service_availability` with RLS and admin-only write policies.
  - Adds deterministic helper `phase5_effective_city_code()` with Karachi fallback.
  - Adds internal snapshot helper `phase5_city_rollout_snapshot()` with explicit execute revokes.
- DB test: `supabase/tests/database/phase5_multi_city_foundations.test.sql`
  - Verifies flags default false, schema/indexes, function security posture, and deterministic fallback.
- Mobile:
  - `mobile/src/lib/phase5Flags.ts` for best-effort flag fetch with default-false fallback.
  - `mobile/src/lib/cityRollout.ts` for deterministic city selection fallback logic.
  - `mobile/src/lib/cityRollout.test.ts` for Jest coverage of fallback + dedupe behavior.

## Slice 2 implementation status

Status: **CODE COMPLETE (validated)**

Delivered in this slice:

- Migration: `supabase/migrations/20260508050000_phase5_city_discovery_read_path.sql`
  - Adds `phase5_discover_listings(p_city_code, p_category, p_limit, p_include_boosts)` as additive city-aware read RPC.
  - Keeps deterministic fallback behavior:
    - If `phase5_multi_city_enabled` is off -> legacy ranking behavior.
    - If city config/availability is missing -> no-filter ranking fallback.
  - Supports both boost and non-boost discovery paths while preserving stable ordering.
- DB test: `supabase/tests/database/phase5_city_discovery_read_path.test.sql`
  - Verifies function security posture, execute grant, default-off flag assumption, stable signature, and callable fallback path.
- Mobile:
  - `mobile/src/lib/cityDiscovery.ts` for city-aware gating, city resolution, and subtitle logic.
  - `mobile/src/lib/cityDiscovery.test.ts` for deterministic city/fallback coverage.
  - `mobile/src/screens/app/ServicesScreen.tsx` now:
    - Fetches Phase 5 flags.
    - Uses `phase5_discover_listings` only when multi-city is enabled.
    - Falls back to existing ranking path if RPC fails/unavailable.
    - Shows city context in list subtitle without changing booking behavior.

## Slice 3 implementation status

Status: **CODE COMPLETE (validated)**

Delivered in this slice:

- Migration: `supabase/migrations/20260508060000_phase5_admin_rollout_controls.sql`
  - Adds admin-only rollout RPCs:
    - `admin_upsert_city(...)`
    - `admin_set_city_rollout_config(...)`
    - `admin_set_city_service_availability(...)`
  - Functions are `security definer` and enforce admin role checks.
- DB test: `supabase/tests/database/phase5_admin_rollout_controls.test.sql`
  - Verifies function existence/security posture, execute grants, and foundational table/flag invariants.
- Mobile:
  - `mobile/src/lib/phase5AdminRollout.ts` + `mobile/src/lib/phase5AdminRollout.test.ts` for deterministic input normalization.
  - `mobile/src/screens/app/AdminOpsScreen.tsx`:
    - Adds Phase 5 flag toggles via `admin_set_app_setting`.
    - Adds city upsert, rollout config, and service availability controls via new RPCs.
    - Adds city rollout snapshot panel for quick operator visibility.

## Slice 4 implementation status

Status: **CODE COMPLETE (validated)**

Delivered in this slice:

- Migration: `supabase/migrations/20260508070000_phase5_campaign_attribution_basics.sql`
  - Adds `phase5_attribution_enabled` (`false` default).
  - Adds additive side tables:
    - `growth_campaigns`
    - `referral_codes`
    - `attribution_touches`
  - Adds admin-safe/owner-safe RLS policies and helper indexes/triggers.
  - Adds `track_campaign_touch(...)` RPC with deterministic fallback modes:
    - `flag_off_fallback`
    - `service_fallback`
    - `tracked`
- DB test: `supabase/tests/database/phase5_campaign_attribution_basics.test.sql`
  - Verifies schema, flag defaults, policy/index/constraint/function posture.
- Mobile:
  - `mobile/src/lib/campaignAttribution.ts` + `mobile/src/lib/campaignAttribution.test.ts`.
  - `mobile/src/screens/app/ServicesScreen.tsx` records a best-effort discovery touch via `track_campaign_touch` when Phase 5 campaigns flag is enabled.

## Slice 5 implementation status

Status: **CODE COMPLETE (validated)**

Delivered in this slice:

- Migration: `supabase/migrations/20260508080000_phase5_scale_hardening_hooks.sql`
  - Adds `phase5_scale_hardening_enabled` (`false` default).
  - Adds additive ops observability side tables:
    - `ops_rate_limit_events`
    - `ops_queue_attempts`
    - `ops_notification_attempts`
  - Adds RLS policies for admin visibility and safe inserts.
  - Adds infra logging RPCs:
    - `log_rate_limit_event(...)`
    - `admin_log_queue_attempt(...)`
  - Preserves deterministic fallback semantics (`fallback_allow`) when scale hardening flag is off.
- DB test: `supabase/tests/database/phase5_scale_hardening_hooks.test.sql`
  - Verifies schema, flags, function posture, indexes, trigger, and check constraints.
- Mobile:
  - `mobile/src/lib/scaleHardening.ts` for best-effort rate-limit telemetry logging.
  - `mobile/src/lib/scaleHardeningNormalize.ts` + `mobile/src/lib/scaleHardeningNormalize.test.ts` for deterministic normalization.
  - `mobile/src/screens/app/ServicesScreen.tsx` logs fallback discovery events to scale telemetry path when city-aware RPC falls back.

## Slice 6 implementation status

Status: **CODE COMPLETE (validated)**

Delivered in this slice:

- Migration: `supabase/migrations/20260508090000_phase5_community_lite_polish.sql`
  - Adds additive `community_tips` side table with city scoping and admin write path.
  - Adds `phase5_get_community_tips(...)` RPC that is fully gated by `phase5_city_community_enabled`.
  - Deterministic fallback behavior: when flag is off, function returns zero rows.
- DB test: `supabase/tests/database/phase5_community_lite_polish.test.sql`
  - Verifies schema/function/index/trigger/policy posture and flag-off empty-result behavior.
- Mobile:
  - `mobile/src/lib/community.ts` + `mobile/src/lib/communityLite.ts` + `mobile/src/lib/communityLite.test.ts`.
  - New screen: `mobile/src/screens/app/CommunityTipsScreen.tsx`.
  - `mobile/src/navigation/types.ts` + `mobile/App.tsx` add `CommunityTips` route.
  - `mobile/src/screens/app/AccountScreen.tsx` adds gated entry for Community Tips.
- Accessibility polish:
  - Dashboard CTA buttons now include explicit accessibility role/labels and hit slop in `mobile/src/screens/app/DashboardScreen.tsx`.

---

*Phase 5 — scale is mostly process + infra + growth loop.*
