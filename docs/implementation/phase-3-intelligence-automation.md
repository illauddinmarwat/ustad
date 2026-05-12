# Phase 3 — Intelligence & automation (months 6–9)

## Objective

Reduce manual browsing friction and support load using **data-driven ranking**, **FAQ automation**, and **document assist** — without blocking bookings on ML.

## Dependencies

- Enough historical jobs/quotes/applications for basic stats (even hundreds helps).  
- Phase 2 analytics pipeline or export to warehouse.

## Technical deliverables

### Matching & ranking (non-blocking)

- Rule-based ranking v2: distance, rating, response time, completion rate.  
- Optional ML layer: candidate generation + explainable score; **fallback** always to plain lists.

### Support automation

- Bilingual FAQ (Urdu/English), contextual help from job category.  
- Chatbot **bounded** to policy/FAQ + handoff to human support contact.

### Document assist

- OCR pipeline for CNIC/license **assist** (worker prefills); human-out-of-loop only when accuracy meets bar **or** keep as assistant-only.

### Analytics

- Event taxonomy (`listing_view`, `application_submit`, `confirm_booking`, etc.).  
- churn proxy metrics for workers/customers.

### UI polish lane (Airtasker-inspired)

- Upgrade discovery UX with sticky sort/filter chips, better card scanning, and stronger trust/rating visibility.
- Add explainability affordances near ranking (“why this worker/listing is shown”) for user confidence.
- Keep customer and worker flows visually aligned through shared components.

## Out of scope

- Fully automated dispute decisions.  
- Dynamic surge pricing without legal/product review.

## Acceptance criteria

- Measurable uplift in time-to-match or conversion vs Phase 2 baseline **or** documented neutral experiment.  
- Chatbot deflection rate for Tier-1 FAQs.  
- OCR assist accuracy monitored; no worsening of fraud vs control.
- Search/discovery UI supports faster first-action time vs Phase 2 baseline.

---

## Phase 3 — Slice 4 progress (2026-05-07)

Status: **Shipped in repo** — cron-safe nightly backfill function (`cron_backfill_worker_signals`, postgres-only execute), analytics views (`v_analytics_app_events`, `v_analytics_ranking_events`), ML candidate stub (`rank_listings_ml_candidates`), worker post-action `refresh_my_worker_signals` hook on quote + complete, FAQ admin CRUD in `AdminOpsScreen`, chat-style FAQ (`FaqChatScreen`, still `search_faqs` only), warehouse export + A/B SQL docs, pg_cron recipe, Google Cloud key restriction runbook, optional Detox scaffold (`mobile/e2e/`, `RUN_E2E=1`). **Still operator-owned:** enable pg_cron + `cron.schedule` on production, restrict the Vision API key in Google Cloud, wire an external ETL if you want automated warehouse sync.

### What shipped in slice 4

- **Migration** `20260507210000_phase3_cron_analytics_ml.sql` — `cron_backfill_worker_signals()` (no `auth.uid()`), revokes from PostgREST roles, grants execute to `postgres` only; `rank_listings_ml_candidates` placeholder (zero rows); analytics views for export and cohort funnels.
- **DB tests** `supabase/tests/database/phase3_cron_analytics.test.sql`.
- **Docs** — [`../analytics/pg-cron-backfill.md`](../analytics/pg-cron-backfill.md), [`../analytics/ranking-ab-analysis.sql`](../analytics/ranking-ab-analysis.sql), [`../analytics/warehouse-export.md`](../analytics/warehouse-export.md), [`google-cloud-vision-key-restriction.md`](google-cloud-vision-key-restriction.md), [`detox-e2e.md`](detox-e2e.md).
- **Mobile** — `JobDetailScreen` worker refresh after successful quote + complete; `FaqChatScreen` + navigation; Admin FAQ knowledge base section; Detox smoke test gated by `RUN_E2E`.
- **Validation:** `npx supabase test db` → 78 tests PASS; `cd mobile && npm run typecheck && npm test` → PASS (56 Jest tests).

## Phase 3 — Slice 3 progress (2026-05-07)

Status: **Complete** — Live OCR (Google + Groq) + provider fallback chain, admin verification queue, OCR observability, ranking signal backfill, image preprocessing, A/B cohort helper, bilingual FAQ + support handoff.

### What shipped in slice 3

