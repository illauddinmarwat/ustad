# Plan: Make Both Flows Work (Services + Direct Search + Job Posting)

Status: **planned, not started.** Written 2026-09-20, updated with answers to all questions (A-G answered).
Remaining follow-ups are in [Follow-up questions](#follow-up-questions).

## Goal

Customers (including guests) can get work done three ways. All three end in the same job lifecycle:
**request → worker accepts → contact details revealed → work → payment → worker confirms receipt → job closed.**

| # | Flow | Customer action | Worker action |
|---|------|-----------------|---------------|
| A | **Services** (exists) | Browse listings, apply to one | Accept / decline application |
| B | **Direct request** (new) | Find worker in Nearby, send a request | Accept / decline request |
| C | **Job posting** (restore) | Post a job (guests allowed), compare quotes, accept one | Browse job board, send quote |

B and C share one mechanism (D1): a `customer_job` in `jobs`. A direct request has `target_worker_id` set; a posted job has it null.

## Current state (verified in code)

- Flow A is complete: `ListingDetailScreen` → `listing_applications` → `ApplicationsScreen` → `worker_accept_listing_application` → `jobs` (origin `service_listing`) → `JobDetailScreen`.
- Nearby lists workers (`nearby_workers` RPC) and filters by category, but "Book" only shows an alert that sends the user to Services (`NearbyUstadScreen.tsx` `bookWorker`).
- Nearby returns and exposes worker `phone` (Call button) → commission leakage.
- Job posting was removed by `20260917160000_remove_customer_job_posting.sql`. Kept: `jobs`, `quotes`, the `origin` column and check. Dropped: anon and customer insert policies, `get_anon_job`, `claim_anon_job`, `customer_accept_quote`, worker quote policies, open-jobs visibility. (The old guest-posting code is in `20260512210000_anon_guest_browse_and_anon_jobs.sql` and can be used as reference.)
- Payment today: `mark_job_paid(job_id, amount, method, note)` lets the customer, worker or admin insert a `payment_ledger` row with status `paid`. There is no "worker confirmed receipt" step and no job `closed` state; `jobs.status` ends at `completed`.
- `ApplicationsScreen` only handles `listing_applications`.
- No notifications for new requests.
- Services loads all listings (`p_category: null`); category tiles only filter Nearby.

## Decisions

| ID | Decision |
|----|----------|
| D1 | **Yes** — reuse `jobs` + `quotes`; direct request = job with `target_worker_id`. |
| D2 | **Hybrid** — optional customer budget; worker accepts as-is or sends a different quote (quotes table). |
| D3 | **Guests may post jobs.** Phone number and address are asked only after a worker accepts. |
| D4 | **Yes** — phone/address hidden until acceptance. Admin is informed in-app when a job is accepted. After acceptance, numbers are shown. **A job closes only when payment is made by the customer and receipt is confirmed by the worker.** |
| D5 | **Both** — Expo push and in-app notifications/badges. |
| D6 | **Admin visibility:** a feed in the admin panel only (no approval gate, no admin push required). |
| D7 | **Payment is cash**, paid directly to the worker. The customer marks paid, the worker confirms receipt. |
| D8 | **Commission is settled by workers to the platform**, tracked in a "Hisab" ledger with due and overdue dates (see Phase 7). |
| D9 | **Guest quotes** live in a separate guest flow; workers can reply; the guest is converted to a user eventually. |
| D10 | **Phone OTP** is acceptable for guests. Pricing/cost of OTP to be studied later. |
| D11 | Workers see **full job details** before quoting; **quoting is free**, quotes **unlimited but tracked**. |
| D12 | A direct request that is not answered **opens to other matching workers**. |
| D13 | **Disputes:** call the helpline (no in-app dispute system for now). |
| D14 | **Only approved workers**, strictly, can receive requests, quote, and appear in Nearby. |
| D15 | **Notification language:** the user's own choice. |
| D16 | **Feature flags** for the new flows (existing `phase*Flags` pattern). |
| D17 | Unanswered direct request opens to other workers after **2 hours** (configurable in admin settings). |
| D18 | **Helpline number is a placeholder** (config value) to be filled in later. |
| D19 | Guests are notified by **both SMS and a saved link/in-app** channel. |
| D20 | **Admin settings page**: commission is **15% of order value** by default (editable). Overdue commission triggers notifications leading to **account deactivation**. |
| D21 | **Phone numbers are blocked in guest reply threads.** |
| D22 | If the worker does not confirm receipt after the customer marks paid, the job becomes **`disputed`** and shows in the admin feed. |
| D23 | Nearby considers **both distance and availability**. |

### D2 explained: how does a direct request get its price?

Example: Ali wants a plumber to fix a leaking tap and picks Usman from Nearby (Usman charges Rs 800/hour).

- **Option 1 — Worker quotes (recommended).** Ali sends: "Kitchen tap leaking, tomorrow 5pm, budget flexible."
  Usman sees it, replies with a quote: "Rs 1,500 total." Ali accepts or declines. Good when the job size is
  unclear. Reuses the `quotes` table and the same accept-quote step as posted jobs (flow C), so one code path.
  Downside: one extra round trip before the job starts.
- **Option 2 — Customer sets a budget.** Ali sends: "Kitchen tap leaking, tomorrow 5pm, my budget Rs 2,000."
  Usman just accepts or declines. Faster, simpler. Downside: bad for unclear jobs (Usman may decline because
  Rs 2,000 is too low, with no way to counter), and needs a separate accept path.
- **Option 3 — Hybrid.** Ali may enter a budget (optional). Usman can accept as-is, or send a different quote.
  Most flexible, slightly more UI. This is Option 1 with an optional budget field, so it costs little extra.

Recommendation: **Option 3.** It still uses `quotes` (one mechanism) and gives fast acceptance when the budget is fine.

## Job lifecycle (target)

`open` (posted, or sent to a worker) → `quoted` (a quote exists) → `pending_customer_confirm` / customer accepts quote →
**`assigned`** *(contact details revealed to both sides; admin notified)* → `completed` (worker marks work done) →
`payment_pending` → **`closed`** (customer paid **and** worker confirmed receipt). Cancelled/expired branches as today.

Needed schema changes: add `payment_pending` and `closed` to the `jobs.status` check; add a worker-receipt step
(new RPC `worker_confirm_payment_received(job_id)`), and make `mark_job_paid` move the job to `payment_pending`.
`closed` is set only by the receipt RPC after a `paid` ledger row exists.

## Phases

Each phase ships independently: migration + app + tests + docs together. Migrations deploy via CI on push to
`master` (`deploy-supabase.yml`); there is no local DB access.

### Phase 1 — Direct request from Nearby (flow B)

**Status: implemented and deployed to the live database 2026-09-21** (flags ship off; app not built yet). Deviations are noted inline. The feature flag is seeded `false`; enable with `update app_settings set value = 'true' where key = 'direct_requests_enabled'`.

**Database** (new migration)
- [x] `jobs.target_worker_id uuid null references profiles(id)`; index it.
- [x] Origin stays `customer_job`; targeted when `target_worker_id` is set (D1). Update constraints/policies only as needed.
- [x] RLS: authenticated customer inserts own job; if targeted, the target must be an approved worker; the targeted worker can select it.
- [x] Worker RPCs: `worker_accept_direct_request(job_id)`, `worker_decline_direct_request(job_id)`; quotes per D2.
- [x] Rate limit: max N open requests per customer per day.
- [x] Timeout (D12): if the targeted worker has not responded after N hours (D17: 2 hours, read from admin settings), the job opens to other approved, matching workers (job board) and the customer is notified. Add `target_expires_at`; `expire_direct_requests()` clears the target on expiry (pg_cron every 10 min if available). *Deviation:* the customer is not yet notified (Phase 3) and other workers cannot see the opened job until the job board (Phase 4); the customer can cancel meanwhile. The 2-hour timeout is stored in `app_settings` until the Phase 7 settings page exists.
- [x] Strict approval (D14): the request RPC and Nearby both require an approved worker.
- [x] Feature flag `direct_requests_enabled`.
- [x] Availability (D23): workers get an availability toggle/schedule (`worker_profiles.is_available`, optional working hours); `nearby_workers` filters and ranks by distance and availability, and Nearby shows an "Available now" chip. Add a worker screen control to switch availability.
- [x] Check `refresh_my_worker_signals` / ranking functions for request counting. **DONE, and it found a real problem:** worker completion-rate signals (`compute_worker_signals`) only counted jobs with status `completed`, so jobs that had moved on to `payment_pending` / `closed` / `disputed` dropped out. Fixed in `20260921190000_finished_job_statuses.sql` and tested. Requests themselves are not counted by the signals.

**Mobile**
- [x] `RequestWorkerScreen` (route `RequestWorker: { workerId, category? }`): description, category, preferred date/time, optional budget (D2 hybrid). **No phone/address at this stage** (D4).
- [x] `NearbyUstadScreen`: replace the `bookWorker` alert with navigation to `RequestWorker`.
- [x] `ApplicationsScreen`: workers see incoming requests (accept / decline / quote); customers see sent requests and status.
- [x] Navigation types + navigator registration; i18n (EN + Urdu).

**Tests**
- [x] pgTAP: request approved worker OK; unapproved/self denied; other workers cannot see it; accept/decline transitions; rate limit. **DONE:** `phase12_direct_requests_seeded.test.sql` (68 assertions with seeded people: creation, visibility for every role, all rejections, the daily limit, quote/replace/accept/decline/cancel, the 2-hour timeout, availability, Nearby ordering and filtering).
- [x] Jest: `RequestWorkerScreen` validation and submit; Nearby navigates on Book; Applications renders requests. Update snapshots. **DONE:** request screen, helpers, dashboard tile, `NearbyUstadScreen` (routing, no Call button, cross-links) and the inbox rows are tested.

**Docs**
- [x] `docs/api-reference.md` (new column, RPCs), `docs/mind-map.md` + `docs/mind-map.html` (Customer: "Send a request to a worker"; Worker: "Accept, decline or quote a request").
- [x] `docs/how-to-build.md` / `docs/how-to-run.md` if setup changes. In-app help: add an FAQ entry ("How do I request a worker?") in `FaqScreen` content.

### Phase 2 — Reveal, close and payment rules (D4)

This is the rule set that protects commission, so it comes right after Phase 1.

**Status: implemented and deployed to the live database 2026-09-21** (flags ship off; app not built yet). Deviations noted inline.

**Database**
- [x] Contact fields live in `job_contacts` (customer enters them after acceptance, form prefilled from the profile); visible to participants only once `status >= assigned`. Enforce with RLS or a security-definer RPC, not client hiding.
- [x] *Also required:* `profiles.phone`/`address` were readable by every signed-in user, so they are now locked with column-level privileges (this affects any future query that reads them). Remove `phone` from `nearby_workers` output; worker phone visible to the customer only after the job is assigned.
- [x] `jobs.status` adds `payment_pending`, `closed`; RPC `worker_confirm_payment_received(job_id)`; `mark_job_paid` moves the job to `payment_pending` (customer only). *Deviation:* `mark_job_paid` was re-created and now accepts only the customer and only `cash`; the old any-participant behaviour is gone.
- [ ] Event/row for admin: `admin_job_events` (job accepted, payment pending, closed) written by triggers; shown as a feed in the admin panel (D6). **DONE, with a note: the feed lives on a new web-admin page `Job Activity` (`/jobs`), not yet tested.**
- [x] Disputed state (D22): add `disputed` to `jobs.status`. If the customer marked paid and the worker has not confirmed receipt within N days (setting, suggest 3), a scheduled function sets `disputed`, writes an admin feed event, and notifies both to call the helpline. Admin can resolve it (mark closed with a note).
- [x] Cash payment (D7): `mark_job_paid` records method `cash` and the amount; the worker's receipt confirmation records the amount received. If amounts differ, flag the job in the admin feed and tell both parties to call the helpline (D13).
- [x] Helpline: show the helpline number on the job screen when a payment/receipt mismatch or problem is flagged (number is a placeholder in a config/settings table, D18, editable later from the admin settings page).

**Mobile**
- [x] Customer: after acceptance, prompt for phone + address (guests too); then show the worker's number and a Call button.
- [x] `JobDetailScreen`: payment step (customer marks paid) and worker "Payment received" confirmation; show "Closed" state.
- [x] Remove the Call button from Nearby cards.

**Tests**
- [x] pgTAP: phone/address hidden before assigned for every role except owner/admin; visible after; `nearby_workers` returns no phone; cannot close without `paid` row; only the worker can confirm receipt. **DONE:** `phase13_contact_payment_close_seeded.test.sql` (108 assertions: contact visibility per role before and after acceptance, the locked `profiles` columns, cash payment rules, receipt, mismatch dispute, admin resolve as paid/refunded, stale-payment dispute, the admin feed, and the finished-job fix for reviews, surveys, claims, photos and completion rate).
- [ ] Jest: JobDetail payment/receipt states; Nearby has no Call button. **PARTLY DONE: the payment and contact sections, their helpers, and Nearby-without-Call are tested. `JobDetailScreen` as a whole is not.**

**Docs**
- [x] api-reference (statuses, RPCs); mind maps: "Number shown after worker accepts", "Pay, worker confirms, job closes"; in-app FAQ entries for privacy and payment.

### Phase 3 — Notifications, push and in-app (D5)

**Status: implemented and deployed to the live database 2026-09-21** (flags ship off; app not built yet). Deviations noted inline.


- [x] `device_tokens` table (user_id, token, platform) + RLS; register on login in `AuthContext`, remove on logout.
- [x] `notifications` table (user_id, kind, job_id, read_at); DB triggers create rows on: new request/application/quote, accept/decline, assigned, payment pending, closed.
- [x] Push is sent from the database with `pg_net` (Expo push API) instead of an edge function, so it ships with migrations. *Deviation from plan:* needs `pg_net` enabled; best effort.
- [x] In-app: bell/list screen + unread badge on the Applications tab.
- [ ] Admin notification when a job is accepted (D4): row visible in `web-admin` (Phase 6) and optional push to admins. **NOT DONE (by design): the admin sees accepted jobs on the Job Activity feed from Phase 2; no admin push.**
- [x] Language (D15): each notification is rendered in the recipient's chosen language (store existing `profiles.preferred_language`; guests will store it on the guest record).
- [ ] Guests (D19): notified by SMS (needs an SMS provider; cost tied to the OTP pricing study) and by a saved claim link/device inbox. Guest phone is optional at posting; without it only the link/device channel works. **NOT DONE: deferred to Phase 4, when guest jobs exist.**
- [ ] Tests: token register/unregister (Jest); triggers create rows (pgTAP); push function dry-run test. **PARTLY DONE:** Jest covers token registration; `phase14_notifications_seeded.test.sql` (54 assertions) covers every trigger creating the right row in the right language, privacy, marking read, and device tokens. NOT covered: the actual push send through `pg_net` (not installed in the test database).
- [x] Docs: how-to-run (Expo push credentials, EAS), api-reference, mind map ("Get notified").

### Phase 4 — Restore job posting with quotes, guests allowed (flow C, D3)

**Status: implemented and deployed to the live database 2026-09-21** (flags ship off; app not built yet). Deviations noted inline. Flag `job_posting_enabled` ships off.

**Database** (reverses parts of `20260917160000`)
- [ ] Anon insert policy on `jobs` for `customer_job` (restore `jobs_insert_anonymous_post` pattern) with a guest claim token; re-create `get_anon_job` and `claim_anon_job` so a guest can view their job and attach it to an account later. **DEVIATION: no insert policy at all. Guests and customers post through the `post_job` function; the guest token is generated by the server. `get_anon_job`/`claim_anon_job` were replaced by `get_guest_job`/`claim_guest_job`.**
- [ ] Guest posts collect **no** phone/address (D3/D4); only description, category, area/city, budget, optional photos. **DONE. Photos are NOT built (no upload flow yet).**
- [ ] Authenticated customer insert + edit-own-open-job policies. **DEVIATION: via `post_job` (RPC-only), not policies. Editing an open job is not built; a job can be cancelled and reposted.**
- [ ] Workers see open `customer_job` jobs matching categories/city (job board), approved workers only. **PARTLY: filtered by category (and optional city). Not by distance: jobs have a city, not coordinates.**
- [x] Worker quote insert/update policies; `customer_accept_quote` re-created and callable by the owner or a guest holding the claim token.
- [ ] **Guest quote flow (D9):** guest jobs and their quotes are stored in a separate guest space (keyed by claim token, guest-only policies) so they never mix with registered-user data. Workers can quote and **reply** in a thread on the guest job. Phone numbers and similar contact strings are blocked in guest thread messages (D21): a server-side check rejects/masks digits patterns and links. **DEVIATION: guest and signed-in jobs share `jobs`/`quotes`; the guest is isolated by token-only functions and threads live in `job_thread_messages`. Contact numbers/links are blocked with a regex on all job text, quotes and thread messages.**
- [ ] **Guest -> user conversion:** when the guest accepts a quote, they verify a phone number by OTP (D10), enter address, and an account is created/linked (`claim_anon_job` re-created); guest jobs move to the new account and history is kept. **PARTLY: a guest signs in or registers to accept a quote and the job is attached automatically (`claim_guest_job`). Phone OTP is NOT built (no SMS provider chosen).**
- [ ] Abuse controls for guests: phone OTP before acceptance (D10), rate limit per device/IP at posting (edge function), job expiry cron. Quotes are unlimited but each is logged (D11) in `quote_events` (worker, job, time) for tracking. **PARTLY: no OTP, no per-IP limit (an overall hourly cap for all guests instead), plus expiry cron and the contact-text filter. Quote logging is done.**
- [x] Feature flag `job_posting_enabled`.

**Mobile**
- [x] `PostJobScreen` (works without sign-in): category, description, photos, area, budget range, date.
- [ ] Worker **Job Board** (approved workers only, D14): open jobs with **full details and photos** (D11), filtered by category and distance; free "Send quote" sheet; reply thread for guest jobs. **PARTLY: full details shown; no photos; no distance filter.**
- [ ] Customer/guest **Quotes** list on the job; compare price, rating, distance; accept a quote. Guest must supply phone/address at this step (the acceptance step, D4), and is nudged to create an account to keep history. **PARTLY: price, rating, verified and experience shown; distance not shown (no job coordinates).**
- [ ] Entry points: Dashboard "Post a job"; Nearby empty state; "Send only to this worker" option (flow B). **PARTLY: Dashboard, worker Job board and the Nearby empty state are done. "Send only to this worker" is already the direct request flow.**
- [x] i18n (EN + Urdu).

**Tests**
- [x] pgTAP: guest insert allowed; guest cannot read others' jobs; claim token flow; workers see only matching open jobs; quote rules; accept assigns worker and rejects others; expiry; rate limits. **DONE:** `phase15_job_posting_seeded.test.sql` (153 assertions). It found a security bug (see Verification below).
- [ ] Jest: PostJob (guest + signed-in), job board filters, quote submit, accept quote. **PARTLY DONE: post, posted job (guest and signed-in) and board quote screens plus the helpers are tested. Job board list filtering and the thread component are not.**

**Docs**
- [ ] api-reference; `docs/admin-panel.md` (moderation); mind maps ("Post a job without an account", "Job board, send quotes"); FAQ entries. **PARTLY: api-reference, mind maps, FAQ and how-to-run are updated; admin moderation of posted jobs is Phase 7.**

### Phase 5 — Unified inbox

**Status: implemented and deployed to the live database 2026-09-21** (flags ship off; app not built yet). Deviations noted inline.

- [x] One list for A applications, B requests and C quotes, for both roles; status chips and filters (pending / active / done; closed jobs sit under Done, disputes under Active). New: `InboxSection`, `RequestRow`, `lib/inbox.ts`; `DirectRequestsSection` and the old listing-application list were folded into it. The tab was already labelled Inbox.
- [x] Keep `worker_accept_listing_application` behavior unchanged.
- [x] Tests: Jest per row type (application, request, quote, job) and filters, for both roles. Docs: mind map ("One inbox for everything").
- Limits: each list is capped at 50 rows (most recent). No pagination or search yet. `phase16_unified_inbox_seeded.test.sql` (42 assertions) covers `list_my_quotes` and what each role can read for the inbox.

### Phase 6 — Discovery polish

**Status: implemented and deployed to the live database 2026-09-21** (flags ship off; app not built yet). Deviations noted inline.

- [x] `Services: { category?: string }`; *Deviation:* the dashboard tiles still open Nearby (your earlier choice); Services and Nearby instead link to each other with the chosen category ("See services in this category", "Find nearby workers instead"), and Services has its own category pills. "See all" opens Services unfiltered. Ranking RPCs and the fallback query now filter by category.
- [x] Empty states: Nearby with no workers → "Post a job"; Services with no listings → "Find nearby".
- [x] Tests: Jest for category filtering and empty states. Docs: mind map, api-reference.
- Found and fixed while doing this: **the two flows used different category names** (skill keys vs template categories), so a category could never filter across them. Added `lib/categoryMap.ts` and migration `20260921150000_phase17_template_categories.sql` (starter templates for carpentry, painting, welding so those workers can publish).
- Found and fixed: **`useT()` returned a new `t` on every render**, which made Nearby refetch workers in an endless loop (it lists `t` as a hook dependency). `useT` now returns one stable object.
- Not fixed (out of scope): the worker's "publish listing" form always uses the first template (`templates[0]`), regardless of the worker's category.

### Phase 7 — Admin, reporting and worker Hisab (commission ledger)

**Status: implemented and deployed to the live database 2026-09-21** (flags ship off; app not built yet). Deviations noted inline. Built on the assumed defaults in Follow-up Q-H/Q-J (7 / 7 / 14 days; 15% of the confirmed receipt amount); Q-I (how workers pay) is handled by letting the admin record any method.

**Hisab (D8)** — payment is cash, so the platform must track what each worker owes:
- [x] `worker_commission_ledger` (worker_id, job_id, job_amount_pkr, commission_pct, commission_pkr, due_date, status `due|paid|overdue|waived`, settled_at, settlement_method, settlement_ref). A row is created when a job becomes `closed`.
- [x] **Admin settings page** (*Deviation:* the existing Settings page and `app_settings` table were extended instead of a new `platform_settings`): commission percent (default **15%** of order value, D20), due-days, overdue warning schedule, deactivation grace days, direct-request timeout hours (2), receipt-dispute days (3), helpline number (placeholder). Changes are audit-logged in `app_setting_audit`; the commission percent used for a job is **snapshotted** on the ledger row at close.
- [x] Due date rule: commission = order value x settings percent; due `due_days` after the job closes (default suggested: 7 days, see Follow-up Q-H). A scheduled job marks rows `overdue` after the due date.
- [ ] Worker view (Account screen): total owed, next due date, overdue amount, jobs with commission, payment history. **DONE: total owed, next due date, overdue amount, job rows with status. There is no in-app pay button (payment is arranged with Ustad and recorded by admin).**
- [x] Admin view: per-worker balance, overdue list, aging buckets (0-7 / 8-30 / 30+ days), record a settlement received (method + reference), waive/adjust with a reason, audit trail of every change.
- [x] Overdue consequences (D20): notifications on a schedule, then **account deactivation** after the grace period unless settled; deactivated workers disappear from Nearby, the job board and listings; reactivation when the balance is settled. **DONE and tested:** Nearby, the job board, quoting, answering requests, being sent new requests, and ranked and direct listing reads all respect it. Remaining gap: a suspended worker can still sign in (they are hidden and blocked, not locked out).
- [ ] Hisab audit: exportable report (CSV) per worker and period, reconcilable against `payment_ledger`; ledger rows immutable (adjustments are new rows). **PARTLY: per-worker CSV export and an append-only events table are done. Reconciling against `payment_ledger` and a per-period export are not.**
- [ ] Extend/replace `phase9_admin_commission` so revenue reports use `closed` jobs and the new ledger. **NOT DONE: the existing Commissions page and its functions are unchanged (they still read `payment_ledger`). Since confirmed payments now carry `fee_pkr`, they show sensible totals, but they do not use the new ledger.**
- [x] Tests: pgTAP for ledger creation on close, overdue marking, RLS (worker sees only own rows), adjustment audit; Jest for the Account balance view; web-admin tests. **DONE except web-admin:** `phase18_hisab_seeded.test.sql` (163 assertions: commission creation and rate snapshot, worker view, overdue/warn/deactivate with exact thresholds, admin balances and aging, settle and waive with reactivation, settings audit, funnel, moderation) and Jest for the card. web-admin has no test setup.
- [x] Docs: admin-panel (Hisab), api-reference, mind maps (Worker: "See what you owe Ustad"; Admin: "Track worker dues and overdue"), in-app FAQ.

**Admin and reporting**

- [ ] `web-admin`: jobs by origin (listing / direct / posted), request volume, funnel (request → accepted → paid → closed). **PARTLY: funnel by flow is on Job Activity. Direct requests that opened up after the timeout count as posted (the target is cleared).**
- [ ] Admin feed of "job accepted" events (D4) and jobs stuck in `payment_pending`; admin can force-close or flag a dispute. **DONE in Phase 2 (Job Activity, dispute resolve). Jobs stuck in payment_pending are flagged automatically as disputes; no separate list.**
- [ ] Commission report covers all three origins and uses `closed` jobs (check `phase9_admin_commission`). **NOT DONE: see the `phase9_admin_commission` note above.**
- [ ] Moderation: close/hide a posted job, block abusive guests/customers. **PARTLY: close a posted job (reason, logged). Blocking abusive customers uses the existing suspend control and now stops posting. Blocking guests is not possible (no identity), only the rate caps.**
- [ ] Tests for admin queries; update `web-admin/src/lib/types.ts`. **PARTLY: web-admin has no test setup; types updated and type-checked.**
- [x] Docs: `docs/admin-panel.md`, api-reference.

## Verification: seeded-user pgTAP tests

Every phase now has a `*_seeded.test.sql` file in `supabase/tests/database/`. They create real people (two customers, three approved workers, one unapproved worker, one admin) through the signup trigger, then act as them under the same database roles the app uses (`authenticated`, `anon`), so row-level security and privileges are genuinely exercised. Structure-only files remain alongside them.

| Phase | File | Assertions |
|-------|------|-----------|
| 1 Direct requests | `phase12_direct_requests_seeded` | 68 |
| 2 Contact, payment, closing | `phase13_contact_payment_close_seeded` | 126 |
| 3 Notifications | `phase14_notifications_seeded` | 54 |
| 4 Job posting, guests, quotes | `phase15_job_posting_seeded` | 153 |
| 5 Unified inbox | `phase16_unified_inbox_seeded` | 42 |
| 6 Categories and discovery | `phase17_template_categories_seeded` | 36 |
| 7 Hisab, admin, moderation | `phase18_hisab_seeded` | 163 |

**How it was run:** against a clean Postgres 17 (the `supabase/postgres` image): all migrations applied in order from an empty database, then every test file run. The only stand-ins were the tables the Supabase storage service normally creates and some `auth.users` columns. `pg_net` and `pg_cron` were not installed there, so the push send and the scheduled schedules themselves are untested (the functions they call are tested directly).

**Bugs these tests found, all fixed** (none had shipped):
1. **Security:** in Phase 4, `_can_manage_job` and `list_thread` could evaluate to NULL, which the callers treated as "allowed". A signed-in stranger could read the quotes and threads of a guest job, cancel it, and a guest with a wrong token could read a thread. Fixed in the Phase 4 migration.
2. `customer_cancel_job` (from the original schema) always failed with an ambiguous column error. Fixed in `20260921170000_fix_customer_cancel_job.sql`.
3. After payment, customers could no longer leave reviews, add completion photos, or submit quality surveys and guarantee claims, and worker completion-rate signals ignored paid jobs. Fixed in `20260921190000_finished_job_statuses.sql`.
4. Ranked discovery still listed suspended workers' listings. Fixed in `20260921180000_hide_suspended_worker_listings.sql`.
5. A suspended worker could still be sent new direct requests. Fixed in the Phase 1 migration.
6. **Pre-existing privacy hole, found in the final review:** any signed-in user could read every worker's national ID number and exact location from `worker_profiles`. Now locked at column level (`20260921200000_lock_worker_profile_sensitive_columns.sql`) and tested in the Phase 2 seeded file.
7. My structural tests assumed `anon` could not execute functions, but Supabase grants that by default; the migrations now revoke it explicitly.

## Cross-cutting checklist (every phase)

- [ ] Migration named `YYYYMMDDHHMMSS_<phaseN>_<slug>.sql`; additive and reversible; no destructive drops.
- [ ] pgTAP tests for every new policy/RPC, including denied cases.
- [ ] Jest tests for every new/changed screen; regenerate snapshots deliberately.
- [ ] `npx tsc --noEmit` and Jest in `mobile/`; type-check `web-admin/`.
- [ ] Detox happy path per flow: A, B, C, plus guest posting.
- [ ] i18n: every new string has EN + Urdu.
- [ ] **Docs, same PR:** `docs/api-reference.md`, `docs/admin-panel.md`, `docs/how-to-build.md`, `docs/how-to-run.md`, `README.md` if flows change.
- [ ] **Mind maps:** `docs/mind-map.md` and `docs/mind-map.html` kept in sync.
- [ ] **In-app docs/help:** FAQ and help content updated for each new user-facing rule.
- [ ] Manual QA using accounts in `docs/seed-data/phase1-seed-accounts.txt`.

## Order and size

| Phase | Depends on | Size |
|-------|-----------|------|
| 1 Direct request | — | M |
| 2 Reveal, close, payment rules | 1 | M–L |
| 3 Notifications | 1, 2 | M |
| 4 Job posting, guests | 1, 2, 3 | L |
| 5 Unified inbox | 1, 4 | S–M |
| 6 Discovery polish | — (can run any time) | S |
| 7 Admin, reporting and Hisab ledger | 2, 4 | L |

Phases 1–3 give a usable product with flows A and B, privacy and payment rules. Phase 4 adds job posting.

## Follow-up questions

Questions A-G are answered (D17-D23). Small ones remain, mostly to confirm defaults:

- **Q-H [Phase 7]:** confirm defaults for overdue: commission due **7 days** after the job closes; reminders at overdue day 1 and 7; deactivation after **14 days** overdue? (All editable in the admin settings page, so a wrong guess is cheap.)
- **Q-I [Phase 7]:** how do workers pay the platform (bank transfer, JazzCash/Easypaisa, or cash to an agent)? Needed for the settlement screen wording and the reference field.
- **Q-J [Phase 7]:** is 15% charged on the amount the customer actually paid (the receipt amount), or on the accepted quote? (Plan assumes the confirmed receipt amount.)
- **Q-K [Phase 3/4]:** which SMS provider or gateway for guest SMS and OTP (ties to the deferred OTP pricing study)? Not needed until Phase 3.

Deferred: phone OTP pricing/cost study (D10) is tracked separately.

## Risks

- Guest posting (D3) reverses a deliberate removal; expect spam and moderation load. Rate limits, expiry, and admin close tools are part of Phase 4 and 7.
- Hiding contact details must be enforced in the database (RLS/RPC), not just in the UI; every policy needs a denied-case pgTAP test.
- `closed` status and payment changes touch existing `mark_job_paid`, commission, and admin reports; regression-test Phase 2 flows for existing service-listing jobs.
- Migrations only deploy through CI; a bad migration on master hits the live database, so review before pushing.
- Existing tests/snapshots for Dashboard, Services, Nearby, and Auth will change; update them intentionally.
