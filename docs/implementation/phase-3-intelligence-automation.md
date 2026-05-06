# Phase 3 — Intelligence & automation (months 6–9)

## Objective

Reduce manual browsing friction and support load using **data-driven ranking**, **FAQ automation**, and **document assist** — without blocking bookings on ML.

## Dependencies

- Enough historical jobs/quotes/applications for basic stats (even hundreds helps).  
- Phase 2 analytics pipeline or export to warehouse.

## Technical deliverables

### Matching & ranking (non-blocking)

- Rule-based ranking v2: distance, rating, response time, completion rate.  
- Optional ML layer: candidate generation + explainable score; **fallback** always to plain lists.

### Support automation

- Bilingual FAQ (Urdu/English), contextual help from job category.  
- Chatbot **bounded** to policy/FAQ + handoff to human support contact.

### Document assist

- OCR pipeline for CNIC/license **assist** (worker prefills); human-out-of-loop only when accuracy meets bar **or** keep as assistant-only.

### Analytics

- Event taxonomy (`listing_view`, `application_submit`, `confirm_booking`, etc.).  
- churn proxy metrics for workers/customers.

## Out of scope

- Fully automated dispute decisions.  
- Dynamic surge pricing without legal/product review.

## Acceptance criteria

- Measurable uplift in time-to-match or conversion vs Phase 2 baseline **or** documented neutral experiment.  
- Chatbot deflection rate for Tier-1 FAQs.  
- OCR assist accuracy monitored; no worsening of fraud vs control.

---

*Phase 3 — smart layers are additive; core state machine unchanged.*
