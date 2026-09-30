# Quote commission plan: commission added on top of the Ustad's price

**Status: planned, nothing built.** Estimate: 3–4 working days. Builds on `docs/job-quotes-plan.md` (price type and comparison cards) and the Hisab ledger (`20260921160000_phase18_hisab.sql`).

## The problem

An Ustad quotes a price without knowing the platform takes 15%. If they quote Rs 100 and the customer pays Rs 100, they end up with Rs 85 and are surprised later.

## The rule (the only maths)

```
customer price = X + X × commission %        (X = what the Ustad typed)
commission     = customer price − X
```

Example at 15%: the Ustad types **100**, the customer sees **115**, the commission owed is **15**.

- Rounding: the customer price is rounded **up to a whole rupee**; the commission is simply the difference. (Rs 333 → 382.95 → 383, commission Rs 50.)
- The Ustad sees a preview while typing: "Customer will see Rs 115. You keep Rs 100. Platform fee Rs 15."
- **The customer sees one price only.** No fee line, no percentage, no base price.
- The Ustad collects the full Rs 115 in cash and owes Rs 15 through the Hisab ledger (due days, overdue, deactivation unchanged).

## Decisions

| # | Decision |
|---|---|
| C1 | Commission is **added on top**: it is 15% of X, not 15% of the customer price. |
| C2 | Rounding up to a whole rupee (above). |
| C3 | The percent is **snapshotted** on the quote when it is sent. A later admin change never moves a price the customer has seen. |
| C4 | **Applies to both flows:** quotes on posted jobs and quotes on direct requests. Both use the same function, so the maths lives in one place. |
| C5 (confirmed) | Direct requests **no longer take a customer budget** (same as posted jobs, media plan M6). The customer describes the job; the Ustad names X; the customer sees X + 15%. This removes the awkward "Ustad accepts the customer's budget as-is" case, where the app would have to work backwards from the customer's number. If we keep a budget later, it would be a hint shown to the Ustad only. |
| C6 | Existing quotes and jobs are left as they are (no markup, old commission rule) so nothing already agreed changes. |

## Design

### Database (one migration)

