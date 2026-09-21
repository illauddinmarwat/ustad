# Ustad: what the app can do

A plain-language overview of the features, who uses them, the money and privacy rules, and where they are switched on. For function-level detail see [api-reference.md](api-reference.md); for how each piece was planned and tested see [dual-flow-plan.md](dual-flow-plan.md).

## Three ways to get work done

| Flow | Customer | Worker |
|------|----------|--------|
| **Services** | Browses priced service listings (filter by category), applies to one | Accepts or declines the application |
| **Direct request** | Finds a worker in **Nearby**, sends a request with an optional budget | Accepts the budget, sends a different price, or declines. If they do not answer in about 2 hours, the request opens up to other workers |
| **Posted job** | Posts a job (**no account needed**), compares quotes, asks questions, signs in to accept one | Browses the **Job board**, asks questions, sends free quotes |

All three then follow the same steps: the worker is assigned, contact details are shared, the work is done, the customer pays **cash**, the worker confirms, and the job closes.

## Everything a job goes through

`open` -> `quoted` -> **`assigned`** -> `completed` -> `payment_pending` -> **`closed`** (or `disputed`, which an admin resolves after a helpline call). Reviews, quality surveys, guarantee claims and completion photos work at any finished stage.

## Customers and guests
- Post a job without an account. The guest gets a private link on their device; to accept a quote they sign in or register and the job (with its quotes and questions) moves to their account.
- Send a request to one worker from Nearby; see distance, rating, verified badge and whether the worker is available.
- **Phone numbers and addresses stay hidden** until a worker accepts. Job text and messages that contain phone numbers or links are refused.
- After acceptance the customer shares their phone and address; the worker's phone is shown to the customer.
- Pay in cash, mark the job paid, and rate the worker.

## Workers
- Registration with national ID and admin approval; only **approved, active** workers appear in Nearby, on the job board, and can quote.
- Answer direct requests, publish service listings, and switch **available / busy**.
- **Inbox tab**: one list of applications, requests, quotes and jobs, with Pending / Active / Done filters.
- **What you owe Ustad** (Account tab): commission on each closed cash job, its due date, and history.

## Money rules
- Payment is **cash to the worker**. The customer marks it paid, the worker confirms the amount received. A different amount, or no confirmation within 3 days, makes the job `disputed`.
- Ustad's commission is **15% of the confirmed amount** (editable). It is owed per closed job, **due 7 days later**.
- Overdue: a warning 7 days after the due date, **account deactivated 14 days after** unless settled. A deactivated worker is hidden from Nearby, the job board and listings, and cannot quote or answer requests. Settling or waiving the last overdue row reopens the account. All these numbers are settings.

## Notifications
In-app bell with an unread badge, plus Expo push where set up. Text follows each person's language (Urdu or English). Events covered: new request, quote, accepted, declined, cancelled, details shared, work done, payment marked, closed, dispute, application updates, messages, and commission due, overdue, warning, deactivated and reactivated.

## Admin panel (web)
Approvals, Payments, Commissions, Reports, and new: **Job Activity** (feed, 30-day funnel by flow, dispute resolution), **Hisab (dues)** (balances with aging, record a payment or waive with a reason, CSV export), **Posted jobs** (close bad jobs with a reason), and **Settings** (commission rate, due/warning/deactivation days, request timeout, payment window, helpline number, with a change log).

## Privacy and safety
- `profiles.phone`/`address` and `worker_profiles` national ID number and exact location cannot be read by other signed-in users or guests. Only the dedicated functions can.
- Guests can only reach their own job through a secret token; every other guest job is invisible to them.
- Rate limits: direct requests and posted jobs per day per customer, and an hourly cap on guest posts.
- Suspended customers cannot post; suspended workers are hidden and blocked.

## Switching it on

Both new flows ship **off**. In the Supabase SQL editor:
```sql
update app_settings set value = 'true' where key = 'direct_requests_enabled';  -- send a request from Nearby
update app_settings set value = 'true' where key = 'job_posting_enabled';      -- post a job, job board, quotes
```
Numbers you can change (rows in `app_settings`): `commission_rate_pct`, `commission_due_days`, `commission_warn_days`, `commission_deactivate_days`, `direct_request_timeout_hours`, `direct_request_daily_limit`, `job_post_daily_limit`, `guest_job_hourly_cap`, `job_expiry_days`, `payment_confirm_days`, `helpline_number` (text). Most are also on the admin Settings page.

Some features need Supabase extensions: **`pg_cron`** for the timed jobs (request timeout, job expiry, unconfirmed payments, overdue commission) and **`pg_net`** for push. See [how-to-run.md](how-to-run.md).

## Where things are hosted
- **Database:** Supabase, changed only through `supabase/migrations/`, deployed automatically when you push to `master`.
- **Admin panel:** static files at https://frontend.koderkids.pk, rebuilt and uploaded by GitHub Actions on every push that changes `web-admin/` (see [how-to-build.md](how-to-build.md)).
- **Mobile app:** built as an installable APK with `eas build --platform android --profile apk`.

## Not built yet
Phone OTP and SMS for guests (a guest signs in to accept a quote instead), photos on posted jobs, distance filtering on the job board (jobs have a city, not coordinates), an in-app way to pay commission (the admin records payments), and Play Store publishing (AAB).