- **Provider fallback chain** in `mobile/src/lib/ocr/index.ts` — `extractDocument` now walks an ordered chain (`google → groq` by default, configurable per call). Each attempt: throws / unknown error → next provider; low-confidence → next provider; if every provider falls short, the orchestrator returns a `manual_fallback` with the best partial fields recovered so the worker still has something to edit.
- **Live Groq Vision recognizer** in `providers.ts` — `GroqVisionProvider` posts to `https://api.groq.com/openai/v1/chat/completions` with the document as a base64 data URL. Bearer auth, model id from `GROQ_VISION_MODEL` env (default `llama-3.2-11b-vision-preview`), conservative confidence heuristic (`>=0.6` for non-trivial responses).
- **Admin verification queue** (slice 3b) — migration `20260507180000_phase3_admin_verification.sql`:
  - `worker_profiles.{is_verified, verified_at, verified_by}` columns.
  - `ocr_extractions` status enum widened to include `verified`, `rejected`, `failed`; new `reviewed_by`, `reviewed_at`, `admin_note` columns + admin update RLS.
  - `admin_set_extraction_status(id, status, note)` RPC moves rows verified/rejected and reflects the worker's verification state.
  - `rank_listings_v2` adds `is_verified` to the row shape and a small score nudge for verified workers; `ServicesScreen` now prefers v2 (with deterministic fallback to v1 / legacy listings).
  - "Verified" `ExplainChip` in ranked listings.
- **OCR observability** — `log_ocr_failure(doc_type, provider, note)` RPC + client-side hook in `WorkerOnboardingScreen` that records `failed` extractions for provider-unavailable / parse-failed runs. New "OCR provider health" panel + verification queue in `AdminOpsScreen`.
- **Ranking signal backfill** (slice 3c) — migration `20260507190000_phase3_signals_backfill.sql`:
  - `compute_worker_signals(user_id)` reads quotes / jobs / messages from the last 30 days and updates `response_rate`, `completion_rate`, `last_active_at`.
  - `admin_backfill_worker_signals()` (admin only) batch-runs across every worker who appears in quotes or jobs.
  - `refresh_my_worker_signals()` (worker only) on-demand recompute.
  - Admin button "Run backfill now" in `AdminOpsScreen`.
- **Image preprocessing** (slice 3d) — `mobile/src/lib/ocr/preprocess.ts` resizes the picked image to ≤ 1600 px max edge and JPEG-compresses to 0.7 quality before base64. Uses the new `expo-image-manipulator@~14.0.8` contextual API; a deterministic resize-plan helper is exported for tests. Onboarding screen swaps the raw camera asset for the preprocessed copy and falls back to the original if the native module is unavailable.
- **A/B cohort helper** (slice 3e) — `mobile/src/lib/experiments.ts`:
  - Pure FNV-1a hash → cohort assignment, deterministic per `(userId, experimentKey)` pair.
  - `RANKING_EXPERIMENT` definition with 50/50 control vs `ranking_v2` cohorts.
  - `ServicesScreen` includes `cohort` in `ranking_impression` + `ranking_clicked` events, enabling funnel comparisons in `app_events`.
- **Bilingual FAQ scaffold** (slice 3f) — migration `20260507200000_phase3_faq.sql`:
  - `faqs` table (slug, category, question_en, question_ur, answer_en, answer_ur, search_terms, is_active) with admin-only writes and authenticated reads.
  - `search_faqs(p_query, p_limit)` scoring function over English + Urdu question + search_terms.
  - 6 seed entries covering jobs, listings, payments, reviews, document verification, support handoff (English + Urdu).
  - `mobile/src/screens/app/FaqScreen.tsx` — search box, language toggle, expandable answer rows; if zero matches the screen offers a `mailto:` support handoff. Emits `faq_searched` and `faq_support_handoff` events. Linked from Account → "Open FAQ".
- **Tests delta:**
  - DB: `phase3_admin_verification.test.sql`, `phase3_signals_backfill.test.sql`, `phase3_faq.test.sql` (24 new assertions; 7 pgTAP files / 72 tests total).
  - Mobile: `lib/ocr/preprocess.test.ts`, `lib/experiments.test.ts`, expanded `lib/ocr/index.test.ts` (chain semantics) and `lib/ocr/providers.test.ts` (Groq parser + request flow). 7 jest suites / 56 tests total.
- **Validation last run (slice 3):** `npx supabase test db` → 72 tests PASS. `npm run typecheck` → PASS. `npm test` → 56 tests PASS.

### Phase 3 — Slice 2 progress (2026-05-07)

