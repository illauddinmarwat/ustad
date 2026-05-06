# WorkerzPk

Pakistan-focused two-sided labour marketplace (**React Native / Expo** + **Supabase**). Product docs live in Markdown at repo root and under `docs/implementation/`.

## Repo layout

| Path | Contents |
|------|-----------|
| `mobile/` | **Expo (SDK 54) + TypeScript** app — Phase 1 shell + navigation + Supabase client |
| `supabase/migrations/` | Postgres schema, RLS, booking RPCs, seed templates |
| `supabase/README.md` | How to apply SQL + RPC reference |
| `WorkerzPk-MVP-SinglePage.md` | MVP scope & flows |
| `docs/implementation/` | Phased engineering plan |

## Libraries (installed)

Inside `mobile/`, verified via `package.json`:

- `expo`, `react-native`, `react`
- `@supabase/supabase-js`
- `@react-navigation/native`, `@react-navigation/native-stack`
- `react-native-screens`, `react-native-safe-area-context`
- `@react-native-async-storage/async-storage`
- `react-native-url-polyfill`
- `expo-constants`

Run `npm install` in `mobile/` after clone.

## Quick start — app (**no cloud DB needed**)

```bash
cd mobile
copy env.fixture.sample .env   # creates .env with EXPO_PUBLIC_USE_FIXTURES=1 (no database)
npm run start
```

For **Docker + local Postgres** instead, see **`docs/local-development.md`**.

With cloud Supabase later, edit `.env`: remove `EXPO_PUBLIC_USE_FIXTURES` and add URL + anon key.

`npm run typecheck` runs `tsc --noEmit`.

## Quick start — database

Apply migrations to your Supabase project (SQL Editor or CLI). See **`supabase/README.md`**.

## Clarifications needed (before deep UI work)

1. **Supabase project** ready? (URL + anon key → `mobile/.env`)
2. **Auth for MVP builds:** Email + password via Supabase dashboard, Magic Link, or **Phone OTP** (OTP needs SMS provider + Supabase SMS config)?
