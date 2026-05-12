# Warehouse export (`app_events`)

## Views (Postgres)

- `public.v_analytics_app_events` — all columns needed for export (`id`, `user_id`, `event_name`, `event_props`, `created_at`). Row access still follows RLS on `app_events` (admin-only reads today).
- `public.v_analytics_ranking_events` — ranking funnel subset plus `cohort` extracted from `event_props`.

Use these in the Supabase SQL editor, `pg_dump`, or a nightly **logical replication** / **ETL** job into BigQuery, Snowflake, or Athena.

## BigQuery (sketch)

1. Create a BigQuery dataset and table matching the view columns (JSON for `event_props`).
2. Schedule a job (Cloud Scheduler + Cloud Run, or Fivetran/Airbyte) that:
   - runs `select * from v_analytics_app_events where created_at > :cursor`,
   - streams rows into BigQuery,
   - stores the max `created_at` as a watermark.

## Hosted Supabase

If you use Supabase’s **Log Drains** or **Database Webhooks**, point them at the same shape as `v_analytics_app_events` so ranking cohort analysis in `ranking-ab-analysis.sql` can run unchanged in the warehouse.
