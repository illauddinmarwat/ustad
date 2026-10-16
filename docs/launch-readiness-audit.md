# Ustad: Google Play launch readiness audit

Audit date: 2026-10-16. Code state: `master` at `f5035b5`, working tree clean.

Three scans: (1) first-launch gaps, (2) UI uniformity, (3) multi-user capacity.
Items marked **BLOCKER** will get the app rejected or break it for real users on day one.

## What was and was not tested

| Scan | Method | Not covered |
|---|---|---|
| Static checks | `tsc --noEmit`, full Jest run, manifest and config review, source grep | Nothing on a real device |
| UI uniformity | Source scan of colors, fonts, radii, strings against `theme/tokens.ts` | No screenshots or on-device visual pass |
| Capacity | Throwaway local Postgres (Supabase image, 2 CPU, 2 GB) with all 76 migrations applied, then 22k users, 4k listings, 40k jobs, 60k quotes, 120k messages, 210k notifications. `pgbench` replayed the app's RPCs and queries as the `authenticated` role, so RLS was included. | Hosted Supabase was **not** load tested. PostgREST, Auth, Realtime and Edge Function limits are not measured. Production feature flags were not checked; a fresh migration leaves several off (see item 14). |

Nothing was written to production or committed.

---

## 1. First-launch gaps

### BLOCKERS

1. **No account deletion.** Play requires an in-app delete flow and a web page or URL for it. The code has no delete-account call and the Account screen has no delete row.
2. **No password reset.** Email and password login exists, but there is no "Forgot password". A user who forgets the password is locked out for good. (`AuthContext.tsx` has `signIn` and `signUp` only.)
3. **Push notifications will not work on Android.** There is no `googleServicesFile` in `app.config.ts` and no FCM credentials step. The app depends on pushes (job alerts, quotes, chat). Expo tokens are issued, but FCM delivery fails without Firebase setup.
4. **Privacy policy exists only inside the app.** Play Console needs a public privacy-policy URL and a Data safety form. The app collects location, camera, microphone, photos, CNIC images, phone numbers and a push token.
5. **Release signing and versioning are not production-ready.** `android/app/build.gradle` signs release builds with the debug keystore. That folder is git-ignored, so EAS would generate its own key, but `eas.json` has no `autoIncrement` for `versionCode` and no `submit` profile. Decide on EAS-managed signing and enroll in Play App Signing before the first upload.
6. **Tracking map crashes the app unless a Maps key is baked in.** The code guards this (`mapsEnabled`), but without `GOOGLE_MAPS_API_KEY` in the EAS env the live-tracking screen shows only the fallback.

### High

7. **Over-broad permissions in the generated manifest:** `SYSTEM_ALERT_WINDOW`, `READ_EXTERNAL_STORAGE`, `WRITE_EXTERNAL_STORAGE`. Play review flags these. Remove them with `blockedPermissions` in `app.config.ts`. `allowBackup="true"` should be off because it exposes the cached Supabase session.
8. **No error boundary anywhere.** One thrown render error white-screens the app with no recovery path.
9. **No offline or connectivity handling.** No NetInfo, no "you're offline" banner, no retry UI. In Pakistan, patchy mobile data is the normal case. The fetch layer swallows errors in many places, so users see empty states instead of "no connection".
10. **Email-only sign-up.** Pakistani users commonly lack or rarely check email. There is no phone OTP (`auth.sms.enable_signup = false`; OTP pricing is already deferred in the plan). If the production project has email confirmation on, Supabase's built-in mailer is capped at a few emails per hour project-wide, so sign-ups will stall. Set up custom SMTP, or confirm confirmation is off.
11. **No block or report-user UI is visible** for the user-generated content (chat, listings, media, voice). Play's UGC policy needs in-app reporting. An `abuse_reports` table exists and is referenced in two places; check it is reachable from chat and listings.
12. **App identity:** the display name is lowercase `ustad`, `app.json` is stale and different from `app.config.ts`, and there is no `android.versionCode`. Store listing assets (feature graphic, screenshots, content rating) also still need preparing.

### Medium

