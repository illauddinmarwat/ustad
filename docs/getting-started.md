# Ustad — App, backend, tests, and releases

This doc answers: **where the backend runs**, **how the project ties to Docker**, **how to run the mobile app and tests**, and **how production / Android builds work**.

---

## What is the “backend”?

There is **no separate Node server in this repo**. The backend is **Supabase**:

- **PostgreSQL** (data, RLS, booking RPCs)
- **GoTrue Auth** (email/password in the Phase 1 app)
- **PostgREST** (table/RPC HTTP API)

The Expo app in `mobile/` talks to Supabase over HTTPS (or HTTP on device emulators pointing at localhost).

---

## Docker Desktop ≠ “already connected” to this repo

- **Docker “Engine running”** only means the Docker daemon can start containers.
- This repository is **wired to Docker** when you run the **Supabase CLI** from the **repo root** (`d:\Personal\ustad`, where [`supabase/config.toml`](../supabase/config.toml) lives). Then the CLI pulls images and creates containers (often named like `supabase_db_ustad`, `supabase_kong_ustad`, etc.).
- **Before** `supabase start`, the **Containers** list can be empty — that’s normal.

**Verify local backend:**

```powershell
cd d:\Personal\ustad
npx supabase start
npx supabase status
```

You should see API URL (`http://127.0.0.1:54321`), DB port, anon key, and **Docker Desktop** should list the Supabase stack containers.

Stop when done:

```powershell
npx supabase stop
```

---

## Where the backend runs (three modes)

| Mode | Backend location | Typical use |
|------|-----------------|-------------|
| **A — Fixtures** | None — fake session only | UI work, no Docker |
| **B — Local Supabase** | Containers on **your PC** (Docker) | Dev + **`supabase test db`** |
| **C — Hosted Supabase** | **Supabase Cloud** (`*.supabase.co`) | Sharing with testers, staging, **production API** |

Details for A and B: [`docs/local-development.md`](local-development.md).  
Schema, migrations, RPCs: [`supabase/README.md`](../supabase/README.md).

---

## Run the mobile app

### Prerequisites

- Node 20+
- Inside `mobile/`: **`npm ci`** or **`npm install`**

### Option A — No database (fastest)

```powershell
cd d:\Personal\ustad\mobile
copy env.fixture.sample .env
npm run start
```

Opens Expo dev tools; use Expo Go or an emulator. **No Supabase** is required.

### Option B — Local Supabase (real API on your machine)

1. Start Docker Desktop, then from **repo root**:

   ```powershell
   cd d:\Personal\ustad
   npx supabase start
   npx supabase status
   ```

2. Create `mobile/.env` with **no** `EXPO_PUBLIC_USE_FIXTURES`, and set:

   - `EXPO_PUBLIC_SUPABASE_URL` — use the URL from `supabase status` (see table below for Android emulator / phone).
   - `EXPO_PUBLIC_SUPABASE_ANON_KEY` — paste the **anon** key from `supabase status`.

| Where the app runs | URL to use |
|--------------------|------------|
| Web / iOS simulator (same machine) | `http://127.0.0.1:54321` |
| Android emulator | `http://10.0.2.2:54321` |
| Physical device on same Wi‑Fi | `http://<your-PC-LAN-IP>:54321` (router/firewall must allow it) |

3. From `mobile/`:

   ```powershell
   npm run start
   ```

### Option C — Hosted Supabase (staging / production API)

In the [Supabase dashboard](https://supabase.com/dashboard), create or open a project, apply migrations (SQL Editor or **`supabase db push`** after `supabase link` — see [`supabase/README.md`](../supabase/README.md)), then set in `mobile/.env`:

- `EXPO_PUBLIC_SUPABASE_URL` = project **URL**
- `EXPO_PUBLIC_SUPABASE_ANON_KEY` = project **anon** public key

Never commit real keys; use env files or CI secrets.

---

## Run tests

| What | Command | Where |
|------|---------|--------|
| TypeScript | `npm run typecheck` | `mobile/` |
| Database (pgTAP) | `npx supabase test db` | **repo root** — requires **`npx supabase start`** first so migrations are applied |

See also the root [`README.md`](../README.md).

---

## Production backend

- **Production data and auth** live in a **hosted Supabase project** (same schema: run [`supabase/migrations/`](../supabase/migrations/) via **`supabase db push`** or SQL Editor in order).
- You do **not** ship Docker to end users for the API; they use the **public HTTPS URL** of your Supabase project.
- Lock down CORS, rate limits, and keys in the Supabase dashboard; use **service role** only on the server, never in the app.

---

## Android APK (release build)

The app is **Expo (SDK 54)**. Release binaries are usually built with **EAS Build** (Expo Application Services).

1. Install EAS CLI: `npm i -g eas-cli`
2. Log in: `eas login`
3. In `mobile/`: `eas init` (creates `eas.json` if missing)
4. Configure **EAS secrets** or **build profile env** so these are set **at build time** (they are baked into the JS bundle):

   - `EXPO_PUBLIC_SUPABASE_URL`
   - `EXPO_PUBLIC_SUPABASE_ANON_KEY`
   - Do **not** set `EXPO_PUBLIC_USE_FIXTURES` for store builds.

5. Build Android:

   ```powershell
   cd d:\Personal\ustad\mobile
   eas build --platform android
   ```

   Use `--profile apk` for an installable APK. (An AAB for the Play Store is left for later.) See [Expo EAS Build docs](https://docs.expo.dev/build/introduction/).

**Note:** `mobile/eas.json` defines the `apk` profile. Local dev remains `npm run start`.

---

## Quick checklist

- [ ] Docker Desktop **running** (for local Supabase only)
- [ ] `npx supabase start` from **repo root** (local API)
- [ ] `mobile/.env` matches your mode (fixtures vs local vs hosted)
- [ ] `npm run start` from `mobile/`
- [ ] Tests: `npm run typecheck` + `npx supabase test db` (after local stack is up)

For deeper database-only options, keep using [`local-development.md`](local-development.md).
