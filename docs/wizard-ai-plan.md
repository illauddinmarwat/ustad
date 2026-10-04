# Wizards, Help me write (AI) and English/Urdu: implementation plan

**Status: Phases 1 to 4 built and tested locally (2026-10-02), nothing committed or pushed. Phase 0 (deploying the function and setting its secrets) is left for last.** Written 2026-10-02. Mockups: the two artifacts "Ustad Job Posts" and "Ustad Services" (screens, decisions and guardrails are agreed there). Estimate: 12 to 16 working days over five phases.

## Goal

1. Replace the single job-post form and the inline listing form with **3-step wizards** (no tab bar, media first).
2. **Help me write**: a full-screen AI window that asks up to 3 questions and prepares a draft in **English and Urdu**; the author approves both versions.
3. **No price on listings.** A listing request becomes a request for a quote, and the Ustad's quote is the only price (jobs already work this way: `20260930170000_job_media_and_no_budget.sql`).

## Phase 0 first: the Groq key must not live in the app

`mobile/.env` is git-ignored (good), but `mobile/app.config.ts:60` copies `GROQ_API_KEY` into `extra.groqApiKey`, and everything in `extra` is **compiled into the app bundle**. Anyone who installs the app can read it. The existing OCR scaffold (`mobile/src/lib/ocr/providers.ts`, behind the off `phase3_ocr_enabled` flag) already depends on that line.

Fix:
- Store `GROQ_API_KEY` and `GROQ_MODEL` as **Supabase Edge Function secrets**. The mobile app calls our function; only the function talks to Groq.
- Delete both variables from `mobile/.env` and remove `groqApiKey` from `app.config.ts`. Point the OCR Groq provider at the same function (or leave OCR off) so no client code reads the key.
- **Rotate the key.** `.env` was edited today; if any build, EAS build or dev client was made since, the key is inside it. Rotating is cheap and settles the question.

## Facts checked in the code

| Fact | Consequence |
|---|---|
| There is no `supabase/functions` folder and no Edge Function today. | We create the first one, and need a deploy path. |
| `deploy-supabase.yml` only runs `supabase db push` with a DB URL, on purpose avoiding an access token that expires. | Functions and secrets need a token (decision D-A below). |
| UI strings are bilingual (`strings.ts`, `BiText` shows EN and UR together). User-written content is not translated. | Reader language is a new setting. |
| No per-user language is stored in the database (only a registration label string). | New `profiles.preferred_language`. |
| `price_pkr` is `not null` on `worker_service_listings` and is read by ranking, boost and city-discovery functions (phase 3, 4 and 5 migrations), plus `ServicesScreen`, `ListingDetailScreen`, fixtures. | Migration plus a code audit. |
| Contact check is `looksLikeContact` (client) and `_contains_contact` (server): 7+ Latin digits, links, handles. | Urdu digits and spelled-out numbers slip through. Harden both. |
| `create_direct_request` and `jobs.target_worker_id` exist. | Request a quote reuses them. |
| `openai/gpt-oss-120b` is a **text** model. | It cannot look at photos. See decision D-C. |

## Decisions already made

English and Urdu only, Roman Urdu accepted as input. Translate on write: AI drafts, author edits and approves. Help me write is a button that opens its own window. No voice transcription. Guests get AI help with a lower limit. No customer budget, no hourly rate. Request a quote creates a direct-request job with a new `listing_id`. Old test data is ignored.

## Architecture

```
Mobile (Help me write)  ->  Edge Function ai-draft  ->  Groq (GROQ_MODEL)
        |                        |  verifies caller, rate limit, contact check
        |                        '-> ai_calls (usage only, no content)
        '-> saves the approved draft with normal RPCs (create job / publish listing)
```

**Edge Function `ai-draft`** (Deno), one endpoint, three actions:
- `questions`: input is the user's text, the category and the kind (job or listing). Output is JSON: up to 3 questions, each with 2 to 4 short tap options. Never a question about price.
- `draft`: input is the original text plus the chip answers. Output is JSON: `source_lang`, and `en` and `ur` objects with `title` and `description` (job) or `headline` and `about` (listing), plus a suggested category.
- `translate`: one field to the other language, used by Update translation.

