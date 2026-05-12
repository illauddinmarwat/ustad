# Phase 4 KPI template (closeout)

Use this sheet after turning on Phase 4 flags in a controlled rollout window.

## Window

- Start:
- End:
- Cohort / city:
- Flags enabled:
  - `phase4_realtime_enabled`
  - `phase4_subscriptions_enabled`
  - `phase4_boosts_enabled`
  - `phase4_quality_enabled`
  - `phase4_web_enabled`

## KPI query helpers

- DB helper (internal): `public.phase4_kpi_snapshot(interval '7 days')`
- Event view: `public.v_analytics_phase4_events`

## Target thresholds (starter)

- Boost funnel CTR (`promo_clicks / promo_impressions`) >= **1.00%**
- Micro-surveys submitted >= **5** per 7 days
- Web checkout sessions created >= **1** per 7 days
- Open claim backlog (`open` + `reviewing`) <= **20**

## Results

- Boost funnel CTR:
- Micro-survey volume:
- Web checkout signal:
- Open claim backlog:
- Notes:

## Hypothetical example (for learning only)

Use this as a reference format. These numbers are fake.

- Window: 7 days
- Boost impressions: 1,200
- Boost clicks: 24
- Boost funnel CTR: 2.00% (`24 / 1200`)
- Micro-surveys submitted: 11
- Web checkout sessions created: 6
- Open claim backlog: 7
- Notes: "Quality flows adopted in pilot city; no unusual claims spike."

Interpretation against starter targets:

- CTR >= 1.00% -> Pass
- Micro-surveys >= 5 -> Pass
- Web checkout sessions >= 1 -> Pass
- Open claim backlog <= 20 -> Pass

Example decision line:

- Go / No-go: **Go (pilot expansion)** with weekly monitoring
- Required follow-ups: add claim triage SLA dashboard, review checkout drop-off
- Owner: Product + Ops
- Date: YYYY-MM-DD

## Decision

- Go / No-go:
- Required follow-ups:
- Owner:
- Date:
