# Phase 1 — MVP foundations (months 0–3)



## Objective



Ship a **single-city** marketplace with **two rails** on **Supabase**, proving repeat completed jobs with reviews. **Rail B** must implement **`pending_customer_confirm` → customer confirm → `assigned`**. **No admin approval** for listing publish or worker signup.



## Repository scaffolding (this codebase)



| Item | Location |

|------|----------|

| Expo app | `mobile/` |

| Supabase schema + RPCs | `supabase/migrations/` |

| DB tests (pgTAP) | `supabase/tests/database/*.test.sql` |

| Booking contract (RLS/RPC narrative) | [`phase-1-booking-state-machine.md`](phase-1-booking-state-machine.md) |

| Env template | `mobile/.env.example`, fixture sample `mobile/env.fixture.sample` |

| Offline dev | `EXPO_PUBLIC_USE_FIXTURES=1` — see [`../local-development.md`](../local-development.md) |

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

- Storage buckets: private (CNIC); public/signed (avatars, job photos, listing photos) — **manual dashboard setup** in Phase 1; see [`supabase/README.md`](../../supabase/README.md).

- Idempotent “accept application” handler (no duplicate jobs on double-tap) — enforced by RPC + partial unique index on `jobs(listing_application_id)`.



### Clients



- **React Native** app: customer + worker flows; dashboard CTAs (**Browse services** / **Post a job** vs worker **My listings** / **Open jobs**).

- Screens supporting MVP loop: **[`ListingDetail`](../../mobile/src/screens/app/ListingDetailScreen.tsx)** (apply modal), **`JobDetail`** (confirm booking recap + actions, threaded **messages**, **quotes**, **reviews** after complete), **`Jobs`** (post job + drill-in), **`Services`** publish/browse, **`Applications`** accept/decline.

- Template **admin/editor** deferred to Dashboard / Retool per product choice (RLS restricts template writes to service role).

- Push notifications (**FCM**) and **error tracking (Sentry)** called out explicitly as **Phase 2 carry** alongside observability KPIs.



### Quality



- **Automated DB smoke tests**: pgTAP under `supabase/tests/database/`; run **`supabase test db`** locally (CLI + Docker). CI runs the same command when Docker is available (see [.github/workflows/ci.yml](../../.github/workflows/ci.yml)).

- **`npm run typecheck`** in `mobile/` (also in CI).

- Seed script path: migration templates plus optional [`docs/seed-data/`](../seed-data/).



## Out of scope (Phase 1)



- Escrow, multi-PSP, ML matching, police verification, per-listing admin QA, instant `assigned` on Rail B.



## Acceptance criteria



| Criterion | How it is satisfied in-repo |

|-----------|----------------------------|

| End-to-end **Rail A**: post → quote → accept → complete → review | **`Jobs`** post → **`JobDetail`** quote + messaging → customer accept quote (`customer_accept_quote`) → either party **`mark_job_completed`** → customer **review** insert on **`JobDetail`**. |

| End-to-end **Rail B**: listing → apply → worker accept → `pending_customer_confirm` → confirm → assigned → complete → review | **`Services`** → **`ListingDetail`** apply → **`Applications`** accept RPC → customer sees job `pending_customer_confirm` on board → **`JobDetail` confirm** (`customer_confirm_booking`) → complete → review. |

| No human approver for listing/signup | Product + RLS unchanged: workers publish `active` listings; templates are catalog-only. |

| Documented RLS + booking contract | This file + [`phase-1-booking-state-machine.md`](phase-1-booking-state-machine.md) + RPC table in [`supabase/README.md`](../../supabase/README.md). |



## Status



**Phase 1 is complete** for this repository against the acceptance criteria above. Follow-on product polish (push, Sentry, Realtime, PSP) is **Phase 2**.



## Risks & mitigations



| Risk | Mitigation |

|------|------------|

| RLS complexity | Strict read rules + server-side transitions only for critical writes |

| Fraud / fake listings | Reports + block user; plan Phase 2 moderation dashboard |

| Customer never confirms | Notification + optional auto-cancel timeout (configurable) |



---



*Phase 1 — aligned with repo MVP spec (Rail B confirm step, no admin publish gate). Last updated 2026-05-07.*

