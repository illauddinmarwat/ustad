# Ustad — Supabase (Phase 1)

## Prerequisites

- [Supabase CLI](https://supabase.com/docs/guides/cli)
- Docker Desktop (**Windows/macOS/Linux**) for **`supabase start`** locally — see [`docs/local-development.md`](../docs/local-development.md)

## Hosted project setup

1. Create a project at [supabase.com](https://supabase.com/dashboard).
2. Open **SQL Editor** and run migrations in order:
   - `migrations/20250206120000_phase1_schema.sql`
   - `migrations/20250206120100_seed_templates.sql`
   - `migrations/20250407180000_review_worker_rating.sql`
   
   Or link the repo and push: `supabase link` then `supabase db push`.

3. Copy **Project URL** and **anon key** into `mobile/.env` (see `mobile/.env.example`).

## Booking RPCs (client calls)

| Function | Caller | Purpose |
|---------|--------|---------|
| `customer_accept_quote(quote_id)` | Customer | Rail A hire |
| `worker_accept_listing_application(application_id)` | Worker | Rail B → `pending_customer_confirm` |
| `customer_confirm_booking(job_id)` | Customer | Rail B → `assigned` |
| `worker_decline_listing_application(application_id)` | Worker | Decline applicant |
| `mark_job_completed(job_id)` | Customer or worker | `assigned` → `completed` |
| `customer_cancel_job(job_id)` | Customer | Cancel open / quoted / `pending_customer_confirm` |

## Storage buckets (manual in dashboard Phase 1)

Create buckets matching app usage:

- `cnic-private` — private, worker CNIC uploads
- `avatars` — public read
- `job-photos` — authenticated read/write via policy (configure when wiring uploads)

Policies for storage are not included in Phase 1 SQL — add in a follow-up migration when upload paths are finalized.

## Automated tests (pgTAP)

With [Supabase CLI](https://supabase.com/docs/guides/cli) and Docker (`supabase start`):

```bash
supabase start
supabase test db
```

Runs `*.test.sql` under `tests/database/` (Phase 1 schema + review trigger smoke tests).
