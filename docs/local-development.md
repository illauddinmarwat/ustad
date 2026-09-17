# Local development — database options

**Start here for the full picture** (Docker vs cloud, tests, production, Android): [`getting-started.md`](getting-started.md).

You can progress **without** a hosted Supabase project in two ways.

## Option A — Fixture mode (no Docker, no network DB)

Best for pure **UI / navigation** work.

1. In `mobile/`, copy a fixture env file:

   ```bash
   copy env.fixture.sample .env
   ```

   (`env.fixture.sample` sets `EXPO_PUBLIC_USE_FIXTURES=1`.)

2. `npm run start`

The app uses a **fake session** plus `src/dev/fixtures.ts` sample templates/listings. No Postgres process runs.

---

## Option B — Local Supabase (Docker Desktop)

Runs real Postgres + Auth + Studio on your machine (**same migrations** as production later).

### Prerequisites

- [Docker Desktop](https://docs.docker.com/desktop/) for Windows, running.

### Commands (repo root)

```powershell
cd d:\Personal\ustad
npx supabase@latest start
```

`start` brings up the stack and applies migrations from `supabase/migrations/`. Use `npx supabase migration list` if you need to confirm applied versions.

Get API URL and anon key:

```powershell
npx supabase@latest status
```

Put them in `mobile/.env`. **URLs by device:**

| Where you run the app | `EXPO_PUBLIC_SUPABASE_URL` |
|------------------------|-----------------------------|
| iOS Simulator          | `http://127.0.0.1:54321` |
| Android Emulator       | `http://10.0.2.2:54321` |
| Physical phone (Expo Go) | `http://<your-PC-LAN-IP>:54321` |

The **local anon JWT** is the standard Supabase demo key printed by `supabase status` (use that value exactly).

Do **not** set `EXPO_PUBLIC_USE_FIXTURES` when using local Supabase.

---

## Hosted Supabase (later)

Replace `.env` with your project URL + anon key from the Supabase dashboard. See `supabase/README.md`.
