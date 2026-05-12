# Phase 2 weekly KPI template

Use this template for the beta review meeting.

## Core volume

- Jobs posted (Rail A)
- Listing applications (Rail B)
- Assignments created
- Completions

## Conversion funnel

- Rail A: post -> quote -> assigned -> completed
- Rail B: apply -> accepted -> confirmed -> assigned -> completed

## Speed

- Median time to first quote (Rail A)
- Median time to worker decision on application (Rail B)
- Median time to customer confirm after worker accept

## Quality

- Review rate after completion
- Avg rating
- Open abuse reports
- Suspended users this week

## Payments pilot

- Count of `payment_ledger` rows
- Paid amount total
- Disputed/refunded counts

## SQL starter snippets

```sql
-- event counts by day
select date_trunc('day', created_at) as day, event_name, count(*)
from public.app_events
where created_at >= now() - interval '7 days'
group by 1, 2
order by 1 desc, 2;
```

```sql
-- payment summary (7d)
select
  status,
  count(*) as tx_count,
  coalesce(sum(amount_pkr), 0) as total_amount
from public.payment_ledger
where created_at >= now() - interval '7 days'
group by status
order by status;
```
