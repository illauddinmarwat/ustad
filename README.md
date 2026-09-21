# Ustad

## What is this app?

**Ustad** is a Pakistan-focused **two-sided marketplace** for local skilled work: customers find workers (or post jobs), and workers offer services, quote jobs, and get hired. The mobile app is the primary client; **Supabase** (Postgres + Auth + APIs) is the backend.

The product supports three ways to get work done (see [`docs/features.md`](docs/features.md) for everything the app can do): the two flows below, plus **direct requests** (a customer sends a request to one chosen worker from Nearby). Payment is cash, with Ustad's commission tracked per worker.

- **Job-led:** a customer posts a need → workers quote → customer hires → work completes on a shared **job** record (chat, status, reviews).
- **Service-led:** workers publish **listings** from admin-defined **service templates** → customers browse, apply, worker accepts → customer confirms → same **job** spine as above.

For full MVP scope, flows, and data model, see [`docs/Ustad-MVP-SinglePage.md`](docs/Ustad-MVP-SinglePage.md). High-level vision and roadmap: [`docs/Ustad-Product-Blueprint.md`](docs/Ustad-Product-Blueprint.md).

## How does it work?

1. **Sign in** with Supabase **email + password** (role: customer, worker, or admin where enabled).
2. **Customers** use **Home / Services / Jobs / Account** (and related screens) to browse listings, post or track jobs, message, and manage their profile.
3. **Workers** use overlapping tabs plus **applications**, onboarding, and listing flows tied to the same backend.
4. **Data** (jobs, listings, messages, profiles) lives in **Postgres** behind Supabase; the app uses the **anon key** and Row Level Security (RLS) as designed in `supabase/migrations/`.

Phased engineering notes and checklists live under [`docs/implementation/`](docs/implementation/README.md). Deeper setup (Docker, cloud Supabase, tests): [`docs/getting-started.md`](docs/getting-started.md) and [`docs/local-development.md`](docs/local-development.md).

## Tech stack and repo layout

| Area | Stack / path |
|------|----------------|
| Mobile | **Expo (SDK 54)** + **React Native** + **TypeScript** in [`mobile/`](mobile/) |
| Backend | **Supabase** — SQL migrations in [`supabase/migrations/`](supabase/migrations/), notes in [`supabase/README.md`](supabase/README.md) |
| Docs | Product + MVP + runbooks in [`docs/`](docs/); app overview in [`docs/mind-map.md`](docs/mind-map.md); [features](docs/features.md), [run](docs/how-to-run.md), [build](docs/how-to-build.md), [admin panel](docs/admin-panel.md), [API reference](docs/api-reference.md) |

Useful scripts from `mobile/` (after `npm install`):

- `npm run start` — Expo dev server  
- `npm run typecheck` — TypeScript  
- `npm test` — Jest unit tests  

Database tests (with Supabase CLI + local stack): from repo root, `supabase test db` (see `supabase/tests/database/`). Every feature has structural tests and seeded-user tests (real people acting under the app's database roles); 971 assertions pass on a clean database.

## How to run builds

### Local development (no installable APK)

From the repo root:

```bash
cd mobile
```

**Option A — fixtures only (no live database):**

```bash
copy env.fixture.sample .env
npm run start
```

(On macOS/Linux, use `cp env.fixture.sample .env`.)

**Option B — real Supabase:** put `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` in `mobile/.env` (do not commit `.env`). Remove fixture flags if you use a live project.

Scan the QR code in the terminal with **Expo Go**, or press `a` for an emulator if configured.

### EAS cloud builds (installable Android binary)

Prerequisites: [Expo](https://expo.dev) account, [`eas-cli`](https://docs.expo.dev/build/setup/) (`npm install -g eas-cli`), and once per machine `eas login`.

From **`mobile/`** (where `eas.json` and `app.config.ts` live):

```bash
cd mobile
eas build --platform android --profile apk
```

- **`apk`** builds an installable **APK**: download it and install it on any Android phone. Defined in [`mobile/eas.json`](mobile/eas.json).
- Play Store publishing (an AAB, profile `production`) is left for later.

When the build finishes, open the URL printed in the terminal and download the artifact. You do **not** have to push to GitHub for a local `eas build`; EAS uploads your current project from disk. Pushing is still recommended for history and any CI that builds from Git.

For iOS or credential questions, see [EAS Build](https://docs.expo.dev/build/introduction/) and [`docs/getting-started.md`](docs/getting-started.md).