Server rules, in order, on every call:
1. Check the caller (signed-in user, or guest, see D-B).
2. `ai_consume(kind)` takes one unit from the daily allowance atomically. Give the unit back if Groq fails.
3. Normalise Urdu and Arabic-Indic digits, then run the hardened contact check on the **input** and on every **output** field. A hit removes the text and returns a safe message.
4. Call Groq with a fixed system prompt, a JSON schema, a 20 s timeout and a token cap. Validate the reply against the schema. Treat the user's text and any text inside images as data, never as instructions.
5. Log the call (kind, tokens, latency, ok). **Never store the content.**

Fallback everywhere: if AI is off, over the limit or failing, the wizard's manual steps work unchanged.

## Database (new migrations, in this order)

1. `profiles.preferred_language text not null default 'en' check in ('en','ur')`, set in registration and Account.
2. Translations: `title_i18n` and `description_i18n` on `jobs`; `headline_i18n` and `detail_i18n` on `worker_service_listings`. Shape: `{ "source": "ur", "en": "...", "ur": "...", "ai": true, "approved_at": "..." }`. The old `title`, `description`, `headline` and `detail_text` columns stay as the original text so nothing existing breaks.
3. Listings without price: drop `not null` on `price_pkr` and stop writing it. Update every function that returns or ranks on it (phase 3 ranking, phase 4 boosts, phase 5 city discovery) so none require it. Audit `web-admin` jobs page and `admin_job_pricing` for listing price use.
4. `listing_media` (kind photo, up to 4, path, bytes) with RPCs to add, list and remove, and signed URLs. Listing photos are readable by everyone including guests. Same pattern as `job_media`.
5. `jobs.listing_id uuid references worker_service_listings`, and `create_listing_request(listing_id, title, description, area, time)` that wraps `create_direct_request`. Media attaches through the existing job media path. `listing_applications` is left in place and unused.
6. `ai_calls` and `ai_usage` tables, RPC `ai_consume`, and `app_settings` keys: `ai_help_enabled`, `post_wizard_enabled`, `listing_wizard_enabled`, `listing_quote_requests_enabled` (all seeded off), `ai_daily_limit_user` (5), `ai_daily_limit_guest` (2).

## Mobile work

- `WizardShell`: progress bar, Back and Next, no tab bar (routes sit above the tab navigator), draft kept in memory so leaving a step does not lose it.
- `PostJobWizard` replaces `PostJobScreen` (update `JobPostingScreens.test.tsx`). Steps: Show the problem, Details, Review.
- `ListingWizard` replaces the inline create form in `ServicesScreen`. Steps: Your work, Details, Review.
- `AiHelperScreen` shared by both (`mode: 'job' | 'listing'`): chat bubbles, chip answers, "Review my draft" that jumps to the Review step.
- `BilingualReview`: English and Urdu cards, edit each, "AI draft" tag, **I checked both versions** gates the final button, stale marker and Update translation after an edit.
- `LocalizedText` and a language context: show the reader's language, with Show original.
- Listings without price: remove price from `ServicesScreen`, `ListingDetailScreen`, fixtures and tests. Apply modal becomes Request a quote.
- Inbox: the Ustad sees listing requests with Decline or Send quote (reuse the quote form); the customer sees Waiting and then Quote received.
- Strings: every new label in `strings.ts` with EN and UR.
- Draft saving: reuse the existing attach-media-after-create pattern in `jobMedia.ts`.

## Phases