- One helper, `_apply_commission(x numeric, pct numeric)`: returns `ceil(x * (1 + pct / 100))`. Both quote functions and the preview call it.
- `quotes` gains `base_amount_pkr` (X) and `commission_pct` (snapshot). `amount_pkr` **stays the customer price**, so `job_quotes`, sorting, the inbox, direct-request rows and every existing reader show the right number with no change. Backfill: `base_amount_pkr = amount_pkr`, `commission_pct = 0`.
- `worker_quote_job` and `worker_quote_direct_request`: the amount parameter is now X. Each reads the current `commission_rate_pct`, stores X, the percent and the customer price, and returns both numbers.
- `worker_accept_direct_request` (accept the customer's budget as-is) is retired with C5; the button goes away in the app.
- `quote_price_preview(x)` returns `{customer_price, commission}` for the worker form, using the same helper.
- Customer and guest RPCs (`job_quotes`, direct-request views) return only `amount_pkr`. They must not return `base_amount_pkr` or `commission_pct`. The worker reads the breakdown only for their own quote (RLS).
- `customer_accept_quote` and `customer_accept_direct_quote`: copy price, X and percent onto the job (`agreed_price_pkr`, `worker_base_price_pkr`, `commission_pct`).
- **Payment and ledger** (`worker_confirm_payment_received`, `_create_commission_row`): when the job has X, `fee_pkr = agreed price − X` and the percent is the snapshot. Jobs without X use today's rule (15% of the amount). The payment amount is pre-filled with the agreed price; the existing received-amount match rule is unchanged.
- **Estimates** (quotes plan Phase 2): the final price the Ustad proposes is also an X, with the job's snapshotted percent applied. The customer confirms the customer price.
- Admin Commissions, Hisab and CSV show X, customer price and commission per job (admins may see the breakdown).
- Flag `quote_commission_markup_enabled` (seeded false); while off, both quote functions behave as today so old app builds keep working.

### Mobile

- **Worker forms (job board quote and direct request quote):** label "Your price (what you earn)". Under the field a live preview: "Customer will see **Rs 115** · Platform fee Rs 15 · You keep **Rs 100**". Also states when the fee is due (uses the due-days setting).
- **Worker's own quote row:** shows both numbers ("You quoted Rs 100, customer sees Rs 115").
- **Direct request screen (customer):** budget field removed; the request is text/media only.
- **Customer screens (quote cards, direct request quote, guest page, payment):** show only the customer price.
- Urdu and English strings for the new labels.

## Phases

### Phase 1: database (1.5 days) — DONE, not pushed
Built in `supabase/migrations/20260930190000_quote_commission_markup.sql`, tested by `supabase/tests/database/phase20_quote_commission_seeded.test.sql` (39 assertions pass; phase 12–16 and 18 tests still pass locally). Deviations from the design below, all to keep the breakdown away from customers:
- X and the percent are kept in a **private table `quote_pricing`** (readable only by the quoting worker and admins), not as columns on `quotes`, because a customer can select their job's quote rows. No backfill is needed: a quote with no pricing row is an old quote.
- The job does not copy the price. At close, `_job_commission` reads the accepted quote's pricing row; both `worker_confirm_payment_received` and `admin_resolve_job_dispute` use it. The accept functions are unchanged.
- The flag `quote_commission_markup_enabled` is seeded **false**. With it on, `create_direct_request` ignores a budget and `worker_accept_direct_request` is closed. The `p_budget_pkr` parameter stays until the mobile app stops sending it.
- Worker preview RPC: `quote_price_preview(amount)` returns customer price, commission and percent.

Original checklist:
- [x] Migration: columns and backfill, `_apply_commission`, both quote functions, preview RPC, job columns, both accept functions, ledger rule, remove budget from direct requests, flag.
- [ ] pgTAP: 100 at 15% gives 115 and commission 15; rounding case; percent snapshotted (admin change after quoting does not move the price); same result through the posted-job and direct-request paths; customer/guest RPCs never expose X or percent; another worker cannot read the breakdown; ledger fee equals `agreed − X`; old jobs keep the old rule; flag off = old behaviour.

### Phase 2: mobile (1.5 days) — DONE, not pushed
Built: `QuotePricePreview` (live card under the price field on the job-board quote form and the direct-request quote row), `lib/quotePricing.ts`, budget field removed from the request form and "Accept budget" hidden when the flag is on (the client reads `quote_commission_markup_enabled` through `fetchDirectRequestFlags`), new strings in English and Urdu. Added migration `20260930210000_worker_own_quote_price.sql`: `list_open_jobs`, `get_board_job` (new column `my_customer_price_pkr`) and `list_my_quotes` show the worker their own price, so the form is prefilled with what they typed and re-sending cannot compound the markup. Tests: 4 more pgTAP assertions (43 total in phase20), Jest for the helpers, the preview, the request row and the request form; full suite 267/267 and typecheck clean.

Original checklist:
- [ ] Worker preview card on both quote forms; remove the direct-request budget field and "accept budget" button; customer screens show the single price.
- [ ] Jest: preview matches the server maths, customer screens never render X or the word commission, Urdu strings present.

### Phase 3: estimates and admin (1 day) — admin and docs DONE, estimates waiting
Done: Settings page toggle for `quote_commission_markup_enabled` with a plain explanation and a live example; Hisab rows now read "Customer paid, Ustad keeps, commission (rate)" instead of the old "order x %" formula (which is wrong for marked-up jobs); Hisab CSV gains a "Ustad keeps" column and "Customer paid" heading; the Reports average-commission card says it is of the amount customers paid; `docs/features.md` and `docs/api-reference.md` updated. No database change was needed: the customer price and the commission are already on the ledger, so the Ustad's own price is their difference. Not done: the final-price flow for estimates, which needs the quotes plan's Phase 2 first.

Original checklist:
- [ ] Final-price flow uses the snapshotted percent (after quotes-plan Phase 2 lands).
- [ ] Admin views and CSV show the breakdown; update `docs/features.md` and `docs/api-reference.md`.

## Acceptance checks
- Ustad enters 100, customer sees exactly 115 and nothing else about fees, in both flows.
- After the job closes, the Ustad's Hisab shows Rs 15 owed (not Rs 17.25).
- Changing the commission setting does not change any quote already sent or job already accepted.
- No customer-facing response contains X or the commission percent.
- Old jobs behave exactly as before.
- Every screen works in Urdu.

## Risks and open items
- **Customer sees a higher price than off-app** (the business model). Mitigation: rating, jobs done and distance shown next to price.
- **Leak via ledger:** the customer must never read `worker_commission_ledger` or `payment_ledger.fee_pkr`; add a pgTAP check.
- **Haggling:** keeping X hidden stops customers negotiating down to skip the platform.
- C5 confirmed: the budget is removed from direct requests. The `budget_pkr` column stays (nullable) for old rows, as with posted jobs.
