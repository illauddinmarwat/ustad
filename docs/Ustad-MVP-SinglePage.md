# Ustad — Single-page MVP spec & build plan

**Goal:** Prove the marketplace loop in **one city**, with **minimal moving parts**. Success = repeat jobs weekly, low dispute rate, workers paid without manual chaos.

**MVP mantra (two rails):**

- **Rail A — Job-led:** Customer posts need → workers quote → hire → complete → rate.  
- **Rail B — Service-led (reverse flow):** **Service templates** (catalog config) → workers **publish listings** **without admin approval** → customers **browse** and **apply** → worker **accepts** → job is **`pending_customer_confirm`** → customer **confirms booking** → **`assigned`** → complete → rate (same `jobs` / messages / reviews spine).  

Payments start off-platform if needed; messaging and ratings always attach to the **job record** whichever rail started it.

---

## How the system is intended to work (simple flows)

### Rail A — Customer posts a job (“open market”)

**Customer (“User”)**

1. Signs up → picks **customer** role (phone/email OTP).
2. **Posts a job**: category (e.g. plumbing), description, area/location, optional photos → job status **open** (`origin = customer_job`).
3. **Waits**: workers browsing that category see the job (within your city/rules).
4. **Gets quotes**: each quote shows worker, proposed price PKR, short message.
5. **Chats** on **that job** thread.
6. **Accepts one quote** → hired; job **assigned**; other quotes rejected/withdrawn by policy.
7. **Mark complete** (single or dual confirm — pick one UX rule).
8. **Pays** (often off-app at MVP).
9. **Rates** the hired worker (1–5 + short text).

**Worker — Rail A**

1. Sign up → profile (optional CNIC/doc upload stored; **no admin approval gate** to use the platform in MVP).
2. **Open jobs** feed → **quote** (price + message).
3. If chosen: chat, complete work, get paid off-app.
4. **Average rating** from reviews.

### Rail B — Customer picks a advertised service (“reverse flow”)

**Concept:** Workers don’t freestyle random category names — they instantiate **admin templates** (“Split AC service,” “Geyser install”) into **published listings** (their price, blurb, areas). Customers browse **those listings**, not empty templates.

**Customer**

1. Same sign-up as Rail A.
2. **Browse services**: filters (category/template, area, sort by rating/price) → list of **active worker listings**.
3. **Listing detail**: see worker snippet, PKR price, coverage, notes.
4. **Apply for service** (modal/form): location, preferred time window (text/date), notes → **`listing_application` pending**.
5. Worker **accepts** → app creates **`jobs`** row (`origin = service_listing`, **`worker_id` set**, status **`pending_customer_confirm`** — *not* `assigned` yet).
6. Customer sees **Confirm booking** (pricing + scope recap); taps confirm → status **`assigned`**. Optionally **Decline** / let booking lapse (policy you define).
7. Same as Rail A: **chat** (recommended once `pending_customer_confirm` or only after `assigned` — pick one RLS policy), **complete**, **pay off-app**, **rate**.

**Worker — Rail B**

1. Same sign-up as Rail A (no admin gate to publish).
2. **Publish listing**: choose template → set PKR price, detail text, service areas, optional photos → goes **active** immediately — **no admin approval** of the listing.
3. **Applications inbox**: **Accept** / **Decline** each application (decline closes without creating a job).
4. After accept: wait for customer **confirm** → then same complete + pay + reviews as Rail A.

**Admin / catalog**

- **Service templates** only: create/edit **template** definitions workers attach listings to (**catalog ops**, not per-listing approval).  
- **Optional later:** reactive moderation (reports, suspend user); **not** MVP gatekeepers for publish or signup.

**System intent:** **Demand-first** (post job) and **supply-first** (browse worker services) both land on the same **job + messages + completion + reputation** engine.

---

## UI modals & screens (MVP) — both rails

Implement as **React Native `Modal`**, **bottom sheet**, or full screen — same IA either way.

| Actor | Modal / screen | Purpose |
|-------|----------------|---------|
| **Customer** | **Service discovery** | “Browse services” from home — filters; list **worker listings** (templates only appear as backing metadata). |
| **Customer** | **Listing detail** | Full view + **Apply for service**. |
| **Customer** | **Apply for service** | Location/area, preferred schedule, notes → submit application + confirmation. |
| **Customer** | **Confirm booking** (Rail B) | After worker accepts: recap listing price + application details → **Confirm** (→ `assigned`) or **Cancel** booking request. |
| **Customer** | **Post a job** (Rail A) | Second primary CTA: “Post a custom job.” |
| **Worker** | **Publish / edit listing** | Wizard: pick **template** → price, description, areas, photos → publish or draft. |
| **Worker** | **My listings** | Active/paused; edit; pause toggle. |
| **Worker** | **Applications inbox** | Pending applications per listing (or unified); **Accept** / **Decline** (+ optional reason modal). |
| **Worker** | **Quote job** (Rail A) | Price + message on open job. |
| **Admin** | **Template editor** | Create/edit/disable templates (prefer web or Retool; modal/tablet acceptable). |

