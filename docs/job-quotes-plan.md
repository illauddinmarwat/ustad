# Job quotes plan: quotes without a customer budget

**Status: planned, nothing built.** Estimate: 6–8 working days over three phases. Depends on `docs/job-media-plan.md` (Phase 1 and Phase 2 there: storage bucket, audio recorder).

## Flow

1. Customer posts a job: text, photos, voice note, video. **No budget** (media plan M6).
2. Every approved, active worker in the job's category sees the job and its media (media plan M2).
3. Each worker sends a **quote**: price, price type, availability, optional note and optional voice note.
4. The customer compares quotes, asks questions in the thread (text or voice), and accepts one. The other quotes are rejected. Contact reveal, payment and commission rules are unchanged.

## Decisions (agreed)

| # | Decision |
|---|---|
| Q1 | A quote has a **price type**: `fixed` or `estimate` (final price confirmed after the worker inspects). |
| Q2 | **Voice notes** are allowed on quotes and in the pre-assignment thread. |
| Q3 | The customer compares quotes on price, rating, jobs done, distance and earliest availability, and can sort by price, rating or nearest. |
| Q4 | A **"typical price" hint** shows for the job category, built from closed jobs. |
| Q5 | Existing rules stay: no phone numbers or links in text; quotes are unlimited but tracked (D11); a worker's newer quote replaces their previous pending one. |

## Current state (what we build on)

- `public.quotes` (job_id, worker_id, amount_pkr, message, status pending/accepted/rejected), `quote_events` (history), `job_thread_messages` (text only, 1000 chars), RPCs `worker_quote_job`, `job_quotes`, `customer_accept_quote`, `post_thread_message`.
- `worker_quote_job(job, amount, message)` already rejects the worker's earlier pending quote, checks category, ownership and job openness. We extend it rather than replace it.

## Design

### Database
- `quotes` gains: `price_type text not null default 'fixed' check in ('fixed','estimate')`, `available_from timestamptz` (when the worker can start; required), `visit_first boolean` is folded into `price_type = 'estimate'` (no separate column), `audio_path text` (voice note), `audio_seconds int`.
- `quote_events` gains `price_type` so the tracked history is complete.
- `worker_quote_job` takes `p_price_type`, `p_available_from`, `p_audio_path`, `p_audio_seconds`. Checks: `available_from` is not in the past and within 30 days; audio is at most 30 s and lives in the worker's own folder; text-only rules unchanged. The old signature is dropped so there is one function.
- `job_thread_messages` gains `audio_path`, `audio_seconds`; `body` becomes nullable with a check that a message has text or audio. Both directions (worker and customer) may send audio.
- Storage: reuse the private `job-media` bucket with a `quotes/{worker_id}/{job_id}/` and `threads/{...}` prefix. Read access only to the two parties of that quote or thread, and admins, through signed URLs from an RPC (same pattern as job media).
- **Estimate handling:** add `jobs.final_price_pkr` and RPC `worker_set_final_price(job_id, amount)`, allowed once, only on an assigned job whose accepted quote was `estimate`. The customer must confirm (`customer_confirm_final_price`). Until confirmed, the payment/receipt mismatch rule from the dual-flow plan flags the job, so an unconfirmed jump in price is visible to the helpline and admin. A fixed quote cannot change.
- **Typical price:** view `category_price_stats` (category, city where there is enough data: median and 25th–75th percentile of the amount on closed jobs in the last 90 days). Only shown when there are at least 10 closed jobs in that category, otherwise hidden. Exposed by RPC `typical_price(category, city)`; no individual job is identifiable.
- **Comparison data:** extend `job_quotes` to return worker rating, review count, completed job count, distance from the job (when both have coordinates), price type, availability, and whether a voice note exists.
- Flag `quote_upgrades_enabled` (seeded false); the old quote form keeps working until enabled.
- Admin: quote list on the job detail page with price type and voice note; Remove voice note; audit entry.

### Mobile
- **Worker (BoardJobScreen):** media viewer, "typical price" hint (a range, labelled as a guide), then the quote form: price, price type toggle (Fixed price / Estimate, final after inspection), availability picker (today, tomorrow, pick a date), optional note, optional voice note (record, replay, re-record, 30 s). Estimates show a clear line: "Final price must be confirmed by the customer."
- **Customer (PostedJobScreen):** quote cards with worker photo, rating, jobs done, distance, price, price type badge, availability, play button for the voice note, and Accept / Ask a question. A sort control (lowest price, best rated, nearest, soonest). The typical-price hint sits at the top of the list.
- **Thread:** voice-note button beside the text field, reusing the `AudioRecorder` from the media plan (with pause and resume).
- **After accepting an estimate:** the worker gets a "Set final price" action; the customer gets a confirm/dispute prompt.
- Notifications: new quote, new voice message, final price proposed and confirmed (extend `_notify_quote`).
- Urdu and English strings for all new labels and errors.

## Phases

### Phase 1: richer quotes and comparison (2.5 days)
- [ ] Migration: `price_type`, `available_from`, extend `worker_quote_job`, extend `job_quotes` with comparison data, flag.
- [ ] Worker quote form (price type, availability); customer comparison cards and sorting.
- [ ] pgTAP: price type and availability validation, replace-pending behaviour, comparison data correct and visible only to the job owner, old signature gone. Jest for the form and sorting.

### Phase 2: estimates and final price (2 days)
- [ ] `jobs.final_price_pkr`, `worker_set_final_price`, `customer_confirm_final_price`; integrate with the receipt mismatch rule and the admin dispute feed.
- [ ] UI on both sides; notifications.
- [ ] pgTAP: only for accepted estimate quotes, once, customer confirm, fixed quotes locked, unconfirmed price flagged. Jest for the UI states.

### Phase 3: voice notes and typical price (2–3 days; needs the media plan's audio recorder and its APK)
- [ ] Voice notes on quotes and threads: columns, storage policies, playback, admin removal.
- [ ] `category_price_stats` and `typical_price`; the hint on both screens, hidden below the data threshold.
- [ ] pgTAP: audio access only for the two parties and admins; thresholds for the price hint. Device check.

## Acceptance checks
- A worker outside the category cannot quote or hear another worker's voice note.
- A customer sees only quotes on their own job; a worker never sees other workers' quotes.
- An estimate quote cannot become a final price without customer confirmation; a fixed quote cannot change.
- The typical-price hint never shows for a category with fewer than 10 closed jobs and never reveals a single job.
- Old app builds keep working while `quote_upgrades_enabled` is off.
- Every screen works in Urdu.

## Risks and open items
- **Race to the bottom** with no budget: mitigated by showing rating, jobs done and the typical-price range next to each quote. Monitor after launch.
- **Estimate abuse:** a low estimate followed by a high final price. The customer confirmation, the mismatch flag and admin visibility cover this; consider counting disputed final prices against a worker's standing.
- **Sparse data at launch:** the typical-price hint will be hidden for most categories at first. Optionally seed it from an admin-editable range per category.
- **Old quotes:** existing rows default to `fixed` and have no availability; the UI shows "not given" for them.
- To decide: quote validity (keep tied to the 7-day job expiry, or a separate 48 h quote expiry?); a cap on active quotes per worker; whether the customer can invite specific workers to quote.
