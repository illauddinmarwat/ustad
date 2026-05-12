# Phase 6 — Maturity, enterprise & compliance depth (months 18–24)

## Objective

Serve **B2B** demand, deepen **compliance** and **reporting**, and prepare optional **international** or **white-label** experiments without forking core booking logic.

## Dependencies

- Proven consumer/worker liquidity in multiple cities.  
- Finance/legal alignment on B2B contracts and tax reporting.

## Technical deliverables

### B2B / enterprise

- Org accounts, bulk job posting, invoicing, dedicated support contacts.  
- Role-based access inside org (buyer, ops, finance).

### Compliance & data

- Audit logs for admin actions, data export & deletion workflows.  
- Deeper alignment with **local** regulation (counsel-driven): payments, telecom, consumer rights.

### Analytics & BI

- Executive dashboards, cohort retention, worker earnings integrity checks.

### Optional white-label

- Theming, custom domain, isolated branding — **only** if revenue justifies maintenance.

### UI polish lane (Airtasker-inspired)

- Formalize design-system governance (tokens, component versioning, visual regression checks).
- Ensure B2B/enterprise dashboards meet consumer-level usability quality despite denser workflows.
- Keep patterns marketplace-familiar while preserving WorkerzPk brand identity (no direct asset copying).

## Acceptance criteria

- Enterprise pilot with SLAs documented.  
- Security review pass for sensitive data paths.  
- Core consumer booking (Rails A/B + confirm step) remains a **single** code path shared with B2B.
- Visual QA gate enforced for release readiness (consumer + enterprise surfaces).

---

*Phase 6 — platform maturity; avoid duplicate booking engines per segment.*