**Navigation hint — Customer home:** two primary actions: **Browse services** (Rail B) and **Post a job** (Rail A).  
**Worker tab bar:** **Open jobs**, **My listings**, **Applications**, **Profile** (labels can shorten for UI).

---

## 1. What ships in MVP (narrow)

| Ship | MVP | Defer |
|------|-----|-------|
| Auth & roles | Phone/email + OTP (or Firebase Auth-style), roles: **Customer**, **Worker**, **Admin** | SSO, biometric-only |
| Customer — Rail A | Post job (category, text, suburb/area pin, optional photos), browse own jobs, accept **one** quote, rate after complete | Instant book, recurring jobs |
| Customer — Rail B | **Browse services** (worker listings derived from templates), **listing detail**, **apply for service**; track application status until it becomes a **job** | Wishlists, comparing many listings side-by-side |
| Worker — Rail A | Profile, optional CNIC/doc upload (no approval workflow), browse open jobs, **quote** | OCR, police checks |
| Worker — Rail B | **Publish listing** from templates — **live without admin review**; **pause/unpublish**; **accept/decline applications** | Per-listing admin QA queue |
| Service templates | **Catalog templates** (category, title, helper text); workers only **instantiate** templates into listings | Workers inventing new template types |
| Trust model (MVP) | **Reactive** (report/block); reputation from **reviews**; optional doc upload for display only | Pre-publish human verification |
| Matching | Filters: category, area, **sort rating** / price on Rail B; same for Rail A job feed | ML, dynamic pricing |
| Messaging | Thread **per job** once Rail B job row exists (**`pending_customer_confirm`** or **`assigned`** per your RLS choice) | Full chat products |
| Payments | **Out-of-app settlement** + copy for both rails OR **one** PSP path | Escrow split, wallet, multi-rail |
| Worker ratings | Same for both rails: customer rates hired worker after `completed` | Worker rates customer, photo proof |
| Admin / ops | **Template catalog** management; optional user suspend on abuse; **no** “approve worker” or “approve listing” queue in MVP | Full mediation desk |
| Notifications | FCM/SMS: quote events; application submitted; worker accepted → **prompt customer to confirm**; booking confirmed → `assigned` | Rich inbox |

---

## 2. How it should be built (architecture) — **Supabase-first**

**Client:** One **React Native** app with role-based tabs (customer vs worker vs admin can be RN + simple **admin web** in React later; fastest path is RN for two sides + minimal **Retool**/internal admin—or one “admin-only” RN login for week one demos).

**Backend (chosen):** **Supabase** — single project for MVP.

| Piece | Use |
|-------|-----|
| **Auth** | Email/phone + OTP via Supabase Auth; `user_metadata` or a `profiles` row for `role` (`customer` \| `worker` \| `admin`). |
| **Database** | Postgres: jobs (with `origin`), quotes, messages, reviews, worker_profiles, **service_templates**, **worker_service_listings**, **listing_applications**; **RLS** on all of the above. |
| **Storage** | Private bucket for CNIC/docs; public or signed URLs for avatars, **job photos**, **listing photos**. |
| **Edge Functions** | **Accept application** → insert `jobs` with status **`pending_customer_confirm`** + `worker_id`, notify customer **to confirm**; **Confirm booking** action → sets **`assigned`** (service role or RLS-safe RPC); quote-accept for Rail A unchanged. |
| **API** | **Supabase client** from RN (insert/select with RLS) or **PostgREST** filters; add Edge Function + service role only where RLS is too awkward (e.g. some admin bulk ops). |

Source of truth is **Postgres in Supabase** (not a second DB). If you ever outgrow it, you can migrate the schema to managed Postgres elsewhere without changing the domain model.

**Real-time:** Start with **polling** messages (`supabase.from('messages').select().eq('job_id', id).gt('created_at', since)`). Turn on **Supabase Realtime** on `messages` when you want live chat without extra servers.

**Maps:** MVP = **manual area/neighborhood + optional lat/long** saved on job; defer live GPS tracking. Use Google Maps Places or coarse geocode for one city only.

---

## 3. Core data model (minimum tables/collections)

- `users` — id, phone, email, role, status, created_at  
- `worker_profiles` — user_id FK, bio, categories[], service_areas (JSON or polygons later), verification_status, avg_rating (denormalized)  

**Rail B — catalogue**

