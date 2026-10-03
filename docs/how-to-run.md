# How to Run Ustad

Ustad has three parts: the **mobile app** (`mobile/`), the **admin panel** (`web-admin/`) and the **database/backend** (Supabase, `supabase/`).

## Requirements
- Node.js 20+ and npm
- Expo Go on your phone (or an Android emulator)
- A Supabase project (only for "live" mode)

## Quick start (Windows)
From the repo root:

| Script | What it does |
|--------|--------------|
| `run-mobile.bat` | Starts the mobile app (`npx expo start`) |
| `run-admin.bat` | Starts the admin panel (`npm run dev`, http://localhost:3000) |
| `run-all.bat` | Opens both in separate windows |

Run `npm install` once inside `mobile/` and `web-admin/` first.

## Mobile app

```bash
cd mobile
npm install
npm run start
```
Scan the QR code with Expo Go, or press `a` (Android emulator) / `w` (web).

### Two modes
1. **Fixture mode** (no internet or database, sample data): copy `env.fixture.sample` to `.env` (it contains `EXPO_PUBLIC_USE_FIXTURES=1`).
2. **Live mode**: create `mobile/.env` with
   ```
   EXPO_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
   EXPO_PUBLIC_SUPABASE_ANON_KEY=<anon key>
   ```
   Do not set the fixture flag. (Logic: `mobile/src/config/env.ts`.)

### Useful commands
| Command | Purpose |
|---------|---------|
| `npm run typecheck` | TypeScript check |
| `npm test` | Jest unit tests |
| `npm run android` / `ios` / `web` | Start for a platform |

## Push notifications
In-app notifications (the bell on the home screen and the badge on the Applications tab) work with no setup. Push notifications to the phone need:
1. **A real device and a development build.** Expo Go on Android and the simulators cannot receive remote push; `registerForPush` quietly does nothing there.
2. **The EAS project id** in `mobile/app.config.ts` (`extra.eas.projectId`, already set). Push credentials are managed with `eas credentials`: FCM for Android (add the Firebase `google-services.json`) and APNs for iOS.
3. **`pg_net` enabled** in Supabase (Database -> Extensions). Without it the database still creates the in-app notification but sends no push.
4. **`pg_cron` enabled** (also under Extensions) for the scheduled jobs: expiring direct requests, flagging unconfirmed payments, expiring old posted jobs, and marking overdue commission (nightly). Without it none of these run, so overdue commission will never be flagged.
To test: sign in on the device, accept the notification permission, then trigger an event (for example send a direct request to that worker). The token is stored in `device_tokens`; check it with `select * from device_tokens;`.

## Turning on the new flows
Each new flow is behind a flag in `app_settings` and ships **off**. Turn them on in the Supabase SQL editor:
```sql
update app_settings set value = 'true' where key = 'direct_requests_enabled';  -- send a request from Nearby
update app_settings set value = 'true' where key = 'job_posting_enabled';      -- post a job, job board, quotes
update app_settings set value = 'true' where key = 'job_media_enabled';       -- photos on job posts (private bucket job-media)
update app_settings set value = 'true' where key = 'quote_upgrades_enabled';   -- quote price type, start date, sorting
update app_settings set value = 'true' where key = 'listing_quote_requests_enabled'; -- Request a quote from a service listing (needs direct_requests_enabled)
update app_settings set value = 'true' where key = 'ai_help_enabled';           -- Help me write (needs the ai-draft function and its secrets, see below)
```
Tunable settings (numbers): `direct_request_timeout_hours`, `direct_request_daily_limit`, `job_post_daily_limit`, `guest_job_hourly_cap`, `job_expiry_days`, `payment_confirm_days`, `commission_rate_pct`. `helpline_number` is text and is a placeholder until you set it.

## Help me write (AI)
The AI key never goes in the app. It lives in the Edge Function `ai-draft` (`supabase/functions/ai-draft`).
1. **With GitHub (set up):** the workflow `.github/workflows/deploy-functions.yml` sets the function secrets in Supabase and deploys `ai-draft`. It uses the GitHub secrets `SUPABASE_ACCESS_TOKEN` and `GROQ_API_KEY`, reads the project reference from `NEXT_PUBLIC_SUPABASE_URL`, and takes the model from a GitHub variable or secret `GROQ_MODEL` (default `openai/gpt-oss-120b`). It runs when `supabase/functions/**` changes on `master`, or by hand from the Actions tab (use that after changing the key or model).
   **Without GitHub:** in the Supabase Dashboard open Edge Functions, Secrets, add `GROQ_API_KEY` and `GROQ_MODEL`, and deploy with `supabase functions deploy ai-draft`. `supabase/functions/env.example` lists the names; a local copy goes in `supabase/functions/.env` (git-ignored).
2. The function itself is deployed by the same workflow (or the command above).
3. Turn on `ai_help_enabled` (Admin, Settings) and set the daily limits. Watch AI Usage in the admin panel.
Function tests run with Deno: `deno test supabase/functions/_shared/ai_test.ts`.

## Admin panel

```bash
cd web-admin
npm install
```
Create `web-admin/.env.local`:
```
NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
```
Then `npm run dev` and open http://localhost:3000. Sign in with an account whose profile `role` is `admin`. The live site is a static build hosted separately; see [how-to-build.md](how-to-build.md).

## Database
- **Hosted**: migrations in `supabase/migrations/` are pushed automatically by GitHub Actions when you push to `master` (`.github/workflows/deploy-supabase.yml`). It needs the repo secrets `SUPABASE_ACCESS_TOKEN` and `SUPABASE_PROJECT_REF`.
- **Local**: install the Supabase CLI, then `supabase start` and `supabase test db` (pgTAP tests in `supabase/tests/database/`).
- `docker-compose.yml` starts a plain Postgres 17 (port 5432) and pgAdmin (port 5050) for manual inspection only. It is not the Supabase stack.
- Test accounts: see `docs/seed-data/`.

More detail: [getting-started.md](getting-started.md), [local-development.md](local-development.md).
