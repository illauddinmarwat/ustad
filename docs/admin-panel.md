# Admin Panel Guide

Location: `web-admin/` (Next.js 14, Tailwind, Recharts). It talks directly to Supabase; there is no separate admin server.

## Access and login
1. Open `/login` and sign in with email and password (Supabase Auth).
2. After sign-in, the app reads `profiles.role` for that user (`useAdminAuth.ts`). Only `role = 'admin'` gets in.
3. Every admin database function also checks that the caller is an admin and raises `admin only` otherwise. Hiding pages is not the only protection.

To make someone an admin, set `role = 'admin'` on their row in `profiles`.

## Pages (sidebar)

| Page | Path | What the admin does |
|------|------|---------------------|
| Approvals | `/approvals` | Review new workers. Filter by pending / approved / rejected. Open CNIC front/back photos (signed links valid 5 minutes). **Approve**, **Reject** (with a reason) or reset to pending. |
| Payments | `/payments` | See the latest 100 payments, who paid whom, and the status. Confirm a payment on the worker's behalf (manual reconciliation). |
| Commissions | `/commissions` | Totals: earnings, Ustad commission, paid to workers, jobs paid. Table of the top 20 workers by commission. |
| Reports | `/reports` | Last 30 days vs the 30 before: earnings, new customers, average commission %, active workers. 6-month earnings chart. Top 5 workers. |
| Job Activity | `/jobs` | Last-30-days funnel by flow (service / direct request / posted job: created, accepted, work done, closed, cancelled). Feed of accepted jobs, cash payments, disputes and admin closures. **Resolve a dispute** after the helpline call. |
| Hisab (dues) | `/hisab` | What each worker owes Ustad from cash jobs, with aging (not yet due, 1-7, 8-30, 30+ days late) and a Deactivated badge. Open a worker to see each job's commission; **Record payment** (method + reference) or **Waive** (reason required); **Export CSV**. |
| Posted jobs | `/moderation` | Open jobs from customers and guests. **Close** a job that is spam or breaks the rules (reason required, recorded in the feed). |
| Settings | `/settings` | Branding, commission rate (default 15%), payment methods, and **Operations and Hisab**: commission due days, warning days, deactivation days, direct-request timeout, payment receipt window, helpline number. Every change is audited (see *Recent setting changes*). |

## Typical workflows
- **Onboard a worker**: the worker registers in the app and uploads a CNIC, then appears under Approvals as *pending*. The admin checks the photos and details, then approves. Approved workers show up in nearby search. Rejected workers get the reason.
- **Reconcile a payment**: go to Payments, find the row, confirm it.
- **Change commission**: go to Settings and set the rate. It applies to jobs that close after the change; each job keeps the rate it closed with.
- **Collect what a worker owes**: cash jobs create a commission row when the worker confirms payment. Open Hisab, pick the worker, and record the payment when they pay you (or waive it with a reason). Recording or waiving the last overdue row automatically reopens an account that was deactivated for commission.
- **Overdue workers**: a nightly job marks rows overdue after their due date, warns the worker, and deactivates the account after the deactivation days set in Settings. The worker sees what they owe in their Account tab.
- **Resolve a payment dispute**: call both sides, then open Job Activity and resolve it as *payment was made* or *refunded*.
- **Remove a bad posted job**: Posted jobs, Close job, give a reason. To stop an abusive customer, suspend them in the mobile Admin tab; a suspended customer cannot post.

## Where the data lives
| Admin feature | Source |
|---------------|--------|
| Payments | table `payment_ledger` |
| Worker approvals | `worker_profiles` (`approval_status`, `rejection_reason`) |
| CNIC images | private storage bucket `worker-documents` |
| Settings | `app_settings` via `get_app_setting` / `admin_set_app_setting`; changes logged in `app_setting_audit` |
| Hisab | tables `worker_commission_ledger` (one row per closed job) and `commission_events` (append-only history) |
| Job Activity | `admin_job_events`, `admin_jobs_funnel` |
| Posted jobs | `admin_list_posted_jobs`, `admin_close_posted_job` |

Function details: [api-reference.md](api-reference.md).