13. **CI never runs on pushes.** `ci.yml` triggers on `main`, but the repo branch is `master`. Only pull requests are checked.
14. **Feature flags differ between a fresh migration and production.** A clean migrate leaves `quote_upgrades_enabled`, `phase3_ranking_enabled`, `phase5_multi_city_enabled` and others off. If production was set by hand, record the real values in a migration so a rebuild matches.
15. **Dark mode is half-supported:** `userInterfaceStyle: 'automatic'` but the app has only a light palette. The system dialogs and status bar may turn dark over a light UI. Set it to `'light'` or ship a dark theme.
16. **Guest-job cap is global.** `post_job` allows 30 guest posts per hour for the whole app (`guest_job_hourly_cap`). One busy hour at launch blocks all guest posting. Per-user limit is 10 posts per day.
17. **AI helper limit is 5 per day per user, 2 per guest.** Fine for cost control, but users hitting it need a clear message.
18. **Hard-coded English in places:** e.g. "Featured" in `ServiceCard.tsx`. The rest of the app is bilingual, so these stand out.

### Test health

- `tsc --noEmit`: 1 error, `demo/DemoApp.tsx` (`independent` prop not in current React Navigation types). Not shipped, but it fails `npm run typecheck` in CI.
- Jest: 624 of 626 tests pass. Two failures are 5 s timeouts under parallel load: `ServicesScreen` (guest list) and `NotificationsScreen` (empty state). Likely flaky rather than broken, not confirmed in isolation.

---

## 2. UI uniformity

The screens are largely on-theme. Everything routes through `theme/tokens.ts` (green palette), shared `Button`, `Card`, `Chip`, `Banner`, `BiText`, and the bilingual English/Urdu pattern is consistent. No stray blue-theme leftovers or system `Button` usage found.

Deviations, none severe:

| Issue | Where | Fix |
|---|---|---|
| Status ink colors hard-coded and duplicated (`#065F46`, `#92400E`, `#991B1B`, `#075985`, `#D1FAE5`) | `Chip`, `Banner`, `Avatar`, `Primitives`, `ServiceCard`, `PhotoAttach`, `AiHelpButton` | Add `accentInk`, `warningInk`, `dangerInk`, `infoInk` tokens |
| `#fff` instead of `colors.textInverse` | About 20 places (badges, icons, Recorder, WorkerHome) | Replace with the token |
| Off-scale radii (6, 8, 11, 12, 20, 22, 28, 32) vs `radius.xs..xl` | `ServiceCard`, `PhotoAttach`, `ListingWizard`, `JobDetail`, `GuestJobsCard`, `PendingApprovalGate`, `RegistrationDoneModal` | Snap to the scale or add tokens |
| Raw `fontSize` / `fontWeight` overrides next to custom font families | `WorkerHome` KPI, `Earnings` amount, badges, `ServiceCard` initials, `TabBarLabel` | Use `typography.*` variants. On Android, `fontWeight` with a custom family often falls back to the regular face. |
| Dark `#111` / `#000` in modals | `ImageEditorModal`, `VideoRecorder` | Acceptable for camera and image editing; note only |
| Extra shadows with `#000` | `JobDetailScreen` FAB | Use `theme/shadows.ts` |

A real device pass was not done. Do one before release: Urdu RTL layouts, small 320 dp phones, 200% font scale, and keyboard overlap on every form.

---

## 3. Capacity on the current setup

### Method and honesty note

The numbers come from a 2-vCPU, 2 GB Postgres with the app's real schema, indexes and RLS. This is close to a Supabase Free or Small instance. It measures database cost per request only. Real limits will also include PostgREST, the pooler, Auth and Realtime. `pgbench` clients have no think time, so they are heavier than real users.

Workload mix: 35% listing browse, 20% notifications, 15% my jobs and chat, 10% nearby workers, 10% job board, 5% worker quotes, 5% post job.

### Results

| Concurrent clients | Mixed throughput | Listing browse avg | Nearby avg | Send quote avg | Notifications avg |
|---|---|---|---|---|---|
| 10 | 22 req/s | 1.2 s | 148 ms | 88 ms | 18 ms |
| 30 | 19 req/s | 4.1 s | 491 ms | 514 ms | 25 ms |
| 60 | 19 req/s | 7.5 s | 790 ms | 975 ms | 78 ms |
| 90 | 8.6 req/s | 23.8 s | 1.7 s | 4.0 s | 144 ms |
| 200 | failed | | | | `too many clients already` (default 100 connections) |

