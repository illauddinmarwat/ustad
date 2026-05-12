# Nightly ranking signal backfill (pg_cron)

The migration `20260507210000_phase3_cron_analytics_ml.sql` defines:

- `public.cron_backfill_worker_signals()` — recomputes `response_rate`, `completion_rate`, and `last_active_at` for every worker who appears in `quotes` or `jobs`. Intended to run as a **database job** (no `auth.uid()`).

Execute privileges are **revoked** from `anon`, `authenticated`, and `service_role`; only the `postgres` role can run it (not callable through the Supabase anon/authenticated API).

## Enable on hosted Supabase

1. Dashboard → **Database** → **Extensions** → enable **pg_cron**.
2. SQL Editor → run (adjust schedule if needed; `30 2 * * *` = 02:30 UTC daily):

```sql
select cron.schedule(
  'phase3-worker-signals-nightly',
  '30 2 * * *',
  $$select public.cron_backfill_worker_signals()$$
);
```

3. To remove the job later:

```sql
select cron.unschedule('phase3-worker-signals-nightly');
```

## Local development

Local `supabase start` stacks may not load pg_cron. Use the **Admin Ops** screen button **Run backfill now** (`admin_backfill_worker_signals`) or call `refresh_my_worker_signals` from the app after worker actions.

## Verification

```sql
select * from cron.job where jobname = 'phase3-worker-signals-nightly';
```
