# API Reference

Ustad has **no custom REST server**. Both apps use the Supabase client (`@supabase/supabase-js`) with the public anon key. The "API" is:
1. **Auth**: Supabase Auth (email + password).
2. **RPC**: Postgres functions called with `supabase.rpc(name, params)` (HTTP `POST /rest/v1/rpc/<name>`).
3. **Tables**: `supabase.from('table')` (PostgREST), limited by Row Level Security.
4. **Storage**: file buckets.

The signed-in user's JWT is sent automatically, and `auth.uid()` inside functions is that user. Errors come back as `{ error: { message } }`. Admin functions return `admin only` for non-admins.

## Auth
| Call | Input | Output |
|------|-------|--------|
| `auth.signUp` | email, password, profile metadata (name, role, phone, city...) | user/session. A `handle_new_user` trigger creates the `profiles` row. |
| `auth.signInWithPassword` | email, password | session (JWT) |
| `auth.signOut` | none | none |

Guests can browse without signing in (anon role), but only through functions granted to `anon`.

## Customer / public functions

### `nearby_workers` (anon + signed-in)
Finds approved workers near a point, closest first.

| Input | Type | Notes |
|-------|------|-------|
| `p_lat`, `p_lng` | double | Customer location |
| `p_category` | text, optional | e.g. `plumber` |
| `p_limit` | int, default 30 | clamped to 1..100 |

Output rows: `user_id, display_name, city, bio, categories[], avg_rating, review_count, is_verified, rate_pkr, rate_unit, years_experience, photo_url, distance_km, is_available`. Only approved workers are returned; available workers are listed first, then by distance. **Phone numbers are not returned** (revealed only after a worker accepts, see below).

### Direct requests (signed-in; behind flag `direct_requests_enabled`)
A customer asks one chosen worker (from Nearby) to do a job. It is a row in `jobs` with `origin = 'customer_job'` and `target_worker_id` set. No phone or address is collected at this stage.

| Function | Who | Input | Result |
|----------|-----|-------|--------|
| `create_direct_request` | customer | `p_worker_id`, `p_title`, `p_description`, `p_category`, `p_budget_pkr` (optional; ignored and stored as null once `quote_commission_markup_enabled` is on), `p_preferred_time` (optional), `p_location_text` (optional) | New job id. Errors: `direct requests are not enabled`, `cannot request yourself`, `title and description are required`, `worker not available for this category` (unknown, unapproved, or wrong category), `daily request limit reached` |
| `worker_accept_direct_request` | targeted worker | `p_job_id` | void. Accepts the customer's budget as-is; job becomes `assigned`. Error `no budget set; send a quote instead` (always, once `quote_commission_markup_enabled` is on) |
| `worker_quote_direct_request` | targeted worker | `p_job_id`, `p_amount_pkr`, `p_message` (optional) | Quote id. Job becomes `quoted`. A new quote replaces the worker's earlier pending one. With the commission markup on, `p_amount_pkr` is the worker's own price and the stored quote amount is the customer price (see *Quote commission markup* below) |
| `worker_decline_direct_request` | targeted worker | `p_job_id` | void. Job becomes `cancelled` |
| `customer_accept_direct_quote` | job owner | `p_quote_id` | void. Job becomes `assigned` to the quoting worker; other pending quotes are rejected |
| `customer_cancel_job` | job owner | `job_id` | void (existing function; works while `open`, `quoted`) |
| `worker_set_availability` | worker | `p_available` boolean | void. Controls the "Available now" chip and ranking in Nearby |

New columns: `jobs.target_worker_id`, `jobs.target_expires_at`, `jobs.budget_pkr`, `jobs.preferred_time`, `worker_profiles.is_available`.

Settings in `app_settings`: `direct_requests_enabled` (default `false`), `direct_request_timeout_hours` (default 2), `direct_request_daily_limit` (default 5).

Timeout: `expire_direct_requests()` (scheduled every 10 minutes when `pg_cron` is available) clears the target of `open` requests older than the timeout so they are no longer tied to one worker. The job board that lets other workers see them arrives with job posting; until then the customer can cancel the request.

Visibility: a customer sees their own jobs, a worker sees jobs they are assigned to or that are targeted at them while `open`/`quoted`.

```ts
await supabase.rpc('create_direct_request', {
  p_worker_id: workerId, p_title: 'Fix tap', p_description: 'Kitchen tap is leaking',
  p_category: 'plumber', p_budget_pkr: 1500,
});
await supabase.rpc('worker_quote_direct_request', { p_job_id: id, p_amount_pkr: 1800 });
await supabase.rpc('customer_accept_direct_quote', { p_quote_id: quoteId });
```