Throughput stops growing at about **20 requests per second** and then collapses. No errors under 90 clients; the failure mode is latency.

### Root cause: listing browse is O(number of listings)

- `rank_listings_v2`, `rank_listings_with_boosts` and `phase5_discover_listings` score and sort **every** active listing on **every** call (full scan, then `ORDER BY score LIMIT n`). There is no cache and no paging.
- The `worker_service_listings` RLS policy calls `_worker_active(worker_id)` per row, a function that does a lookup of its own per row.
- Measured at only 4,000 listings: 25,600 buffer hits and about 34 ms for one discover call. It grows linearly: expect about 10x worse at 40,000 listings.
- The home and services screens call this on open, so it is the single hottest path.

### Realistic user capacity

Assuming an active user sends one request every 6 to 10 s, and 5 to 10% of daily users are online at once:

| Setup | Concurrent active users | Daily users before it feels slow |
|---|---|---|
| Today (Free or Small, ~20 req/s) | about 120 to 200 | about 1,500 to 3,000 |
| After fixing browse (est. 5 to 10x) | about 600 to 1,500 | about 8,000 to 20,000 |

Estimates, not guarantees. They scale with CPU, so a larger compute add-on shifts them proportionally.

### Other limits to check (from Supabase plan docs, verify against your plan)

- **Realtime:** every open job screen holds a channel (`job-live-<id>`) on top of notification polling. Free allows about 200 concurrent Realtime connections, so about 200 users online at once is a hard stop on Free.
- **Background polling load:** notifications every 30 s, chat thread every 8 s, job live fallback every 15 s, approval gate every 30 s. At 1,000 online users that is about 35 to 80 cheap requests per second before anyone taps anything.
- **Auth:** the built-in mailer is heavily rate limited; sign-up bursts at launch will hit it if confirmation is on.
- **Edge function AI:** Groq-backed with per-user daily limits; its provider rate limit applies to everyone.
- **Database connections:** raw connections cap at 100 locally; hosted tiers vary. The app uses PostgREST, which pools, so this matters mostly for admin or scripts.

### What I'd fix before launch, in order

1. Cache or materialize the listing ranking (a table refreshed every few minutes, or a view with an index on `score`), and page the results. Biggest single win.
2. Make `_worker_active` a join or a column on the listing (denormalize `worker_active`) so RLS does not look up a profile per row.
3. Add a cheap guest browse path that skips ranking when there is no filter.
4. Check Realtime: use one notification channel per user, not polling plus channels, and drop the job-live channel on screen blur.
5. Re-run this test against a staging Supabase project with the real tier and the PostgREST layer in the loop (k6 or Artillery over HTTPS), once step 1 is done.

---

## Suggested launch order

1. Blockers 1 to 6 (account deletion, password reset, FCM, public policy URL, signing and versioning, Maps key).
2. High items 7 to 12 (permissions, error boundary, offline banner, SMTP or phone auth, report-user, store assets).
3. Capacity fixes 1 and 2 above, then a staging load test.
4. Fix CI branch trigger and the `demo/` type error.
5. Tokenize the UI deviations and do a device pass.
6. Release to the Play **internal testing** track, then closed testing, before production.

---

## Fix status (updated 2026-10-16)

| Item | Status |
|---|---|
| 1 Account deletion | Done: `delete_my_account()` migration, in-app row, public `/delete-account` page. Tested on a scratch DB. |
| 2 Password reset | Done in app (emailed code). **Needs the Supabase "Reset password" email template to include `{{ .Token }}`.** |
| 3 FCM | Config hook added (`GOOGLE_SERVICES_JSON` file secret or `mobile/google-services.json`). **Needs a Firebase project and FCM credentials uploaded to EAS.** |
| 4 Versioning | Done: `versionCode`, remote app version source, `autoIncrement`, internal-track submit profile. |
| 5 Permissions | Done: three permissions blocked, `allowBackup` off, light-only UI style. |
| 4 (privacy URL) | Done: `/privacy` page in the admin site. Deploy it and set `NEXT_PUBLIC_SUPPORT_EMAIL`. |
| Capacity: browse | Done: `listing_rank_cache` (refreshed every 2 min by pg_cron, live fallback). Mixed throughput on the same test rose from about 20 to about 55 req/s; ranking call 28 ms to 4 ms; no collapse at 90 clients. **Needs pg_cron enabled on the hosted project**, otherwise it falls back to a 2x faster live query. |
| CI branch, demo type error | Done. `tsc` is clean. |

