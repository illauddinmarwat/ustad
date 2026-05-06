# Phase 2 — Beta hardening & monetization pilot (months 3–6)

## Objective

Run a **controlled beta** in 1–2 cities, harden reliability, introduce **first payment rail** (optional but typical), and add **minimum viable ops** without reintroducing “approve every listing” unless product changes.

## Dependencies

- Phase 1 acceptance criteria met.  
- PSP / bank relationships if moving beyond off-app payment.  
- Support playbook (WhatsApp or in-app help channel).

## Technical deliverables

### Reliability & observability

- Staging → production promotion process; DB migrations discipline.  
- Metrics: job funnel (post / quote / assign / complete), Rail B (apply / accept / confirm / assign), time-to-first-response.  
- Load testing on hot paths (message poll or Realtime).

### Payments (pilot)

- **One** integrated path (e.g. JazzCash or EasyPaisa) **or** structured “mark paid” + receipt upload if integration slips.  
- Ledger table for platform fees (even if fee = 0 in beta).  
- Refund / dispute **flags** (manual payout at first).

### Admin / ops (still not “approval gate”)

- User search, suspend/reinstate, **template** management improvements.  
- Abuse queue: reported listings/messages (react only).  
- Optional: **soft** “verified” badge later if you add human review — **not** default in this phase unless decided.

### Product polish

- Supabase **Realtime** on `messages` if polling hurts UX.  
- Deep links for booking confirm.  
- Urdu copy pass on critical modals.

## Acceptance criteria

- Beta cohort KPIs tracked weekly (conversion, completion, confirm rate on Rail B).  
- Crash-free sessions above agreed threshold.  
- If PSP live: ≥ N successful tracked transactions without accounting ambiguity.

## Risks

- Payment reconciliation complexity → start with low volume + manual nightly check.  
- Scope creep into escrow → defer unless legally/product-ready.

---

*Phase 2 — ops tooling grows; listing publish stays unblocked unless policy changes.*
