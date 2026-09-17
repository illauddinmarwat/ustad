# Ustad — implementation plan (phased)

This folder is the **engineering and delivery** companion to the product vision in [`Ustad-Product-Blueprint.md`](../Ustad-Product-Blueprint.md) and the **MVP scope** in [`Ustad-MVP-SinglePage.md`](../Ustad-MVP-SinglePage.md).

## How to use

- **Phase 1** is the only “must read” to start coding: schema, RLS, Rails A/B, Supabase layout.  
- Later phases assume Phase 1 primitives (`jobs`, listings, applications, messages, reviews) stay stable; new work **adds** capabilities rather than rewrites the booking spine.  
- Each phase lists **dependencies**, **deliverables**, **acceptance criteria**, and **risks**.
- **UI strategy (feasible):** run a UI polish lane inside every phase (Airtasker-inspired patterns and layout structure), instead of delaying polish to a separate final phase.

## Locked product decisions (current)

| Topic | Decision |
|-------|-----------|
| **Rail B hiring** | Worker **accept** → job **`pending_customer_confirm`** → customer **confirm** → **`assigned`**. No jumping straight to `assigned`. |
| **Listings & workers** | **No admin approval** to publish listings or to onboard workers (MVP). Trust = reviews + reactive moderation. Templates are **catalog definitions**, not per-list approval. |
| **Backend** | **Supabase-first** (Postgres, Auth, Storage, Edge Functions, RLS). |

## Phase index

| Phase | Doc | Rough calendar* | Summary |
|-------|-----|-----------------|--------|
| **1** | [`phase-1-mvp-foundations.md`](phase-1-mvp-foundations.md) | Months 0–3 | Rails A+B, templates, bookings, messaging, ratings, RN app shells |
| **2** | [`phase-2-beta-hardening.md`](phase-2-beta-hardening.md) | 3–6 | Beta city, PSP pilot, observability, admin tooling, moderation v2 |
| **3** | [`phase-3-intelligence-automation.md`](phase-3-intelligence-automation.md) | 6–9 | Matching v2, chatbot FAQs, OCR assist, analytics warehouse |
| **4** | [`phase-4-product-depth.md`](phase-4-product-depth.md) | 9–12 | GPS/ETA lite, subscriptions, guarantees/insurance partners, QA tooling |
| **5** | [`phase-5-multi-city-scale.md`](phase-5-multi-city-scale.md) | 12–18 | Multi-city rollout, campaigns, infra scale, optional community surfaces |
| **6** | [`phase-6-maturity-enterprise.md`](phase-6-maturity-enterprise.md) | 18–24 | B2B, enterprise dashboards, compliance depth, export / white-label exploratory |

\*Calendar is indicative; shrink or stretch by team size and scope cuts.

---

## Delivery progress snapshot

**Status as of 2026-05-07**

| Phase | Status | Notes |
|-------|--------|-------|
| **1 — MVP foundations** | **Complete** | Acceptance criteria codified and met in RN + Postgres; RPC/RLS contract documented; CI runs mobile typecheck + local `supabase test db`. |
| **2 — Beta hardening** | **Complete** | Reliability runbooks, KPI templates, payments ledger pilot, admin/moderation tools, UI lane and tests completed. |
| **3 — Intelligence & automation** | **Code complete; ops follow-ups** | Ranking v2 (+ verified chip), live Google + Groq Vision with fallback, preprocessing, admin verification + OCR health, signal backfill + cron-safe DB function, A/B cohorts, bilingual FAQ + chat UI (bounded search), FAQ admin in app, analytics views + export/A-B docs, Detox smoke scaffold. **Console / prod:** Vision key restriction, pg_cron schedule, optional warehouse ETL — see [`phase-3-intelligence-automation.md`](phase-3-intelligence-automation.md) and `docs/analytics/`. |
| **4 — Product depth & revenue mix** | **Code complete (slices 1-6)** | Realtime lite, subscriptions, boosts, quality/trust, and web checkout pilot shipped behind flags; closeout hardening adds Phase 4 KPI view + snapshot helper + closeout docs/checklist. |
| **5 — Multi-city scale & growth** | **Complete (Slices 1-6)** | Multi-city side-table foundation + city-aware discovery + admin rollout controls + campaign attribution + scale hardening hooks + optional community-lite and accessibility polish shipped behind default-off Phase 5 flags, with deterministic fallbacks and pgTAP/Jest coverage. |
| **6 — Maturity & enterprise** | Planned | Future phase remains planned pending Phase 5 rollout checkpoints. |

### Phase 2 completion notes

- Closeout evidence recorded in [`phase-2-closeout.md`](phase-2-closeout.md).
- Migrations delivered for ops/payments/moderation (`20260507113000_*`, `20260507121000_*`).
- Admin ops screen and payment/report flows wired in mobile app.
- DB tests + mobile tests passing locally.

### Phase 1 completion notes

- Supabase auth users seeded via `docs/seed-data/phase1-seed-accounts.md`; domain seed in `docs/seed-data/phase1-domain-seed.sql` optional for fixtures.
- **Rail A:** `Jobs` → `JobDetail`: quote, accept via `customer_accept_quote`, messaging, complete via `mark_job_completed`, customer **review** on complete.
- **Rail B:** `Services` → `ListingDetail` → apply → `Applications` accept → **`JobDetail`** confirm via `customer_confirm_booking`, then complete + review.
- **Booking contract:** [`phase-1-booking-state-machine.md`](phase-1-booking-state-machine.md).
- **Tests:** pgTAP in `supabase/tests/database/` (`supabase test db`); TypeScript CI on `mobile/`.

### Phase 3 slice 1–4 progress notes

- Migrations through `20260507210000_phase3_cron_analytics_ml.sql` (cron backfill, analytics views, ML stub).
- Mobile: worker signal refresh after quote/complete; `FaqChatScreen`; Admin FAQ section; Detox optional (`npm run e2e:*`, needs `expo prebuild`).
- Docs: `docs/analytics/pg-cron-backfill.md`, `ranking-ab-analysis.sql`, `warehouse-export.md`; `docs/implementation/google-cloud-vision-key-restriction.md`, `detox-e2e.md`.
- Run `npx supabase test db` + `cd mobile && npm run typecheck && npm test` after pulls; use `RUN_E2E=1 npm run e2e:test` only after native build (macOS/iOS sim).

### Next session handoff

- Begin Phase 6 planning/implementation while preserving all Phase 1-5 contracts.
- Validate Slice 6 with local commands after migration pull/apply:
  - `npx supabase db push --local`
  - `npx supabase test db`
  - `cd mobile && npm run typecheck`
  - `cd mobile && npm test`

---

*Maintain phase docs when scope changes — date major edits at bottom of each file.*
