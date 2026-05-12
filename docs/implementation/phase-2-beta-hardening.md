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

### UI polish lane (Airtasker-inspired)

- Mirror proven marketplace UX patterns (clear card hierarchy, trust row, primary CTA placement) without cloning branded assets 1:1.
- Standardize design tokens (spacing, radius, typography, color intent) and shared primitives (`JobCard`, `ListingCard`, `StatusPill`, `PrimaryButton`).
- Target top 5 screens first: dashboard, services list, listing detail, jobs board, job detail.

## Acceptance criteria

- Beta cohort KPIs tracked weekly (conversion, completion, confirm rate on Rail B).  
- Crash-free sessions above agreed threshold.  
- If PSP live: ≥ N successful tracked transactions without accounting ambiguity.
- Core journey UI usability pass (discover -> detail -> action) with no P1 UX blocker.

## Session-ready task checklist

Use this checklist as the execution board for the next working session. Mark items `[x]` when done.

### 0) Session kickoff (must do first)

- [x] Confirm target beta city/cities and cohort size (customers + workers).
- [x] Confirm payment path decision for this phase:
  - [ ] `Pilot PSP integration` (JazzCash/EasyPaisa), or
  - [x] `Structured manual mark-paid + receipt upload`.
- [x] Freeze Phase 2 success metrics and weekly targets in writing.

### 1) Reliability and release discipline

- [x] Create a written staging -> production migration checklist (backup, migrate, verify, rollback) in [`phase-2-ops-runbook.md`](phase-2-ops-runbook.md).
- [x] Add DB migration runbook for production deploys (who runs, when, how verification is done) in [`phase-2-ops-runbook.md`](phase-2-ops-runbook.md).
- [x] Add feature-flag plan for risky beta features (payments, realtime, deep links) in [`phase-2-operational-checklists.md`](phase-2-operational-checklists.md).
- [x] Add production smoke test script for critical paths:
  - [x] Auth sign-in
  - [x] Rail A job post -> quote -> assign
  - [x] Rail B apply -> accept -> confirm -> assign

**Acceptance check**
- [x] Dry-run promotion process once in staging without blockers.

### 2) Metrics and observability

- [x] Define and implement event instrumentation for:
  - [x] `job_posted`
  - [x] `quote_submitted`
  - [x] `job_assigned`
  - [x] `job_completed`
  - [x] `listing_applied`
  - [x] `application_accepted`
  - [x] `booking_confirmed`
- [x] Add dashboard queries for conversion funnels (Rail A + Rail B) in [`phase-2-kpi-template.md`](phase-2-kpi-template.md).
- [x] Add weekly KPI report template (single page: volume, conversion, completion, median response time) in [`phase-2-kpi-template.md`](phase-2-kpi-template.md).
- [x] Add error monitoring triage routine (daily check + owner + SLA) in [`phase-2-operational-checklists.md`](phase-2-operational-checklists.md).

**Acceptance check**
- [x] One weekly KPI report can be generated from real data without manual SQL editing.

### 3) Payments pilot track

- [ ] Implement chosen path:
  - [ ] PSP integration path, or
  - [x] Manual paid-status flow with proof attachment (minimal phase: `mark_job_paid` + ledger marker in `JobDetail`).
- [x] Add `payment_ledger` table (or equivalent) with immutable entries for:
  - [x] job_id
  - [x] amount
  - [x] fee
  - [x] payer/payee references
  - [x] status transitions
- [x] Add dispute/refund flags and basic ops actions (`admin_update_payment_status`, Admin Ops queue).
- [x] Add reconciliation checklist (daily/weekly) in [`phase-2-operational-checklists.md`](phase-2-operational-checklists.md).

**Acceptance check**
- [x] 5+ end-to-end payment test cases complete with unambiguous ledger records.

### 4) Admin and moderation tooling

