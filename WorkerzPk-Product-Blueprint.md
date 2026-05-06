# WorkerzPk — Product Blueprint

Living document: requirements, roadmap, and technical direction. Edit this file as the product evolves.

**Focused MVP scope (booking rules, Rails A/B, modals):** [`WorkerzPk-MVP-SinglePage.md`](WorkerzPk-MVP-SinglePage.md)

**Implementation plan by phase (engineering deliverables, acceptance criteria):** [`docs/implementation/README.md`](docs/implementation/README.md)

---

## Locked delivery decisions

| Decision | Detail |
|---------|--------|
| **Rail B bookings** | After worker accepts an application, the job is **`pending_customer_confirm`**. The customer **must confirm** before status becomes **`assigned`**. |
| **No admin approval (MVP)** | Worker listings go **live without** per-listing or per-signup human approval; **templates** define the catalog. Trust leans on **reviews** and **reactive** moderation/suspension. |

---

## Core Features (MVP)

### User Registration & Profiles

- Customer registration (simple)
- Worker profile + optional document upload (no approval queue in MVP unless policy changes)
- Profile completion (skills, experience, service areas)

### Jobs & services (two rails)

- **Rail A — Job-led:** customer posts job; workers quote; customer accepts quote → `assigned`
- **Rail B — Service-led:** workers publish listings from **templates**; customer applies; worker accepts → **`pending_customer_confirm`**; customer confirms → `assigned`
- Category / template browsing, location filters, sort by rating & price

### In-App Messaging

- Real-time chat
- Notification system
- Quote / proposal exchange

### Payment Integration

- JazzCash & EasyPaisa
- Bank transfers
- Secure escrow system

### Ratings & Reviews

- 5-star rating system
- Photo verification
- Work portfolio showcase

---

## AI Integration (Post-MVP / Phased)

### Smart Matching Algorithm

- ML-based worker recommendation
- Success prediction based on history
- Skill–job compatibility matching

### AI Chatbot Support

- 24/7 customer service (Urdu / English)
- FAQ automation
- Dispute resolution assistance

### Dynamic Pricing Engine

- Real-time price suggestions
- Demand-based adjustments
- Market analysis integration

### Predictive Analytics

- Demand forecasting
- Churn prediction
- Revenue optimization

### OCR Document Verification

- Auto-scan CNIC
- License verification
- Certificate validation

---

## Advanced Features

### Real-Time Tracking

- GPS location tracking
- Job progress updates
- ETA calculations

### Subscription Plans

- Premium job access (workers)
- Priority customer support
- Verified badge system

### Quality Assurance

- Post-job photo verification
- Customer satisfaction survey
- Video call walkthroughs

### Insurance & Guarantee

- Work guarantee coverage
- Customer protection policy
- Worker accident insurance

### Wallet & Loyalty

- In-app wallet system
- Referral bonuses
- Points redemption

---

## Safety & Compliance

### Background Verification

- Police verification check
- Reference verification
- Regular audits

### Data Security

- End-to-end encryption
- PCI DSS compliance
- Privacy-by-design (align with applicable Pakistan data-protection rules; see legal counsel for cross-border / EU users)

### Dispute Resolution

- Mediation system
- Refund process
- Appeal mechanism

### Regulatory Compliance

- SECP registration (if applicable to your entity)
- PTA compliance (telecom / value-added services where relevant)
- Tax integration (FBR)

---

## User Experience

### Simplified Booking

- 3-tap booking process
- Quick service selection
- Instant worker list

### Multi-Language Support

- Urdu interface
- English option
- Regional language support

### Accessibility Features

- Large font options
- Voice-based navigation
- Low-data mode

### Offline Capabilities

- Offline browsing
- PWA technology
- Sync when online

---

## Tech Stack

### Frontend

- React Native (iOS / Android)
- React.js (Web)
- Tailwind CSS

### Backend

- **Supabase** (Postgres + Auth + RLS + Storage + Edge Functions) as primary platform
- Optional: Node **Edge Functions** complexity only when RLS is insufficient

### Database

- PostgreSQL (via Supabase)
- Redis (caching) when traffic warrants

### Infrastructure

- AWS / GCP / Azure
- Docker containerization
- CDN for media