Status: **Complete** — slices 1 + 2 shipped (ranking v2, OCR provider + worker onboarding).

### What shipped in slice 2

- **Live Google Vision recognizer** in `mobile/src/lib/ocr/providers.ts` — POSTs `DOCUMENT_TEXT_DETECTION` + `TEXT_DETECTION` to `https://vision.googleapis.com/v1/images:annotate`, parses `fullTextAnnotation` plus per-page / per-symbol confidence (defaults to 0.5 if the API returns none), and translates HTTP errors into `OcrUnavailable` so the orchestrator routes to manual fallback. Constructor is `fetch`-injected for testing.
- **Env wiring without secret leak** in `mobile/app.config.ts` — `GOOGLE_VISION_API_KEY`, `GROQ_API_KEY`, `GROQ_VISION_MODEL`, `VISION_PROVIDER` are read from `.env` at build time and exposed via `Constants.expoConfig.extra`. Provider reads through both the Expo extra and `process.env` (for tests/server contexts). Code references env *names* only; no values appear in source.
- **Worker onboarding screen** `mobile/src/screens/app/WorkerOnboardingScreen.tsx`:
  - Worker picks CNIC / driving licence, picks an image (`expo-image-picker`, base64).
  - Runs `extractDocument` (gated by `phase3_ocr_enabled`).
  - Shows status pill (`parsed · google` / `fallback · low_confidence` / `OCR disabled`) and confidence chip, prefills editable fields, and saves to `ocr_extractions` regardless of OCR outcome.
  - Booking flow is never blocked: workers can always edit fields and save with `provider='manual'`, `status='manual_fallback'` or `'pending'`.
  - Emits `ocr_parsed`, `ocr_manual_fallback`, `ocr_disabled`, `ocr_extraction_saved` analytics events.
- **Navigation + entry point** — `WorkerOnboarding` registered in the root stack; `AccountScreen` shows a "Verify documents" CTA for the `worker` role.
- **Dependency** — `expo-image-picker@~17.0.11` added via `npx expo install` (auto-pinned to SDK 54).
- **Tests** — `mobile/src/lib/ocr/providers.test.ts` (parser + fetch-injected request flow + HTTP error handling + missing-base64 guard). All previous suites still pass.
- **Validation last run:** `npx supabase test db` → 45 tests PASS. `npm run typecheck` → PASS. `npm test` → 32 tests PASS.

### Phase 3 — Slice 1 progress (2026-05-07)

Status: **Complete** — ranking + OCR scaffolding shipped; live OCR is now wired in slice 2.

### What shipped in this slice

- **Migration** `supabase/migrations/20260507150000_phase3_ranking_ocr.sql` (additive only):
  - `app_settings` flag table seeded with `phase3_ranking_enabled=false`, `phase3_ocr_enabled=false`. Authenticated read; admin-only writes via RPC.
  - `worker_profiles` extended with nullable `response_rate`, `completion_rate`, `last_active_at` columns.
  - `ocr_extractions` audit table with worker-scoped RLS for the OCR assist trail.
  - `public.rank_listings(p_category, p_limit)` SECURITY DEFINER function returning ranked listings + score breakdown. Deterministic — when no signals are present, ordering reduces to `created_at desc` (legacy fallback preserved).
  - Helpers `get_app_setting` and `admin_set_app_setting`.
- **Mobile ranking integration:**
  - `mobile/src/lib/ranking.ts`: pure scoring helpers mirroring the SQL weights, deterministic tie-break.
  - `mobile/src/lib/featureFlags.ts`: cached, best-effort fetch of Phase 3 flags from `app_settings`. Defaults to `false` on any failure.
  - `mobile/src/screens/app/ServicesScreen.tsx`: gated call to `rank_listings`; falls back to legacy listings query when flag is off or the RPC errors.
  - `mobile/src/components/ui/Primitives.tsx`: new `ExplainChip` primitive used to show rating/response/completion signals near each ranked listing.