| Phase | Work | Days | Done when |
|---|---|---|---|
| **0 Security and plumbing** | Move key to function secrets, rotate, clean `app.config.ts`, function skeleton with a health check, deploy path, flags and usage tables | 1 | Mobile has no Groq variable. Function answers a test call. |
| **1 Job post wizard** (no AI) | `WizardShell`, `PostJobWizard`, tests, flag `post_wizard_enabled` | 2 to 3 | Posting works through 3 steps with media. Old screen behind the flag. |
| **2 Listings without price** | Migrations 3 to 5, `ListingWizard`, listing photos, Request a quote, inbox changes, remove price | 4 to 5 | A customer requests a quote from a listing, the Ustad quotes, the customer accepts, the job closes. pgTAP passes. |
| **3 AI and two languages** | `ai-draft` function, hardened contact check, rate limit, `AiHelperScreen`, `BilingualReview`, language setting, `LocalizedText`, migration 1 and 2 | 4 to 5 | A post and a listing can be drafted in both languages, edited, approved and read in the reader's language. |
| **4 Polish** | Update translation, quote-message translation, photo tips (needs a vision model), admin AI usage view, docs, FAQ, privacy text | 1 to 2 | Admin sees calls and cost per day. Docs updated. |

Phases 1 and 2 do not depend on AI and can ship first. Phase 3 needs Phase 0.

## Testing

- Jest for each new screen and component, including the wizard gating and the manual fallback when AI fails.
- pgTAP for the new tables, RPCs, listing media visibility, `create_listing_request` and rate limiting.
- Function tests with a mocked Groq: schema validation, timeout, refund on failure, limit reached.
- **Contact-leak tests**: Urdu digits, spelled-out numbers, digits split by spaces or words, links, handles, in the input and in the output.
- An **Urdu quality set**: 30 sample posts and listings, read by a native speaker before the flag is turned on.
- Real-device check of the wizard, keyboard, Urdu (right-to-left) rendering and slow network.

## Risks

| Risk | Mitigation |
|---|---|
| Urdu quality of the model | Native review set, editable drafts, mandatory approval tick. |
| Cost growth | Two calls per draft, daily limits, token caps, usage view in admin. |
| Prompt injection (text in the post or in an image) | Fixed system prompt, schema-validated output, contact scrub, the AI cannot act on anything. |
| Guest abuse | Lower limit, per-device and per-IP keys, off by flag. |
| Model change or retirement | Model name is a secret (`GROQ_MODEL`), no code change to swap it. |
| Latency | 20 s timeout, visible progress, manual path always available. |
| Privacy | Update the privacy policy modal: post text is sent to an AI provider. Never log content. |

## Decisions needed

- **D-A. Deploying the function.** The pipeline avoids access tokens on purpose. Options: add a `SUPABASE_ACCESS_TOKEN` secret to GitHub and a `deploy-functions.yml` workflow (it expires and needs renewing), or deploy and set secrets by hand from the Supabase dashboard or CLI. I recommend the workflow, with a reminder to renew.
- **D-B. How guests are identified for the AI limit.** Depends on how the guest flow identifies a guest today; I have not confirmed it. Proposed: a guest token if one exists, otherwise a device id plus IP hash.
- **D-C. Photos.** The mockup says "I can see the mixer tap", which needs a vision model. Recommended: the first release is **text only** (photos are attached but not analysed) and the mockup wording is changed. Add a vision model later as `GROQ_VISION_MODEL`.
- **D-D. Quote messages and threads.** Translate them in Phase 4, or leave them in the author's language for now. I recommend Phase 4.
- **D-E. Structured output.** Confirm the chosen model supports JSON-schema output on Groq. If not, use JSON mode and rely on server-side validation.

## Docs to update

`docs/api-reference.md` (new columns, RPCs, function), `docs/mind-map.md` and `.html`, `docs/how-to-run.md` (function secrets), FAQ entries, `PrivacyPolicyModal`.

## Build notes: Phases 1 and 2 (2026-10-02)

**Phase 1, job post wizard.** `PostJobScreen` is now three steps (`WizardShell`: progress, content, Back and Next). Deviation: no `post_wizard_enabled` flag. `PostJob` is a root-stack route, so the tab bar is already hidden, and the old single form is gone. Tests updated and added (`JobPostingScreens.test.tsx`, `WizardShell.test.tsx`).