### Third-Party APIs

- Google Maps (location)
- JazzCash / EasyPaisa SDKs
- Twilio (SMS / calls)

---

## Monetization Model

### Commission-Based

- 15–20% platform commission
- Tiered commission rates
- Volume-based incentives

### Premium Subscriptions

- Worker Pro: Rs. 299/month
- Customer Plus: Rs. 199/month
- Business: Custom pricing

### Additional Revenue Streams

- Featured listings
- Promotional boosts
- Skills certification courses

### B2B Services

- Corporate account packages
- Bulk job posting
- Dedicated account managers

---

## Launch Strategy

### Phase 1: Hyperlocal Focus

- Start in 1–2 cities (Lahore / Karachi)
- 500–1000 workers onboarded
- Build brand reputation

### Phase 2: Expansion

- 5–10 major cities
- 5000+ workers network
- Regional advertising

### Phase 3: National Scale

- All major cities coverage
- 20000+ workers
- National brand campaigns

### Marketing Strategy

- Social media (TikTok, Instagram)
- Influencer partnerships
- Community engagement

---

## Scale & Growth Features

### Analytics Dashboard

- For workers: earnings, trends
- For customers: spending patterns
- Admin: platform metrics

### Skills Development Program

- Online certification courses
- Skill badges & recognition
- Microlearning modules

### Community Features

- Worker forums
- Best practice sharing
- Networking opportunities

### Social Commerce Integration

- WhatsApp Business integration
- Instagram Shop integration
- Direct messaging booking

### Enterprise Features (Future)

- Bulk job management
- Recurring service scheduling
- White-label options

---

## Development timeline (18–24 months)

High-level roadmap below; **detailed acceptance criteria and technical work packages** live in [`docs/implementation/`](docs/implementation/README.md).

| Phase | Window | Product focus | Implementation doc |
|-------|--------|---------------|-------------------|
| **1 — MVP** | 0–3 months | Rails A+B, templates, messaging, ratings, **`pending_customer_confirm`** on Rail B | [`phase-1-mvp-foundations.md`](docs/implementation/phase-1-mvp-foundations.md) |
| **2 — Beta** | 3–6 months | Pilot city, PSP pilot, observability, moderation tools (reactive) | [`phase-2-beta-hardening.md`](docs/implementation/phase-2-beta-hardening.md) |
| **3 — Intelligence** | 6–9 months | Ranking/ML assist, FAQ bot, OCR assist, analytics warehouse | [`phase-3-intelligence-automation.md`](docs/implementation/phase-3-intelligence-automation.md) |
| **4 — Depth** | 9–12 months | GPS/ETA lite, subscriptions, guarantees/QA, customer web/PWA | [`phase-4-product-depth.md`](docs/implementation/phase-4-product-depth.md) |
| **5 — Scale** | 12–18 months | Multi-city, infra scale, referrals/campaigns, social hooks | [`phase-5-multi-city-scale.md`](docs/implementation/phase-5-multi-city-scale.md) |
| **6 — Maturity** | 18–24 months | B2B, enterprise, compliance depth, optional white-label | [`phase-6-maturity-enterprise.md`](docs/implementation/phase-6-maturity-enterprise.md) |

---

## Mobile-First Approach

Pakistan’s user base is heavily mobile (high smartphone share, limited desktop use). Prioritize **React Native** for iOS/Android first, then **web / PWA** as a secondary surface. Optimize for **low bandwidth** and **3G**-typical conditions.

---

## Discussion & Review (agent notes)

See inline critique in project chat or extend this section with decisions and date-stamped notes.

**Scope note:** Treat “Core Features (MVP)” as a *wish list* until each item has a cut line. The **cut-line MVP** is defined in [`WorkerzPk-MVP-SinglePage.md`](WorkerzPk-MVP-SinglePage.md); heavy items (escrow, police checks, ML, multi-rail) map to [`docs/implementation/`](docs/implementation/README.md) later phases.

**Compliance note:** “GDPR-ready” matters mainly if you store EU residents’ data; for Pakistan-first, prioritize **local legal advice** (consumer protection, digital payments, telecom/PTA if applicable).

---

*Last updated from stakeholder paste — maintain headings and tables as the single source of truth for early planning.*