Also done: `nearby_workers` now uses a bounding box and a partial index on `(lat, lng)`. Results are identical to the old function on 20,000 workers across 5 cities (hash-compared). The gain is small and honest: about 5 ms to 1 ms away from any city, and unchanged (about 18 ms) in a city holding 4,000 workers, where the cost is the working-hours check and the sort. The earlier 135 ms was queueing under load, not the query itself. The existing pgTAP nearby tests were not re-run against it.

UI uniformity: status ink colors are now tokens (`accentDeep`, `warningDeep`, `dangerDeep`, `infoDeep`, `primaryTint`), every `#fff` in components and screens uses `colors.textInverse`, exact-match radii use `radius.*`, and the hard-coded "Featured" badge uses the translation. `tsc` and all 628 tests pass. Left as is on purpose: dark backgrounds in the camera and image editor, the FAB shadow, odd radii (8, 11, 12) and raw font sizes (changing them shifts layouts, so they need an on-device look).

Error boundary (item 8) and offline banner (item 9) are in: `ErrorBoundary` wraps the whole app with a bilingual retry screen, and `OfflineBanner` shows a warning when a 20-second probe of the Supabase health URL fails or times out. Both have unit tests (633 tests pass); neither was seen on a device. The boundary only logs to the console, so add a crash reporter (for example Sentry) before launch to see real crashes. Pages that swallow fetch errors still show empty states while offline; the banner explains why but does not retry them.

Report a problem (item 11): a shared `ReportSheet` (six reasons plus an optional note, bilingual) now files into the existing `abuse_reports` queue from the job messages sheet (replacing the one-tap fixed-reason report), the pre-quote chat screen and the listing page. Stored as `code: note`, e.g. `abuse: he shouted at me`. 637 tests pass; not yet seen on a device. Reporting a guest customer files with no user id, only the job. There is no block-user feature. Gap: reports are only visible in the mobile Admin screen (open reports, read-only list of 20). The web admin has no reports view and nothing can mark a report resolved or dismissed, so someone has to be able to act on them before launch.

Round 3 (all tested, **migration `20261016130000_reports_and_client_errors.sql` not yet pushed**):
- **Admin reports:** web admin has a "User reports" page (open, resolved, dismissed, all; resolve or dismiss with a note, reopen, suspend the reported user, shows how many reports a person has). Backed by `admin_list_abuse_reports` and `admin_resolve_abuse_report`, admin-only.
- **Crash reporting:** no third-party service. The app sends uncaught errors and render crashes to `log_client_error` (deduped per minute on the device, capped at 30 per user and 300 signed-out per hour on the server, 30-day retention). The web admin "App errors" page groups them by message with counts, users, platform and version. It cannot see native crashes (a process killed by the OS, an out-of-memory kill); Play Console's Android vitals covers those.
- **Performance:** polling (notifications, job chat, live job fallback, approval gate, guest quotes, the offline probe) now ticks only while the app is in the foreground. Checked and left alone: the listing RLS per-row `_worker_active` call only costs anything on the unfiltered fallback query in `ServicesScreen`, every other listing query is by id or worker, so it is not a launch problem. Realtime is one channel per open job page only (not per user), so the 200-connection Free limit I flagged earlier is much less of a concern than I said: it caps simultaneous open job pages, not signed-in users.
- **Tests:** pgTAP now 1,442 assertions, 0 failures across all 77 migrations on a fresh database (new file `phase31_launch_hardening_seeded.test.sql` with 39 assertions covering deletion, reports, error logging, the rank cache and nearby; the two stale phase15 assertions were removed because workers can now post and claim jobs). Jest 643 tests pass, `tsc` clean for mobile and web-admin.

Still open: worker-listing RLS calls `_worker_active` per row, the Realtime and polling review, items 7 to 12 beyond permissions, UI token cleanup, and a staging load test over HTTPS.

Test note: the pgTAP suite passes except `phase15_job_posting_seeded` (a worker can now post a job, so its "a worker cannot post a job" and "cannot claim a guest job" assertions are out of date). Not caused by these changes.
