# Phase 1 — Booking state machine, RLS, and RPC contract

Canonical SQL lives in [`supabase/migrations/20250206120000_phase1_schema.sql`](../../supabase/migrations/20250206120000_phase1_schema.sql) plus follow-ups (e.g. review rollup). Clients must not invent status transitions outside these paths.

## Philosophy

- **Writes that change lifecycle** (`open` → `assigned` → `completed`, Rail B confirms) happen only through **`SECURITY DEFINER` Postgres functions**. That keeps `jobs.status` and related rows consistent even though RLS allows broader reads.
- **Edge Functions** are optional add-ons (notifications, orchestration); Phase 1 does not require them for booking integrity.

## `jobs.status` meanings

| Value | Typical context |
|-------|----------------|
| `open` | Rail A: customer-posted job, awaiting quotes |
| `quoted` | Reserved for richer UX (optional); schema allows it |
| `pending_customer_confirm` | Rail B: worker accepted application; waiting on customer confirmation |
| `assigned` | Hired/booked; work in progress |
| `completed` | Terminal success (reviews allowed) |
| `cancelled` | Terminal cancelled |

## `jobs.origin`

- `customer_job` — Rail A.
- `service_listing` — Rail B (`listing_application_id` set).

## Mandatory Rail B invariant

Worker accept on an application must create a job row in **`pending_customer_confirm`** with `worker_id` set. The customer **`customer_confirm_booking`** RPC is the **only** path to move that job from `pending_customer_confirm` to **`assigned`**. Clients must never call `UPDATE jobs SET status = 'assigned'` directly as an authenticated row (policy blocks it anyway).

## RPC matrix (authenticated callers)

| RPC | Authorized actor | Preconditions | Effect |
|-----|-----------------|---------------|--------|
| `customer_accept_quote(quote_id uuid)` | Job’s **customer** | `origin = customer_job`, job `status = open` | Accept one quote → `assigned` + rejects other pendings |
| `worker_accept_listing_application(application_id uuid)` | **Listing owner** worker | Application `pending` | Application `accepted` → INSERT job Rail B **`pending_customer_confirm`** (idempotent with unique `(listing_application_id)` on jobs) |
| `customer_confirm_booking(job_id uuid)` | Job’s **customer** | `pending_customer_confirm`, `origin = service_listing` → **`assigned`** |
| `worker_decline_listing_application(application_id uuid)` | Listing owner | Pending | Application `declined` |
| `mark_job_completed(job_id uuid)` | **Customer or worker** on that job | `assigned` → **`completed`** |
| `customer_cancel_job(job_id uuid)` | **Customer** | `open`, `quoted`, or `pending_customer_confirm` → **`cancelled`**, rejects pending quotes |

Direct PostgREST `PATCH` on `jobs` for status-changing fields is ineffective for hires: customers may only PATCH while status is `open`/`quoted`; workers may not arbitrarily assign themselves.

## Messages & quotes (RLS summary)

- **Quotes:** Workers insert on **`open`** Rail A jobs; customer and quoting worker read; broader worker read allowed for **`open`** job discovery.
- **Messages:** Participants (`customer`, `assigned`/`pending_customer_confirm` **worker**) and quoting workers (**pending quote** on open Rail A) per policies in migration.

## Reviews

- **Insert:** Customer after **`completed`**, exactly **one row per job** (`job_id UNIQUE`), `reviewee_id` must match hired `worker_id`.
- **Reputation:** Trigger `sync_worker_profile_from_reviews()` updates `worker_profiles.review_count` / `avg_rating` on each insert (migration `20250407180000_review_worker_rating.sql`).

## Storage (Phase 1)

Bucket setup remains **manual** in the dashboard; see [`supabase/README.md`](../../supabase/README.md). Policies can land in later migrations once upload paths stabilize.