**Phase 2, listings without price.** Migration `20261002100000_listing_quote_requests.sql` (flag `listing_quote_requests_enabled`, seeded off): nullable `price_pkr`, `jobs.listing_id`, `listing_media` and the public `listing-media` bucket, `add_listing_media`, `remove_listing_media`, `list_listing_media`, `create_listing_request`. pgTAP `phase24_listing_quote_requests_seeded.test.sql`: 31 assertions pass. Mobile: `ListingWizardScreen` (route `ListingWizard`), `lib/listings.ts`, Services cards show a cover photo and areas and no price, `ListingDetailScreen` shows a gallery and areas and a Request a quote button, `RequestWorkerScreen` takes a `listingId` and attaches photos, video and voice, and the Ustad's request row opens the job-board detail so the photos are visible.

Deviations and what is not built:
- With the flag off the old Apply modal stays, so nothing breaks before the flag is turned on. The price is hidden in the app either way.
- To turn on: set `listing_quote_requests_enabled` to true (direct requests must be on too). A separate enable migration is the usual way.
- Areas are typed as comma-separated text, not picked from the admin-managed list.
- Not built from the mockup: reviews on the listing detail, the quick question button, search on Services, guests requesting a quote (sign-in is required), and a screen to edit or pause an existing listing.
- Ranking, boost and city-discovery functions still return `price_pkr` (null for new listings); no change was needed.
- The Phase 4 web checkout button on the listing detail is untouched and still behind its own flag.
- The client contact check now also catches Urdu and Arabic-Indic digits (`lib/contactCheck.ts`). The server check `_contains_contact` does not yet; that is in Phase 3.
- `jest.setup.js` now gives every test an in-memory AsyncStorage mock.
- Existing test `phase19_job_media_seeded.test.sql` fails 2 assertions on a clean database. This predates this work: migration `20261001100000_enable_job_media.sql` turned the flag on, and the test expects it off.

## Phase 0 decisions (2026-10-02)

- **Where the AI keys live:** Supabase Edge Function secrets `GROQ_API_KEY` and `GROQ_MODEL` only. A git-ignored local copy is `supabase/functions/.env`; names are listed in `supabase/functions/env.example`. The mobile app holds no AI key.
- **Done:** the Groq pair moved out of `mobile/.env` (now only the two public Supabase values); the unused Celery, Redis, Tesseract, vision-pipeline and Google Vision variables were removed; `app.config.ts` no longer copies any key into the app bundle.
- **Key rotation:** the Google Vision key and the older Groq key are inside the 1 Oct release APK. The owner will rotate them later.
- **OCR:** not used by any screen and not needed. The client code in `mobile/src/lib/ocr` is now inert (no keys). Delete it, or leave it, later.
- **Deploying the function:** pending. Option 1 is a GitHub workflow with secret `SUPABASE_ACCESS_TOKEN` and variable `SUPABASE_PROJECT_REF`. Option 2 is a manual upload. Either way the Groq secrets are set once in the Supabase dashboard, never in GitHub.
- **Testing:** mocked Groq in function tests, then the real call on the hosted project with the flag off.

## Build notes: Phases 3 and 4 (2026-10-02)

**Phase 3, AI and two languages.** Migrations `20261002110000_ai_help_and_languages.sql` and `20261002120000_wizard_ai_faq.sql`; pgTAP `phase25_ai_help_languages_seeded.test.sql` (48 assertions pass). Edge Function `supabase/functions/ai-draft` (logic in `_shared/ai.ts`, Groq call in `_shared/groq.ts`); 28 Deno tests pass and `deno check` is clean. Mobile: `AiHelperScreen` (route `AiHelper`), `BilingualReview`, `AiHelpButton`, `useBilingual`, `LocalizedText`, `LanguageSetting` in Account, `lib/aiDraft.ts`, `lib/i18nText.ts`, `lib/jobTranslations.ts`; both wizards use them. Admin: Settings has the AI switch and the two daily limits; a new AI Usage page shows calls, failures and tokens.