- [x] Add searchable user/admin ops view (find by email, role, status) in `AdminOpsScreen`.
- [x] Add suspend/reinstate flow with audit log entry (`admin_set_user_status` + app events).
- [x] Add reported content queue (listings/messages) with action states (`abuse_reports` + `admin_resolve_report`).
- [x] Improve template management UX (activate/deactivate safely) in `AdminOpsScreen`.

**Acceptance check**
- [x] Ops can suspend a problematic user and resolve a report without direct SQL access.

### 5) Product polish and UX hardening

- [x] Enable Supabase Realtime for `messages` if polling latency is noticeable.
- [x] Add deep-link handling for booking confirmation route.
- [x] Run Urdu copy pass on critical modals:
  - [x] Apply service
  - [x] Confirm booking
  - [x] Cancel job / decline application
  - [x] Completion and review
- [x] Improve empty/loading/error states on top 5 high-traffic screens.

**Acceptance check**
- [x] Customer can open confirmation deep link and complete booking in <= 3 taps.

### 6) QA and go/no-go gate

- [x] Build Phase 2 regression checklist (Auth, Rail A, Rail B, messaging, reviews, payments path) in [`phase-2-operational-checklists.md`](phase-2-operational-checklists.md).
- [x] Execute test pass on at least:
  - [x] 3 customer accounts
  - [x] 2 worker accounts
  - [x] 1 admin/operator account
- [x] Log defects with severity and owner.
- [x] Resolve all P0/P1 issues before beta expansion.

**Acceptance check**
- [x] Formal go/no-go decision note template recorded with risks and mitigations in [`phase-2-operational-checklists.md`](phase-2-operational-checklists.md).

### 7) Concrete UI checklist (execution-ready)

Use this as the week-by-week UI lane for Phase 2.

**Week 1 — Foundation**

- [x] Define `tokens.ts` (spacing, radius, color roles, typography scale) and ban ad-hoc hardcoded values in touched files.
- [x] Create shared primitives: `AppCard`, `PrimaryButton`, `StatusPill`, `SectionHeader`, `ScreenContainer`.
- [x] Add simple visual QA checklist (spacing consistency, CTA contrast, readable hierarchy).

**Week 2 — High-traffic screens**

- [x] Dashboard: hero + primary CTAs + trust row + cleaner information density.
- [x] Services list: listing cards with price/rating-first hierarchy and clear tap target.
- [x] Jobs board: status pill + stronger “Open” CTA + cleaner card metadata.
- [x] Listing detail: price prominence + clearer apply modal hierarchy.
- [x] Job detail: action blocks (quote/confirm/complete/review) with consistent card rhythm.

**Week 3 — States and polish**

- [x] Standardize empty/loading/error states on top 5 screens.
- [x] Improve form UX (input labels/help/error states) on post/apply/quote/review flows.
- [x] Add Urdu copy placeholders for critical modals (Phase 2 scope alignment).
- [x] Add low-end device pass: reduce overdraw and long-list jank.

**Week 4 — Validation**

- [x] Run 5-task usability script (customer + worker) and log top friction points.
- [x] Fix all P1 UX blockers discovered in script.
- [x] Capture before/after screenshots for each upgraded screen and store in the phase handoff note.

### Suggested execution order (single-session start plan)

1. Kickoff decisions (city, payment path, KPI targets)  
2. Reliability runbook + smoke tests  
3. Metrics instrumentation + dashboard baseline  
4. Payments pilot foundation (ledger + flow)  
5. Admin/moderation tooling  
6. UX polish, QA sweep, go/no-go note

## Risks

- Payment reconciliation complexity → start with low volume + manual nightly check.  
- Scope creep into escrow → defer unless legally/product-ready.

---

## Final status

- **Phase 2 marked complete**. Closeout and evidence: [`phase-2-closeout.md`](phase-2-closeout.md).

---

*Phase 2 — ops tooling grows; listing publish stays unblocked unless policy changes. Updated and marked complete on 2026-05-07.*
