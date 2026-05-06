# Phase 5 — Multi-city scale & growth (months 12–18)

## Objective

**Replicate** the playbook city-by-city with **infra headroom**, **marketing instrumentation**, and **community-lite** surfaces.

## Dependencies

- Phase 4 revenue/support stable.  
- Playbook doc from Phase 2 beta (what worked in city #1).

## Technical deliverables

### Multi-tenancy by geography

- City/region dimensions on listings and jobs; admin config per market.  
- SEO/localized landing (if web exists).

### Infra scale

- Read replicas or connection pooling; CDN for media; background workers for notifications and reports.  
- Rate limiting and bot protection at edge.

### Growth & community (selective)

- Referral tracking, campaign UTM ingestion.  
- Optional worker forums or tips feed (moderation budget required).

### Social integrations

- WhatsApp deep links / share cards for listings (no full social graph required).

## Acceptance criteria

- SLOs for API and chat under target concurrent users.  
- At least **N** cities live with templated rollout checklist.  
- Cost per acquisition vs LTV modeled (even roughly).

---

*Phase 5 — scale is mostly process + infra + growth loop.*
