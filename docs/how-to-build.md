# How to Build Ustad

## Mobile app (Android) with EAS
Prerequisites: Expo account, `npm install -g eas-cli`, and `eas login` (once).

```bash
cd mobile
eas build --platform android --profile preview      # installable APK for testing
eas build --platform android --profile production   # AAB for Play Store
```
Profiles live in `mobile/eas.json`:

| Profile | Output | Use |
|---------|--------|-----|
| `preview` | APK (internal distribution) | Sideload / testers |
| `production` | AAB | Play Store submission |

Both profiles inject `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY`. The anon key is meant to be public; security comes from Row Level Security. Never put the `service_role` key in the app or in `eas.json`.

When the build finishes, open the URL printed in the terminal and download the file. EAS uploads from disk, so pushing to GitHub is not required.

## Admin panel (Next.js)
```bash
cd web-admin
npm run build      # production build
npm run start      # serve the build on port 3000
npm run typecheck
npm run lint
```
Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in the host's environment (e.g. Vercel) **before** building, because `NEXT_PUBLIC_*` values are baked in at build time.

## Database
Add a new file in `supabase/migrations/` named `YYYYMMDDHHMMSS_description.sql`, then push to `master`. The deploy workflow runs `supabase db push`. Never edit a migration that already ran; add a new one.

## CI checks
`.github/workflows/ci.yml` runs the mobile typecheck and the pgTAP database tests on pull requests and on pushes to `main`. The repo's default branch is `master`, so direct pushes to `master` do not trigger it (pull requests do).