How it behaves:
- Help me write opens a full-screen chat, asks up to 3 tap-to-answer questions (never about money), then writes English and Urdu. The job draft lands on the review step; the listing draft lands on Details first, because it has no areas.
- For text the author wrote, the review step prepares the other language itself (one `translate` call). If AI help is off, the daily limit is used up or the call fails, the post goes out in the author's language only and says so.
- The author edits either language; the other is marked out of date and **Update translation** redoes it. Publish and Post stay disabled until **I checked both versions** is ticked, and the tick resets after any edit.
- Editing the original text on Details throws the prepared versions away, so the review prepares them again.
- Readers see their own language (`profiles.preferred_language`, changeable in Account) with Show original: Services cards, listing detail, job board, job detail.
- A refused or failed AI call gives its allowance unit back. All three actions count against the daily limit (5 for people, 2 for guests), so an AI-assisted post can use 2 or 3 of the 5.

Deviations and what is not built:
- `profiles.preferred_language` already existed, so no new column.
- The model is asked for JSON object mode and the answer is validated on the server; strict JSON-schema output was not assumed (D-E).
- Text only (D-C): photos are attached but not analysed. A static tip ("add at least 3 photos") shows on the listing wizard instead.
- Guests are identified by the `x-device-id` header plus a hash of the network address (D-B). Not tried on a real network.
- Quote messages and the question thread are not translated (D-D), and the language switch is not applied to Inbox request rows, the customer's own post, or notifications.
- OCR client code in `mobile/src/lib/ocr` is still there and inert (no keys).
- Not tested: a real Groq call, `reasoning_effort` with the chosen model, the function on the hosted project, Urdu quality with a native reader, a real device.

**Phase 4, polish.** Done: Update translation, in-app help (three new FAQ entries and the old request-a-worker answer without the budget), privacy text about AI, admin AI Usage page and Settings switch and limits, docs. Moved out: quote-message translation, photo analysis with a vision model.

## Editing a service and adding translations by hand (2026-10-02)

- **My services** on the Services tab (Ustads only) lists your own listings with their status and an **Edit** button. Edit opens the same three-step wizard, filled in: the service type is fixed, current photos can be removed and new ones added (up to 4 in total), the text and areas can be changed, and a switch pauses or shows the service. Saving updates the listing; it never creates a new one.
- **Old listings are compatible.** They simply have no translations. On the review step of an edit, the wizard prepares the other language with AI when AI help is on. When it is off, **Add the other language myself** shows both languages with the other one blank, so the Ustad can type it. Both versions must be filled in, both are checked for phone numbers, and the "I checked both versions" tick is needed. **Use one language only** drops the translation.
- The same hand-typing button is on the job post review.
- Editing the original text no longer throws the translations away. The other language is marked out of date, and **Update translation** (AI) or typing fixes it.
- Existing translations are loaded and not sent to the AI again.

## Running it locally (2026-10-02)

The hosted project is not touched. A local Supabase stack runs from a scratch folder that points at this repo's `supabase/migrations` and `supabase/functions` with other ports, because another project's stack uses the default ones.
- Database: `127.0.0.1:55322`, API `http://127.0.0.1:55321`. All 67 migrations applied on `supabase start`.
- `supabase functions serve` runs `ai-draft` with the keys from `supabase/functions/.env`. A real call to Groq returned good English and Urdu.
- The app runs in the browser with `npx expo start --web` (port 8081). While testing, `mobile/.env` points at the local stack; the hosted values are saved outside the repo and must be put back before a real build.
- Test accounts: one customer who reads Urdu, one who reads English, three Ustads (two plumbers, an electrician), two old-style listings with a price, no photos and no translations. Local only.

## Phase 0 done (2026-10-03)

`.github/workflows/deploy-functions.yml` sets `GROQ_API_KEY` and `GROQ_MODEL` as Supabase function secrets and deploys `ai-draft`, using the GitHub secrets that are already there (`SUPABASE_ACCESS_TOKEN`, `GROQ_API_KEY`) and reading the project reference from `NEXT_PUBLIC_SUPABASE_URL`. Decision D-A: GitHub workflow. It has not run yet: a workflow can only run once it is on `master`. After the first run, turn on `ai_help_enabled` and `listing_quote_requests_enabled` (Admin, Settings) and check AI Usage.