### Contact reveal and cash payment (signed-in)
Phone and address stay hidden until a worker accepts (job status `assigned` or later). `profiles.phone` and `profiles.address` are no longer readable by signed-in users (column-level privileges); use the functions below. Columns added to `profiles` in future must be granted with `grant select (col) on public.profiles to authenticated`.

The same lock covers `worker_profiles.cnic_number`, `lat`, `lng` and `location_updated_at` (`20260921200000_lock_worker_profile_sensitive_columns.sql`): signed-in users can read every other worker column, but not the national ID or exact location. Workers can still write them; Nearby reads locations through `nearby_workers`, and admins read the ID through `admin_list_worker_approvals`. New `worker_profiles` columns must likewise be granted explicitly.

Job status flow: `assigned` -> `completed` -> `payment_pending` -> `closed`. Reviews, completion photos, quality surveys, guarantee claims and worker completion-rate signals treat `completed`, `payment_pending`, `disputed` and `closed` all as "finished". A mismatch or an unconfirmed payment goes to `disputed`; an admin resolves it after a helpline call, which closes the job.

| Function | Who | Input | Result |
|----------|-----|-------|--------|
| `get_my_contact_defaults` | signed-in | none | Own `phone`, `address` (to prefill the form) |
| `customer_set_job_contact` | job owner | `p_job_id`, `p_phone`, `p_address` | void. Only once the job is `assigned`/`completed`/`payment_pending`. Errors: `invalid phone number`, `address is required`, `contact details can be shared once a worker has accepted` |
| `get_job_contacts` | customer, assigned worker, admin | `p_job_id` | One row: `worker_phone` (customer/admin only), `customer_phone`, `customer_address`, `contact_shared`. Empty before acceptance or for anyone else |
| `mark_job_paid` | job owner | `p_job_id`, `p_amount`, `p_method` (only `cash`), `p_note` | Ledger id. Job must be `completed`; ledger row is `pending`; job becomes `payment_pending` |
| `worker_confirm_payment_received` | assigned worker | `p_job_id`, `p_received_amount` | `'closed'` if the amount equals what the customer paid (ledger `paid`, commission `fee_pkr` set from `commission_rate_pct`), otherwise `'disputed'` |
| `flag_unconfirmed_payments` | scheduled (hourly, if `pg_cron`) | none | Moves `payment_pending` jobs older than `payment_confirm_days` (default 3) to `disputed` |
| `admin_list_job_events` | admin | `p_limit` (default 50, max 200) | Feed rows: `kind` (`accepted`, `payment_pending`, `closed`, `disputed`, `dispute_resolved`), `detail`, `job_title`, `job_status`, `customer_name`, `worker_name`, `created_at` |
| `admin_resolve_job_dispute` | admin | `p_job_id`, `p_ledger_status` (`paid`/`refunded`), `p_note` (required) | void. Job becomes `closed` |

New tables: `job_contacts` (no client access), `admin_job_events` (no client access; written by a trigger on `jobs.status`). New column: `payment_ledger.received_amount_pkr`. `payment_ledger.method` now allows `cash`.

Settings in `app_settings`: `helpline_number` (placeholder text until set), `payment_confirm_days` (default 3), `commission_rate_pct` (default 15).

### Notifications (signed-in)
Every important event writes an in-app notification and tries to push it to the recipient's devices. Text is written in the recipient's `profiles.preferred_language` (`ur` default, or `en`).

| Call | Input | Result |
|------|-------|--------|
| `from('notifications').select(...)` | none | The caller's own notifications (RLS). Columns: `id, kind, job_id, title, body, data, read_at, created_at` |
| `register_device_token` | `p_token` (Expo push token), `p_platform` | void. Stores or re-assigns the token to the caller |
| `unregister_device_token` | `p_token` | void. Call before sign-out |
| `mark_notifications_read` | `p_ids` uuid[] (null = all) | Number of rows marked read |

Kinds and recipients: `request_received` (worker), `thread_message` (the other side of a job thread), `quote_received` (customer), `job_assigned` (customer: add contact details), `job_assigned_worker`, `request_declined` (customer), `request_cancelled` (worker), `contact_shared` (worker), `job_completed` (customer: pay), `payment_marked` (worker: confirm), `job_closed` (both), `job_disputed` (both), `application_received` (worker), `application_accepted` / `application_declined` (customer).

