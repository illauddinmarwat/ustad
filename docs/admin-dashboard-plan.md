# Admin Dashboard Plan (Option C + D combined)

Goal: one landing page for the admin panel that answers, in order:
1. **What needs me right now?** (action queues)
2. **How is the business doing?** (KPIs, trends)
3. **Where are my Ustads?** (map)
4. **What just happened?** (recent activity)

It becomes `/dashboard`, the first sidebar item, and the page `/` redirects to (today `/` goes to `/payments`).

## Layout (top to bottom)

### 1. Header strip
- Title "Dashboard / ڈیش بورڈ", greeting with admin name, "Last updated hh:mm" + Refresh button.
- Period switch: **7 days / 30 days / 90 days** (default 30). Applies to sections 3 and 4 only; queues are always "now".

### 2. Action Centre (always live, click-through tiles)
| Tile | Source | Links to |
|---|---|---|
| Ustads awaiting approval | `admin_list_worker_approvals('pending')` count | /approvals |
| New areas to be added | pending workers where `area_is_new` | /approvals |
| Payments to confirm | `payment_ledger` status pending | /payments |
| Open job disputes | jobs with status `disputed` | /jobs |
| Overdue commission dues | `admin_commission_balances` (sum overdue) | /hisab |
| Posted jobs to review | `admin_list_posted_jobs` open | /moderation |

Each tile: big number, one-line label, red/amber accent when > 0, grey "All clear" when 0. Below the tiles, an inline list of the **5 oldest pending registrations** (name, city, skill, submitted date, Review button that deep-links to the approval).

### 3. Business overview
- **KPI cards (period vs previous period, % change):** total earnings, commission earned, jobs completed, new customers, new Ustads, average rating.
- **Totals card:** Ustads (approved / pending / rejected), customers, active listings.
- **Earnings chart:** 6-month bar (existing `admin_monthly_earnings`).
- **Jobs funnel:** created → assigned → work done → closed, split by flow (service / direct / posted). Existing `admin_jobs_funnel`.
- **Top 5 Ustads** (existing `admin_top_workers`).
- **By city** and **by skill category:** horizontal bars (Ustads and jobs).

### 4. Ustad map
- Interactive OpenStreetMap (Leaflet) with a pin for each approved Ustad that has a saved location (`lat`/`lng` from registration).
- Colour by skill category (legend doubles as a filter); city filter dropdown; click a pin for name, skill, rating, phone, "Open profile" link to /approvals.
- Cluster pins when zoomed out; counter "N Ustads on map, M without a location".
- Loaded lazily (Leaflet from npm, client-only) so the dashboard is fast when the map is not scrolled to.

### 5. Recent activity (two columns)
- **Latest registrations:** last 8, with status pill.
- **Latest job events:** last 8 from `admin_list_job_events` (accepted, payment pending, closed, disputed).

### 6. Health / alerts strip (small, bottom)
- Ustads with overdue dues > 30 days, deactivated accounts count, workers approved but with no location or no photo (data-quality nudge).

## Data and database work

Existing functions cover: pending approvals list, payments, job events, funnel, commission balances, posted jobs, reports summary, monthly earnings, top workers.

New read-only migration `2026093012xxxx_admin_dashboard.sql` (admin-only, security definer, no writes):
1. `admin_dashboard_counts()` returns one row: pending_workers, approved_workers, rejected_workers, customers, pending_payments, open_disputes, overdue_dues_pkr, open_posted_jobs, new_areas_pending, approved_without_location. One round trip for the whole Action Centre + totals.
2. `admin_worker_map()` returns approved workers with lat/lng: user_id, display_name, city, area, categories, avg_rating, phone. Lat/lng are otherwise hidden from normal users by column privileges, so this must be a security-definer admin function.
3. `admin_kpis(p_days)` returns current and previous period figures for the KPI cards (earnings, commission, jobs completed, new customers, new Ustads, avg rating).
4. `admin_breakdown_by_city_and_category()` returns counts of approved Ustads and jobs per city and per category.

All four get `_is_admin()` checks and `grant execute ... to authenticated`, following the existing pattern. A pgTAP test for each (admin ok, non-admin rejected).

## Front-end work (`web-admin`)
- New `src/app/(dashboard)/dashboard/page.tsx` plus small components: `ActionTile`, `KpiCard`, `BarList`, `WorkerMap` (client-only Leaflet), `ActivityList`.
- Reuse `StatCard`, `recharts`, Tailwind tokens, `formatPkr`.
- `src/app/page.tsx` redirect changes to `/dashboard`; add Dashboard as first item in `Sidebar.tsx` (icon 🏠).
- New dependency: `leaflet` (+ `@types/leaflet`), CSS imported client-side.
- Loading skeletons per section, per-section error message (one failing query must not blank the page), empty states, responsive grid (tiles wrap to 2 columns on tablet, 1 on phone).
- No auto-refresh loops; manual Refresh plus refresh on tab focus.
- Bilingual small labels (English main, Urdu subtitle) to match the rest of the panel.

## Build order (each step shippable)
1. Migration + tests (counts, kpis, breakdown, map) and types.
2. Dashboard page shell, Action Centre, pending-registrations list, redirect + sidebar.
3. KPI cards, earnings chart, funnel, top Ustads, city/category bars.
4. Ustad map with filters.
5. Recent activity, health strip, polish (skeletons, empty states, mobile width).
6. Verify in browser against real data, rebuild `admin-build.zip`.

## Decisions to confirm
1. Default period 30 days (matches Reports)? Yes/No.
2. Map: colour by category with city filter, as above? Show phone numbers on pins (admin only)? Yes/No.
3. Should `/` open the Dashboard instead of Payments? (Recommended: yes.)
4. Keep the Reports page as is (dashboard shows highlights, Reports keeps the CSV export)? (Recommended: yes.)

## Risks / notes
- Map depends on workers having a pinned location. Ustads registered before the pin feature have none; they show in the "without a location" counter.
- Migration is deployed by GitHub Actions on push to master; the admin front-end must be uploaded by hand until the FTP secrets are fixed.
- KPI "new customers" and "new Ustads" rely on `profiles.created_at`; "average rating" on `worker_profiles.avg_rating`.
