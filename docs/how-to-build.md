# How to Build Ustad

## Mobile app (Android) with EAS
Prerequisites: Expo account, `npm install -g eas-cli`, and `eas login` (once).

```bash
cd mobile
eas build --platform android --profile apk          # installable APK: download it and install it on any Android phone
eas build --platform android --profile production   # AAB, only for uploading to the Play Store
```
Profiles live in `mobile/eas.json`:

| Profile | Output | Use |
|---------|--------|-----|
| `apk` | APK | Install directly on a phone. This is the normal way to run the real app. |
| `production` | AAB | Play Store submission only (an AAB cannot be installed on a phone directly) |

Before the first build, set these so the installed app matches what you see locally: `GOOGLE_MAPS_API_KEY` (live tracking map), Firebase credentials for push (`eas credentials`), the feature flags in `how-to-run.md`, and `pg_cron` / `pg_net` enabled in Supabase.

Both profiles inject `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY`. The anon key is meant to be public; security comes from Row Level Security. Never put the `service_role` key in the app or in `eas.json`.

When the build finishes, open the URL printed in the terminal and download the file. EAS uploads from disk, so pushing to GitHub is not required.

## Admin panel (Next.js, static files)
The admin panel has no server code, so it is built as plain static files.
```bash
cd web-admin
npm run build      # writes the finished site into web-admin/out/
npm run typecheck
npm run lint
```
Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in the host's environment (or `.env.local`) **before** building, because `NEXT_PUBLIC_*` values are baked in at build time. The `out/` folder is the whole site: upload it to any static host.

**Hosting on Render (Static Site):** New -> Static Site, connect the GitHub repo, then set
- Root Directory: `web-admin`
- Build Command: `npm install && npm run build`
- Publish Directory: `out`
- Environment: the two `NEXT_PUBLIC_*` values above

Then add your custom domain in Render's Settings -> Custom Domains and create the DNS record Render shows you at your domain seller. Vercel, Netlify and Cloudflare Pages work the same way. Change the seeded admin password before making the site public.

## Database
Add a new file in `supabase/migrations/` named `YYYYMMDDHHMMSS_description.sql`, then push to `master`. The deploy workflow runs `supabase db push`. Never edit a migration that already ran; add a new one.

## CI checks
`.github/workflows/ci.yml` runs the mobile typecheck and the pgTAP database tests on pull requests and on pushes to `main`. The repo's default branch is `master`, so direct pushes to `master` do not trigger it (pull requests do).
