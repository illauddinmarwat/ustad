# WorkerzPk — implementation plan (phased)

This folder is the **engineering and delivery** companion to the product vision in [`WorkerzPk-Product-Blueprint.md`](../../WorkerzPk-Product-Blueprint.md) and the **MVP scope** in [`WorkerzPk-MVP-SinglePage.md`](../../WorkerzPk-MVP-SinglePage.md).

## How to use

- **Phase 1** is the only “must read” to start coding: schema, RLS, Rails A/B, Supabase layout.  
- Later phases assume Phase 1 primitives (`jobs`, listings, applications, messages, reviews) stay stable; new work **adds** capabilities rather than rewrites the booking spine.  
- Each phase lists **dependencies**, **deliverables**, **acceptance criteria**, and **risks**.

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

*Maintain phase docs when scope changes — date major edits at bottom of each file.*