## Services cards, area picker, Nearby without location (2026-10-03)

- **Services list** is now cards: cover photo (or the Ustad's initials), headline in the reader's language, Ustad name with a verified tick, rating and review count, jobs done, up to three areas, and a Request a quote prompt. A search box filters by service, Ustad or area; two columns on a wide screen. Data comes from `listing_card_info` (migration `20261003110000_listing_card_info.sql`, pgTAP `phase26`, 9 assertions).
- **Ustads see the Services tab** (My services) in the bottom bar; it was a hidden tab.
- **Areas in the listing wizard** are picked, not typed: city list and area chips from the admin-managed lists (`cities`, `city_areas`), several cities allowed, an "other area" box, selected areas as removable chips (up to 10). **Use my location** reads the device position and ticks the matching area; with no device location (a PC) it opens a map to pin instead. The Ustad's own city is pre-selected.
- **Nearby on a PC**: when the device location is not available there is now a city list and **Pick on the map** instead of a dead end, plus a note on switching location on in Windows. A chosen city is turned into coordinates with OpenStreetMap (no key) and the usual nearby search runs around it; "Showing Ustads near ..." with Change goes back to device location.
- **Hourly rate removed from Nearby cards**, as decided earlier.

## Several trades per Ustad, services chosen inside Help me write (2026-10-03)

- **Where the service choices come from:** the `service_templates` table (title, trade, hint), filtered to the Ustad's trades. They are added by migration, not from the admin panel. About 23 more were added (for example drain cleaning, wiring, AC repair, doors and windows, wood polish, window grills) and every trade has an "Other ... work" choice.
- **Several trades:** `worker_set_trades` saves the list (pgTAP `phase27`, 19 assertions). The app has a **My trades** card in Account (Ustads) and an **Add another trade** link on step 1 of Add a service; after saving, that trade's services appear. Registration still asks for one trade; the rest are added afterwards.
- **Help me write picks the service itself:** if no service is chosen yet, the chat starts by asking "What kind of work do you do?" with the services to tap. The chosen service goes back to the wizard with the draft, so nothing is asked twice.
- **Not done:** more than one trade at registration; an admin page to add or edit service types.
- **Fixed the same day:** see "Profile guards" below.

## Profile guards (2026-10-03)

Tested on a copy of the database, and both were real: a worker could approve themselves (`worker_profiles.approval_status`), and **any signed-in person could make themselves an admin** (`profiles.role`). Migration `20261003130000_profile_guards.sql` adds two triggers that refuse these changes when they come straight from the app:
- `profiles`: the role may only switch between customer and worker (never to or from admin), and the account status cannot be changed by the person.
- `worker_profiles`: approval status and review fields, verification, ratings and signals, commission suspension, the CNIC number and the trades cannot be edited directly, and a new row must start as pending with no rating.
Name, language, city, bio, rate, photo, location, availability and the uploaded files are still theirs to change. Admin functions and system functions (approve, reject, reviews, signals, resubmit, trades, availability, Hisab) run with owner rights, and an admin may change anything, so they are unaffected. pgTAP `phase28` (25 assertions); the whole suite passes (45 files, 1,375 assertions). Three older tests were adjusted: they set flags that are now on, expected one service type per trade, or edited the CNIC as the worker.

**To check on the live project:** the holes were open, so look for unexpected admins (Admin panel, Users) and for workers approved without a review.

## Services screen for Ustads: two tabs (2026-10-03)

An Ustad's bottom bar says **Services** and the screen has two tabs: **My services** (Add a service, and your own services as cards with status and Edit) and **Other services** (everyone else's, never your own, to look at). While signed in as an Ustad, other services say View instead of Request a quote and the screen asks to **Switch to Customer** first; the same on a service's detail page, which shows Edit on your own. Customers and guests still get one list called Browse services.

## Five changes after review (2026-10-04)