Rows are created by triggers on `jobs`, `quotes`, `listing_applications` and `job_contacts`; clients cannot insert or update them. Push goes through Expo's push API using the `pg_net` extension and is best effort: if `pg_net` is missing or a push fails, the in-app notification still exists. Guest notifications (SMS and link) arrive with guest job posting; admins see job events on the Job Activity page instead of receiving notifications.

### Job posting and quotes (behind flag `job_posting_enabled`)
A customer, or a **guest with no account**, posts a job. Approved workers see it on a job board, ask questions, and send quotes. The poster accepts one quote, and the job continues into contact reveal, cash payment and closing. There are no insert policies on `jobs`: everything goes through these functions. A guest is identified only by the secret `guest_token` returned when they post.

| Function | Who | Input | Result |
|----------|-----|-------|--------|
| `post_job` | customer or guest (anon) | `p_title`, `p_description`, `p_category`, `p_city`, `p_location_text`, `p_preferred_time`, optional `p_title_i18n`, `p_description_i18n` (see Help me write; no customer budget: workers name their own price) | One row: `job_id`, `guest_token` (only for guests). Rejects phone numbers and links in the text. Limits: `job_post_daily_limit` (default 10) per customer per day; `guest_job_hourly_cap` (default 30) for all guests per hour |
| `get_guest_job` | guest with token | `p_token` | The job (plus `quote_count`). Empty once the job is claimed |
| `job_quotes` | job owner or guest with token | `p_job_id`, `p_token` | Quotes with `worker_name`, `amount_pkr`, `message`, `avg_rating`, `review_count`, `is_verified`, `years_experience`, cheapest first |
| `list_open_jobs` | approved worker | `p_category`, `p_city`, `p_limit` | Open, unexpired jobs in the worker's categories, with full details, `quote_count` and the worker's own `my_quote_pkr` (the price they typed, not the customer price). No customer identity. Includes direct requests that expired and opened up |
| `get_board_job` | approved worker | `p_job_id` | One job with full details, `my_quote_pkr` (the worker's own price) and `my_customer_price_pkr` (what the customer sees) |
| `worker_quote_job` | approved worker | `p_job_id`, `p_amount_pkr` (the worker's own price), `p_message` | Quote id. Free and unlimited; each is logged in `quote_events`. Replaces the worker's earlier pending quote. Errors include `this job is outside your categories`, `you cannot quote on your own job`, `this job is no longer open` |
| `post_thread_message` | poster (or guest with token), or the quoting worker | `p_job_id`, `p_worker_id`, `p_body`, `p_token` | void. Pre-assignment thread per (job, worker). Rejects phone numbers and links. Notifies the other side |
| `list_thread` | same | `p_job_id`, `p_worker_id`, `p_token` | Messages: `sender_role`, `body`, `created_at` |
| `customer_accept_quote` | signed-in job owner | `p_quote_id` | void. Job becomes `assigned`, other quotes rejected. A guest gets `sign in to accept a quote`: they sign in or register and the job is attached first |
| `claim_guest_job` | signed-in customer | `p_token` | Job id. Attaches the guest job (with its quotes and threads) to the account and clears the token |
| `cancel_posted_job` | job owner or guest with token | `p_job_id`, `p_token` | void, while `open`/`quoted` |
| `expire_posted_jobs` | scheduled (every 30 min, if `pg_cron`) | none | Cancels open customer jobs older than `job_expiry_days` (default 7) |

New columns on `jobs`: `city`, `budget_min_pkr`, `budget_max_pkr` (kept for jobs posted before budgets were removed; new jobs leave them empty), `expires_at`. New tables (no client access): `quote_events`, `job_thread_messages`. Settings: `job_posting_enabled` (default `false`), `job_media_enabled` (default `false`), `quote_upgrades_enabled` (default `false`), `typical_price_min_jobs` (default 10), `job_post_daily_limit`, `guest_job_hourly_cap`, `job_expiry_days`.

Not yet built: phone OTP and SMS for guests (a guest signs in or registers to accept instead), voice notes and video on jobs (see `docs/job-media-plan.md`), distance filtering on the board (jobs carry a city, not coordinates), and per-IP rate limits for guests.

#### Quote details

Behind `quote_upgrades_enabled` (default `false`). A quote can carry a price type and the day the worker can start; the customer's quote list returns them for comparison.

| Function | Who | Input | Result |
|----------|-----|-------|--------|
| `worker_send_quote` | approved worker | `p_job_id`, `p_amount_pkr`, `p_message`, `p_price_type` (`fixed` or `estimate`), `p_available_from` (a date, yesterday up to 30 days ahead) | Quote id. Same rules and errors as `worker_quote_job`, then records the details. `estimate` means the final price is confirmed after the worker inspects the job (final-price confirmation comes in a later phase) |
| `job_quotes` | job owner or guest with token | `p_job_id`, `p_token` | Adds `price_type`, `available_from` and `completed_jobs` (jobs this worker has finished) to the earlier columns |

`quotes` gains `price_type` (default `fixed`) and `available_from`. Quotes sent the old way stay fixed with no date.

**Estimates and final price.** A quote with `price_type = 'estimate'` needs a final price before the job can be paid. The Ustad proposes their own price after inspecting the job; if the commission markup is on, the same percent as on the accepted quote is applied, so the customer sees their price and the Ustad keeps their own. The customer accepts or declines; up to three proposals. The breakdown is in the private table `job_final_prices` (no client access).

| Function | Who | Input | Result |
|----------|-----|-------|--------|
| `worker_set_final_price` | the assigned Ustad | `p_job_id`, `p_amount_pkr` (their own price) | The customer price. Only for an accepted estimate quote, while the job is `assigned` or `completed`; replaces a proposed or declined price; refused once confirmed or after three declined proposals |
| `customer_respond_final_price` | the customer | `p_job_id`, `p_accept` | `confirmed` or `declined`. Notifies the Ustad |
| `job_final_price` | customer, assigned Ustad, admin | `p_job_id` | `is_estimate`, `status` (`none`, `proposed`, `confirmed`, `declined`), `amount_pkr` (the viewer's own number), `customer_price_pkr` (what is paid in cash), `attempts`, `viewer` |

**Voice notes on quotes and in the thread, and typical price.** Voice notes are up to 30 seconds, stored in the private `quote-voice` bucket at `{sender_id}/{job_id}/{file}` and readable only by the Ustad, the job's signed-in owner and admins (a guest poster cannot upload or hear them). Still behind `quote_upgrades_enabled`.

| Function | Who | Input | Result |
|----------|-----|-------|--------|
| `worker_attach_quote_voice` | the quoting Ustad | `p_quote_id`, `p_path`, `p_seconds` (1 to 30) | void. Only on their own pending quote, path in their own job folder |
| `post_thread_voice` | the job's signed-in owner, or the Ustad in that thread | `p_job_id`, `p_worker_id`, `p_path`, `p_seconds` | void. A thread message with no text. Notifies the other side |
| `list_thread` | as before | `p_job_id`, `p_worker_id`, `p_token` | Adds `audio_path` and `audio_seconds`; `body` is empty for a voice note |
| `job_quotes` | as before | `p_job_id`, `p_token` | Adds `audio_path` and `audio_seconds` |
| `typical_price` | anyone | `p_category`, `p_city` | One row `scope` (`city` or `category`), `sample_size`, `low_pkr`, `median_pkr`, `high_pkr` (25th, 50th, 75th percentile of paid jobs in the last 90 days, rounded to Rs 10), or no row when fewer than `typical_price_min_jobs` (default 10) jobs |

A thread message needs text or a voice note.

`mark_job_paid` on an estimate job fails with `agree the final price before paying` until the price is confirmed, and the amount must equal it. Notifications: `final_price_proposed`, `final_price_confirmed`, `final_price_declined`.

#### Job media (photos)

Signed-in customers can attach up to 4 photos to an open job they posted (guests cannot). Approved, active workers whose categories include the job's category can see them so they can price the work; the owner and admins can too. Everyone else, including workers in other categories, cannot. Files live in the private `job-media` bucket at `{customer_id}/{job_id}/{file}`; a file is readable only through short-lived signed URLs and only once it is registered. Server flag: `job_media_enabled` (default `false`). The table `job_media` has no client access.

| Function | Who | Input | Result |
|----------|-----|-------|--------|
| `add_job_media` | job owner | `p_job_id`, `p_kind` (`photo`, `audio`, `video`), `p_path`, `p_bytes`, `p_duration_s` | Media id, after the file was uploaded to the owner's job folder. Caps: 4 photos (3 MB each), 1 voice note (60 s, 3 MB), 1 video (30 s, 25 MB). Only while the job is open |
| `remove_job_media` | job owner or admin | `p_media_id` | The stored path, so the caller can delete the file |
| `list_job_media` | owner, admin, or a matching worker | `p_job_id` | Files (`id`, `kind`, `path`, `bytes`, `duration_s`). Empty for anyone else |
| `job_media_counts` | same | `p_job_ids` | Per job: `photos`, `audios`, `videos`, only for jobs the caller may see (board chips) |
| `admin_job_media_to_purge` | admin | `p_limit` | Files of removed media, of jobs cancelled or expired over 7 days ago, and of closed jobs over 30 days ago |
| `admin_mark_job_media_purged` | admin | `p_ids` | Count. Call after deleting the files from Storage; the admin Posted jobs page has a button that does both |

Photos, one voice note (up to 60 s) and one video (up to 30 s, 25 MB) are wired into the app. Allowed file types in the bucket: JPEG/PNG/WebP images; AAC/M4A, 3GP, WebM, MP3 audio; MP4, QuickTime, 3GP, WebM video.

```ts
const { data } = await supabase.rpc('post_job', { p_title: 'Fix tap', p_description: 'Kitchen tap leaking', p_category: 'plumber' });
const { job_id, guest_token } = data[0];          // guest_token is null when signed in
await supabase.rpc('worker_quote_job', { p_job_id: job_id, p_amount_pkr: 1800 });
await supabase.rpc('customer_accept_quote', { p_quote_id: quoteId });
```

### Service listings without a price (signed-in unless noted; behind flag `listing_quote_requests_enabled`)
A listing carries no price. A customer asks the listing's Ustad for a quote; the Ustad's quote is the only price. `worker_service_listings.price_pkr` is now nullable and the app never writes or shows it. Listing photos (up to 4) live in the **public** `listing-media` bucket.

| Function | Who | Input | Result |
|----------|-----|-------|--------|
| `create_listing_request` | signed-in customer | `p_listing_id`, `p_title`, `p_description`, `p_location_text`, `p_preferred_time` | Job id. Creates a direct request (see Direct requests) to the listing's Ustad, with the listing's category and `jobs.listing_id` set. Needs both `listing_quote_requests_enabled` and `direct_requests_enabled`. Same checks as `create_direct_request` (not your own listing, approved Ustad, daily limit) |
| `add_listing_media` | listing owner | `p_listing_id`, `p_path`, `p_bytes` | Media id, after the photo was uploaded to `{worker_id}/{listing_id}/` in `listing-media`. Max 4 photos, 3 MB each |
| `remove_listing_media` | listing owner or admin | `p_media_id` | The file path, so the app can delete the stored object |
| `list_listing_media` (anon + signed-in) | anyone | `p_listing_ids` | Photos of active listings; an owner also gets the photos of their draft listings |

The Ustad sees a listing request in the Inbox like any direct request, and opens it with the same screen as the job board (`get_board_job`) to see the customer's photos, video and voice note and send a quote.

### Help me write (AI) and English/Urdu posts (signed-in or guest; behind flag `ai_help_enabled`)
Posts and listings keep the author's original text and an English and an Urdu version, which the author approves in the app. The AI runs in the Edge Function `ai-draft`; the app never holds an AI key.

**Edge Function `ai-draft`** (`supabase/functions/ai-draft`; secrets `GROQ_API_KEY`, `GROQ_MODEL`, optional `GROQ_REASONING_EFFORT`). `POST` JSON, answered with HTTP 200 and `{ ok: true, action, data }` or `{ ok: false, error }`. Errors: `disabled`, `limit` (daily allowance used), `contact` (a phone number or link in the input), `blocked` (the answer had a number, link or price, so it was refused), `ai_failed`, `bad_request`. Call it with the anon key (guest) or a signed-in token; send a stable `x-device-id` header so a guest's allowance follows the device.

| `action` | Input | `data` |
|----------|-------|--------|
| `questions` | `kind` (`job` or `listing`), `lang` (`en`/`ur`), `text`, `categories` (jobs), `answers` | `{ questions: [{ id, text, options[2-4] }] }`, at most 3, never about money |
| `draft` | the same, with the answers | `{ draft }`: job `{ source, category, title{en,ur}, description{en,ur} }`; listing `{ source, headline{en,ur}, about{en,ur} }` |
| `translate` | `kind`, `from`, `fields` (`title`, `description`, `headline`, `about`) | `{ fields, to }`: the same fields in the other language |

Every call: the flag must be on; one unit is taken from the day's allowance (`ai_daily_limit_user`, default 5; `ai_daily_limit_guest`, default 2) and given back if the call fails or the answer is refused. Input and output are both checked for phone numbers, links and money. Only counts are logged.

| Function / table | Who | Notes |
|------------------|-----|-------|
| `post_job` | customer or guest | Now also takes `p_title_i18n` and `p_description_i18n` (jsonb, optional): `{"source":"en","en":"...","ur":"...","ai":true}`. Both versions are checked for phone numbers and links |
| `worker_service_listings.headline_i18n`, `detail_i18n` | owner (insert/update) | Same shape. A trigger applies the same text rules to the listing text, areas and translations |
| `jobs.title_i18n`, `description_i18n` | via `post_job` | Read the other language of jobs you may see with `job_translations` |
| `job_translations` | signed-in | `p_job_ids` -> `job_id`, `title_i18n`, `description_i18n` for jobs the caller may view (owner, assigned Ustad, admin, or a matching approved Ustad) |
| `ai_consume`, `ai_refund`, `ai_log_call` | service role only | Used by the Edge Function: take or return a unit of the daily allowance, log a call (kind, action, ok, tokens, time; never the text) |
| `admin_ai_usage` | admin | `p_days` -> per day: `calls`, `failed`, `tokens_in`, `tokens_out`, `people` |

`_contains_contact` (used everywhere) now also catches phone numbers written in Urdu and Arabic-Indic digits. `profiles.preferred_language` (`en` or `ur`, set at registration and in Account) picks the language a reader sees.

### Inbox (signed-in)
The Inbox tab lists everything from all three flows in one place, for customers and workers, with Pending / Active / Done filters. It reads tables the caller can already see, plus one function:

| Function | Who | Input | Result |
|----------|-----|-------|--------|
| `list_my_quotes` | signed-in worker | `p_limit` (default 50, max 100) | The worker's own quotes with `job_title`, `job_category`, `job_status`, `job_expires_at`, `amount_pkr` (the price they typed), `status`, `created_at`. Direct-request quotes are left out (they show as the request) |

What each side sees: **customer** = applications they sent, and every job they created (direct requests and posted jobs, with pending quotes to accept). **Worker** = applications to their listings (accept/decline), direct requests sent to them (accept budget, quote, decline), quotes they sent on board jobs, and jobs they are assigned to. Once a job is assigned it shows once, as a job, whatever its origin. Filters: Pending = waiting for someone; Active = assigned through payment (including disputes); Done = closed, cancelled, declined or not chosen.

### Categories across Services and Nearby
Workers, Nearby and posted jobs use six **skill keys**: `electrician`, `plumber`, `carpenter`, `painter`, `ac_technician`, `welder`. Service listings hang off **service templates**, whose category is different: `electrical`, `plumbing`, `carpentry`, `painting`, `hvac`, `welding` (plus `cleaning`, which has no skill). The app maps between them in `mobile/src/lib/categoryMap.ts`, so a category picked on Nearby filters Services and the other way round. The ranking functions (`rank_listings`, `rank_listings_v2`, `rank_listings_with_boosts`, `phase5_discover_listings`) take the **template** category in `p_category`. When adding a skill, add its template category to that map and seed a template for it.

### Hisab: what workers owe Ustad (signed-in; admin functions as noted)
Payment is cash, so Ustad tracks commission per worker. When a job's payment is confirmed (`paid`), a trigger creates one `worker_commission_ledger` row: `order_amount_pkr` x `commission_pct` (the rate at that moment) = `commission_pkr`, due `commission_due_days` later (default 7). Statuses: `due`, `overdue`, `paid`, `waived`. `commission_events` keeps an append-only history.

| Function | Who | Input | Result |
|----------|-----|-------|--------|
| `get_my_commission_summary` | worker | none | `outstanding_pkr`, `overdue_pkr`, `next_due_date`, `overdue_count`, `account_deactivated`, `deactivate_after_days` |
| `list_my_commissions` | worker | `p_limit` | Own rows with job title, amounts, due date, status |
| `admin_commission_balances` | admin | `p_limit` | Per worker: `outstanding_pkr`, `not_yet_due_pkr`, `overdue_1_7_pkr`, `overdue_8_30_pkr`, `overdue_30_plus_pkr`, `oldest_due_date`, `account_deactivated` |
| `admin_list_commissions` | admin | `p_worker_id`, `p_status`, `p_limit` | Ledger rows with worker and job names |
| `admin_record_commission_settlement` | admin | `p_ledger_id`, `p_method`, `p_ref`, `p_note` | void. Row becomes `paid`; reopens the account if it was deactivated for commission and nothing else is overdue |
| `admin_waive_commission` | admin | `p_ledger_id`, `p_reason` (required) | void. Row becomes `waived` (same reactivation rule) |
| `mark_overdue_commissions` | scheduled nightly (needs `pg_cron`) | none | Marks rows overdue, warns once per row after `commission_warn_days` (default 7) past due, deactivates the account after `commission_deactivate_days` (default 14) past due |
| `admin_list_setting_audit` | admin | `p_limit` | Who changed which setting, old and new value |
| `admin_jobs_funnel` | admin | `p_days` | Per flow (`service`, `direct`, `posted`): created, assigned_or_later, work_done, closed, cancelled |
| `admin_list_posted_jobs` | admin | `p_limit` | Open posted jobs (guest flag, quote count) |
| `admin_close_posted_job` | admin | `p_job_id`, `p_reason` | void. Cancels the job and logs a `moderated` event |

**Deactivation** sets `profiles.status = 'suspended'` and `worker_profiles.commission_suspended = true`. A suspended worker disappears from Nearby, cannot use the job board, quote, or answer requests (`_is_approved_worker` now requires an active account), and their listings are hidden from direct table reads. Suspended customers cannot post jobs. Settings: `commission_rate_pct`, `commission_due_days`, `commission_warn_days`, `commission_deactivate_days`.

**Quote commission markup** (flag `quote_commission_markup_enabled`, seeded false; `docs/quote-commission-plan.md`). With the flag on, the amount a worker passes to `worker_quote_job` / `worker_quote_direct_request` is their own price X. The server stores the **customer price** `ceil(X x (1 + pct / 100))` in `quotes.amount_pkr` (so `job_quotes`, notifications and sorting show the customer price), and keeps X and the rate in the private table `quote_pricing` (`quote_id`, `worker_id`, `base_amount_pkr`, `commission_pct`), readable only by that worker and admins. `admin_job_pricing(p_job_ids)` (admin only) returns, per job, the accepted quote's `customer_price_pkr`, `ustad_price_pkr`, `commission_pkr`, `commission_pct` and `marked_up` (false, with no Ustad price, for old quotes and budget-accepted jobs); the admin Job Activity page shows it under each row. `quote_price_preview(p_amount_pkr)` (approved worker) returns `customer_price`, `commission`, `commission_pct` with the same maths, for the quote form. When the job's payment is confirmed (`worker_confirm_payment_received`) or an admin resolves a dispute as paid, `_job_commission` sets the fee: for a job whose accepted quote has a `quote_pricing` row it is `customer price - X` (capped at the amount paid) at the quote's rate; every other job uses the old rule, `commission_rate_pct` of the amount paid. Old quotes and jobs are unchanged.

Notification kinds added: `commission_created`, `commission_overdue`, `commission_warning`, `account_deactivated`, `account_reactivated` (all open the Account tab).

Suspended workers are also hidden from ranked discovery (`rank_listings`, `rank_listings_v2` and the functions that wrap them) and cannot be sent new direct requests. Known gaps: a suspended worker can still sign in (they are hidden and blocked from acting, not locked out), and paid ledger rows from before Phase 2 have no commission row.

### `worker_update_job_location` (assigned worker only)
Live tracking. The worker app sends its position during a job.

| Input | Type |
|-------|------|
| `p_job_id` | uuid |
| `p_lat`, `p_lng` | double |

Output: the `job_realtime_states` row (`job_id, worker_id, lat, lng, location_updated_at`). Fails with `worker only` if the caller is not the assigned worker. The customer's tracking screen reads this table.

### Other app functions in use
| Function | Purpose |
|----------|---------|
| `rank_listings`, `rank_listings_v2`, `rank_listings_with_boosts` | Ranked service listings |
| `phase5_discover_listings`, `phase5_effective_city_code` | City-based discovery |
| `worker_accept_listing_application`, `worker_decline_listing_application` | Worker answers a request |
| `customer_confirm_booking` | Customer confirms a booking |
| `mark_job_completed`, `mark_job_paid` | Job lifecycle |
| `worker_set_job_realtime_state` | Worker status during a job |
| `submit_job_quality_survey`, `submit_guarantee_claim_intake` | Quality and guarantee |
| `search_faqs`, `phase5_get_community_tips` | Help content |
| `subscribe_me_to_plan`, `get_my_subscription_features`, `create_web_checkout_session` | Subscriptions |
| `track_listing_promo_event`, `track_campaign_touch`, `log_rate_limit_event`, `log_ocr_failure` | Analytics and logging |
| `refresh_my_worker_signals` | Recompute worker ranking signals |

Exact parameters for these are in `supabase/migrations/`; search for `create or replace function public.<name>`.

## Admin functions (role `admin` only)

| Function | Input | Output |
|----------|-------|--------|
| `admin_list_worker_approvals` | `p_status` text (`pending`/`approved`/`rejected`, or null for all) | Rows: `user_id, display_name, phone, city, cnic_number, categories, years_experience, rate_pkr, rate_unit, working_hours, bio, photo_url, cnic_front_url, cnic_back_url, approval_status, rejection_reason, created_at` |
| `admin_set_worker_approval` | `p_user_id` uuid, `p_status` (`approved`/`rejected`/`pending`), `p_reason` text optional | void. Error `invalid status` for other values. The reason is kept only when rejected. |
| `admin_confirm_payment` | `p_payment_id` uuid, `p_worker_confirmed` boolean | Updated `payment_ledger` row |
| `admin_ai_usage` | `p_days` int (default 14) | Per day: `calls, failed, tokens_in, tokens_out, people` (Help me write calls; counts only) |
| `admin_commission_summary` | none | One row: `total_earnings, total_commission, total_paid_to_workers, total_jobs_paid` (paid payments only) |
| `admin_worker_commission_breakdown` | `p_limit` int (default 20, max 100) | `worker_id, display_name, city, total_jobs, total_commission, net_paid` |
| `admin_reports_summary` | `p_days` int (default 30) | `total_earnings, prev_total_earnings, new_customers, prev_new_customers, avg_commission_pct, active_workers` |
| `admin_monthly_earnings` | `p_months` int (default 6, max 24) | `month_start` date, `total_pkr` |
| `admin_top_workers` | `p_limit` int (default 5) | `worker_id, display_name, avg_rating, review_count, total_jobs_paid, total_earnings` |
| `get_app_setting` | `p_key` text | JSON value. Keys used: `app_branding`, `commission_rate_pct`, `quote_commission_markup_enabled`, `payment_methods` |
| `admin_set_app_setting` | `p_key` text, `p_value` json | void |

Others used for admin and ops (see the migrations for their parameters): `admin_update_payment_status`, `admin_set_user_status`, `admin_resolve_report`, `admin_set_extraction_status`, `admin_set_template_active`, `admin_upsert_city`, `admin_set_city_rollout_config`, `admin_set_city_service_availability`, `admin_backfill_worker_signals`.

Example:
```ts
const { data, error } = await supabase.rpc('admin_list_worker_approvals', { p_status: 'pending' });
await supabase.rpc('admin_set_worker_approval', { p_user_id: id, p_status: 'rejected', p_reason: 'CNIC photo unclear' });
```

## Main tables (via PostgREST)
`profiles`, `worker_profiles`, `worker_service_listings`, `listing_media`, `ai_usage`, `ai_calls`, `service_templates`, `listing_applications` (no longer used by the app), `jobs`, `quotes`, `messages`, `reviews`, `payment_ledger`, `job_contacts`, `admin_job_events`, `notifications`, `device_tokens`, `quote_events`, `quote_pricing`, `job_thread_messages`, `worker_commission_ledger`, `commission_events`, `app_setting_audit`, `job_realtime_states`, `job_completion_photos`, `job_quality_surveys`, `faqs`, `ocr_extractions`, `abuse_reports`, `cities`, `city_rollout_configs`, `city_service_availability`, `app_settings`, `app_events`. Access to each is decided by the RLS policies in the migrations.

## Storage buckets
| Bucket | Content | Access |
|--------|---------|--------|
| `worker-documents` | CNIC front/back | Private. Admin views them through a signed URL (5 min) |
| `worker-photos` | Worker profile photos | See the migrations for the policy |
| `quote-voice` | Voice notes on quotes and in the thread (private) | Upload into your own folder for a job you take part in; read only by the Ustad, the job's owner and admins |
| `listing-media` | Photos of a service listing (public, like the listing) | Owner uploads into their own `{worker_id}/{listing_id}/` folder; anyone can read a file's public URL |
| `job-media` | Photos on job posts (private) | Owner uploads into their own job folder; reads only through registered files for the owner, admins and matching workers |

## External services
- **Google Cloud Vision** (OCR): see `implementation/google-cloud-vision-key-restriction.md`.
- **Maps**: `react-native-maps` on the device; location via `expo-location`.