- **Event instrumentation:** `ranking_impression`, `ranking_clicked`, `ranking_applied`, `ranking_quote_submitted` emitted into `app_events` (Phase 2 ledger).
- **OCR scaffold (non-blocking):**
  - `mobile/src/lib/ocr/types.ts`, `parsers.ts`, `providers.ts`, `index.ts`.
  - Provider abstraction with Google Vision + Groq Vision wired (env vars only — `GOOGLE_VISION_API_KEY`, `GROQ_API_KEY`, `GROQ_VISION_MODEL`, `VISION_PROVIDER`). Real network calls intentionally deferred; both providers throw `OcrUnavailable` so the orchestrator exercises the manual-fallback path.
  - Confidence-aware CNIC + license parsers (regex extraction, returns `null` per field on miss; whole result marked not acceptable below `OCR_DEFAULT_MIN_CONFIDENCE = 0.6` unless overridden).
  - `extractDocument` orchestrator gated on `phase3_ocr_enabled`. Always returns a discriminated `OcrResult` envelope (`disabled` / `manual_fallback` / `parsed`) — never throws, never blocks bookings.
- **Tests:**
  - `supabase/tests/database/phase3_ranking_ocr.test.sql` (16 assertions: schema, defaults, deterministic ordering, score positivity, category filter).
  - `mobile/src/lib/ranking.test.ts` — score weights, monotonicity, fallback ordering, signal-omission safety.
  - `mobile/src/lib/ocr/parsers.test.ts` — CNIC + license + confidence threshold + per-call override.
  - `mobile/src/lib/ocr/index.test.ts` — flag-off short circuit, provider-failure fallback, low-confidence fallback, parsed happy path.
- **Validation last run:** `npx supabase test db` → `Files=4, Tests=45 — All tests successful`. `cd mobile && npm run typecheck` → PASS. `cd mobile && npm test` → 25/25 PASS.

### What remains in Phase 3 (ops / stretch)

- **Google Cloud console:** restrict the Vision API key (Android/iOS / referrers + API-only restriction) — see [`google-cloud-vision-key-restriction.md`](google-cloud-vision-key-restriction.md). Optional: per-worker daily Vision rate limit (Edge Function proxy) before broad `phase3_ocr_enabled` rollout.
- **Production scheduling:** run `cron.schedule` for `cron_backfill_worker_signals` after enabling pg_cron — see [`../analytics/pg-cron-backfill.md`](../analytics/pg-cron-backfill.md).
- **Warehouse automation:** views + SQL patterns are documented; connect Fivetran/Airbyte/Cloud Scheduler yourself if you need push/pull ETL — see [`../analytics/warehouse-export.md`](../analytics/warehouse-export.md) and [`../analytics/ranking-ab-analysis.sql`](../analytics/ranking-ab-analysis.sql).
- **ML layer:** replace stub `rank_listings_ml_candidates` with real candidate generation when data volume justifies it; keep rule-based `rank_listings_v2` as fallback.
- **Detox depth:** smoke launch test only; extend to full onboarding → verify → Services chip when native projects are stable in CI.
- **Ranking analytics completeness** — `ranking_impression` may still sample listing ids; expand payload if offline analysis needs full impressions.

### Risks

- **Backfill correctness:** ranking signals are nullable today; until backfill jobs run, `rank_listings` behaves as if signals are absent. Mitigated by deterministic fallback.
- **OCR fraud surface:** the assist remains worker-prefill-only; admin verification workflow and the queue reduce but do not eliminate risk until accuracy data is observed at scale.
- **Vision API cost / abuse:** Google Vision is now a live network call; ungated rapid use could rack up cost. Mitigations in place: `phase3_ocr_enabled` flag (default `false`), HTTP failures bubble to manual fallback. Mitigation pending: rate-limit per worker per day before broad rollout.
- **Bundle key exposure:** `EXPO_PUBLIC_*`-style values (Supabase anon, Vision key) ship in the JS bundle. The Vision key is restricted to the Vision API only; production must restrict the key by HTTP referrer / package name in the Google Cloud console before public launch.
- **Flag drift:** the mobile cache TTL is 60s. Operators must allow up to one minute for client toggles to propagate.
- **Provider keys** live in `mobile/.env` only (gitignored) and are never committed. CI requires its own secret bindings before integration tests can hit live Vision.

### Next steps (recommended order)

1. **Restrict the Vision API key in Google Cloud** and consider a per-worker Vision rate limit before flipping `phase3_ocr_enabled` for any cohort.
2. **Enable pg_cron** on hosted Supabase and schedule `cron_backfill_worker_signals` (see analytics doc).
3. **Automate warehouse export** from `v_analytics_*` or `app_events` using your stack; run weekly cohort funnels from `ranking-ab-analysis.sql`.
4. **Optional:** deepen Detox coverage and replace `rank_listings_ml_candidates` when ML is ready.

---

*Phase 3 — smart layers are additive; core state machine unchanged.*