- `service_templates` — id, slug, category, title, description_hint, optional media, `active` (admin-managed).  
- `worker_service_listings` — id, worker_id FK, template_id FK, headline, detail_text, price_pkr (or `price_min`/`price_max` later), service_areas text/JSON, status (`draft` \| `active` \| `paused`), created_at.  
- `listing_applications` — id, listing_id FK, customer_id, note, location_text (or FK to address), preferred_time text, status (`pending` \| `accepted` \| `declined` \| `cancelled`), created_at.

**Shared job spine (both rails)**

- `jobs` — customer_id, worker_id (null for Rail A until hire; **set on Rail B** when worker accepts, while status is still **`pending_customer_confirm`**), category/title/description, status: `open` \| `pending_customer_confirm` \| `assigned` \| `completed` \| `cancelled` (optional `quoted` job-level state if you want it), **`origin`** (`customer_job` \| `service_listing`), optional **`listing_application_id`**, created_at.  
  - **Rail A:** `origin = customer_job`; `worker_id` null until customer accepts a quote → **`assigned`**.  
  - **Rail B:** worker **accept** → insert: `pending_customer_confirm` + `worker_id` set; customer **confirm** → **`assigned`**. **Do not** create Rail B jobs already **`assigned`.**  
- `quotes` — job_id, worker_id, amount_pkr, message, status — **Rail A only** (no quotes rows for listing-originated jobs unless you reuse for change orders later).  
- `messages` — job_id, sender_id, body, created_at (**same table** once Rail B becomes a job).  
- `reviews` — job_id, reviewer_id (customer), reviewee_id (worker), rating (1–5), comment, created_at; **unique on job_id**.

**Triggers / invariants:**

- **Rail A:** At most **one** `quotes.status = accepted` per job (partial unique index).  
- **Rail B:** Worker **accept** creates **at most one** job row in **`pending_customer_confirm`** per listing application (idempotent Edge Function); customer **confirm** is the **only** transition to **`assigned`** for `origin = service_listing`.  
- **Rail B:** Decline booking or timeout: job → `cancelled` (define whether customer or system cancels stale `pending_customer_confirm`).  
- Recompute **`worker_profiles.avg_rating`** after insert on `reviews`.

---

## 4. Build order (recommended)

1. **Week 1–2:** Auth, roles, **admin seed + CRUD service templates**, customer **Rail A** post job + worker browses jobs. Job list/detail.  
2. **Week 2–3:** Quotes + accept + Rail A **`assigned`**; Rail B: listing publish + browse + applications; **accept application** creates **`pending_customer_confirm`** job; customer **confirm booking** → **`assigned`**.  
3. **Week 3–4:** Per-job messaging (define RLS for `pending_customer_confirm` vs `assigned`), ratings, **Confirm booking** modal + notifications, **modals** polished.  
4. **Week 4+:** One-city polish, observability (Sentry), cohort test **both** rails (e.g. 5 listings live, remainder job-only).

Defer **commission collection** until you have volume; MVP can monetize via **featured worker** experiments or handwritten invoices to first B2C partners—not ideal but keeps legal load down.

---

## 5. Security & trust (minimum bar)

- **RLS / server checks:** Customers only mutate their jobs; workers only quote on **open** Rail A jobs; **listings** editable only by owning worker (no “verified” flag required for MVP unless you add it later); **applications** visible to applicant + listing owner; **worker accept** and **customer confirm booking** go through **Edge Function or RPC** (service role) so status transitions cannot be forged. Messages: allow only participants (`customer_id`, `worker_id`) on that `job_id` — decide if messaging is enabled before `assigned` (e.g. allow at `pending_customer_confirm` for Q&A).  
- **PII:** CNIC docs in **private** bucket; audit who downloaded.  
- **Rate limits:** login, OTP resend, message send.  
- **Abuse:** report user + admin suspend paths from day one.

---

## 6. Definition of “MVP done”

- Ten real **jobs** completed with **reviews** across **both rails** (e.g. ≥3 from **service applications**, rest from **open job** quotes) without daily manual DB fixes.  
- Time-to-first-quote (Rail A) **and** time-to-accept or decline (Rail B) measurable.  
- Admin/ops can add a **template** and any onboarded worker can **publish a listing** (no approval) without a developer.  
- At least one Rail B job flow observed: **accept** → **`pending_customer_confirm`** → customer **confirm** → **`assigned`** → **completed** → **review**.

---

## 7. After MVP (order)

Phased engineering plan with deliverables and acceptance tests: [`implementation/README.md`](implementation/README.md).  

Broadly: Realtime messaging → integrated payment rail → escrow (if pursued) → multi-city rollout → ranking/AI/OCR depth per [`Ustad-Product-Blueprint.md`](Ustad-Product-Blueprint.md).

---

*Treat this doc as scope control: if work does not shorten the loop in §1–§6, it is not MVP.*