1. **Urdu font.** Urdu now uses Noto Naskh Arabic (about as tall as the English font, so nothing is clipped) with Urdu sizes close to the English ones. Jameel Noori needs its font file and licence; to use it, load it in `App.tsx` and change `fontFamilies.urdu` / `urduBold` in `theme/typography.ts` (and raise the Urdu line heights to about twice the size, since it is nastaliq).
2. **Help me write moved to the Describe step** (after the photos, voice and video of step 1) in both wizards. The AI writes **one** draft in the author's language, ignoring the media (it is only told how many are attached). The author edits it, and the other language is made **once**, on the Review step, with the approval tick. Server: `draft` returns single strings plus `source`; the request takes `attached`. The helper returns to the same wizard with `popTo(..., { merge: true })`, so step-1 media is kept.
3. **Customer location.** Post a job and Request a quote use the shared city/area picker with **Use my location** (map pin as fallback), starting on the profile city. Guests get it too.
4. **Microphone.** The helper has an in-app mic using the phone's own speech recognition (`expo-speech-recognition`, free), with a English / Urdu choice. Needs a **native rebuild** (config plugin added). The keyboard-mic tip is hidden on the web.
5. **Photo quality note.** Every uploaded photo shows a rounded note (good, too dark, too bright, a bit blurry, small), worked out on the phone from a 128px copy (`lib/imageQuality.ts`). It never blocks a photo.

Deploy order: the `ai-draft` function and the app must go together (the draft response shape changed; an older app expects both languages).

## Completion handshake (2026-10-04)

Finishing a job is now two steps. The Ustad taps **Work is done** (`worker_mark_work_done`, sets `jobs.worker_done_at` and tells the customer). The customer then **confirms** (`mark_job_completed`, now customer-only, status `completed`) or taps **Not finished yet** with an optional note (`customer_reject_completion`, clears the mark and tells the Ustad). The customer can also confirm at any time. If the customer does not answer for 48 hours (`app_settings.completion_auto_confirm_hours`), `auto_confirm_completions()` (cron, every 30 minutes) completes it and tells both. Payment, review and signals still start from `completed`, so they are unchanged. Migration `20261004100000_completion_handshake.sql`; pgTAP `phase29` (21 assertions); older tests that had the Ustad complete a job were changed to have the customer do it. **Not yet run against a database** (Docker was down): run the whole pgTAP suite once it is back.

## Role and view are separate (2026-10-04)

"Switch to Customer" used to rewrite `profiles.role`, so an Ustad looking around as a customer failed every rule that asks "is this a worker?" (no requests, no quotes, not listed). Now `role` stays `worker` and the chosen screen is stored in `profiles.active_view` (`customer` or `worker`; empty means the person's own role). Ustads whose role had been flipped are restored by the migration. Because an Ustad in the customer view must still act as a customer, every database rule that required `role = 'customer'` now accepts `customer` or `worker`. The app no longer lets a customer switch to the Ustad view, and a job's Ustad sees their controls whichever view they are in. Migration `20261004110000_profile_active_view.sql`, pgTAP `phase30` (6 assertions, not yet run: Docker was down).

## Guest nudge (2026-10-04)

A guest has no account, so nothing can tell them a quote arrived. Now the post screen and the "Jobs you posted" card explain this and offer **Create a free account**, the card shows "N quotes waiting" per job (read with the guest token, up to 5 jobs, refreshed every minute and when the app opens), and the Requests tab badge counts those quotes for guests. A signed-in customer sees none of it.

## Status timeline (2026-10-04)

Every job screen now starts with **Where this job is**: posted (or request sent) → Ustad sent a price → price accepted → Ustad on the way (only while live tracking is on) → Ustad says work is done → customer confirmed → customer paid → payment confirmed, job closed. Done steps are green, the current step is outlined, a cancelled job shows only "posted" and "cancelled", and a payment problem is flagged. Under it, **What happens next** tells the person looking what to do (the customer and the Ustad get different lines). English and Urdu. `lib/jobTimeline.ts` is the pure logic, `components/JobStatusTimeline.tsx` the card. The old four-step list in the on-the-way card is gone.
