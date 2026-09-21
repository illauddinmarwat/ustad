# How to Build Ustad

## Mobile app (Android) with EAS
Prerequisites: Expo account, `npm install -g eas-cli`, and `eas login` (once).

```bash
cd mobile
eas build --platform android --profile apk    # installable APK: download it and install it on any Android phone
```
The `apk` profile in `mobile/eas.json` builds a real release app. Play Store publishing (an AAB file, profile `production`) is left for later; you do not need it to install and use the app.

Before the first build, set these so the installed app matches what you see locally: `GOOGLE_MAPS_API_KEY` (live tracking map), Firebase credentials for push (`eas credentials`), the feature flags in `how-to-run.md`, and `pg_cron` / `pg_net` enabled in Supabase.

The profile injects `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY`. The anon key is meant to be public; security comes from Row Level Security. Never put the `service_role` key in the app or in `eas.json`.

When the build finishes, open the URL printed in the terminal and download the file. EAS uploads from disk, so pushing to GitHub is not required.

## Admin panel (Next.js, static files)
The admin panel has no server code, so it is built as plain static files. Any web hosting can serve it, including ordinary shared hosting; no Node server is needed.
```bash
cd web-admin
npm run build      # writes the finished site into web-admin/out/
npm run typecheck
npm run lint
```
Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` (in `web-admin/.env.local`) **before** building, because `NEXT_PUBLIC_*` values are baked in at build time. The `out/` folder is the whole site.

**Putting it on shared hosting (cPanel or similar), on a subdomain:**
1. In the hosting control panel, create a subdomain such as `admin.yourdomain.com`. It gets its own folder (for example `public_html/admin`). Until you have your own domain, use a subdomain of a domain you already have on that hosting.
2. On your computer run `npm run build` inside `web-admin`.
3. Upload the **contents** of `web-admin/out/` (not the `out` folder itself) into the subdomain's folder, using the File Manager or FTP. Include the hidden `.htaccess` file; it makes the site show its own 404 page and never list folders.
4. Turn on the free SSL certificate (AutoSSL / Let's Encrypt) for the subdomain so logins use HTTPS. The `.htaccess` in the build already forces HTTPS, so the certificate must work before you deploy.
5. Open `https://admin.yourdomain.com` and sign in with an admin account.

To update the site later: rebuild and upload `out/` again, replacing the old files. When you buy your own domain, add it in the hosting panel (or point its DNS at the hosting) and rebuild only if the Supabase values change; the site itself does not depend on its address.

Change the seeded admin password before making the site public. Vercel, Netlify, Cloudflare Pages and Render can host the same `out/` folder if you ever prefer one of them.

**Automatic deploy (GitHub Actions).** `.github/workflows/deploy-admin.yml` builds the site and uploads `web-admin/out/` over FTPS whenever a push to `master` changes `web-admin/`; you can also run it by hand from the Actions tab. It needs these repository secrets (Settings -> Secrets and variables -> Actions):

| Secret | Value |
|--------|-------|
| `FTP_SERVER` | the FTP host, for example `ftp.koderkids.pk` (use a name that resolves publicly; the name shown in cPanel may not) |
| `FTP_USERNAME` | the FTP account, for example `ustad@frontend.koderkids.pk` |
| `FTP_PASSWORD` | that account's password |
| `FTP_DIR` | `/` (the account is already limited to the site's folder) |
| `NEXT_PUBLIC_SUPABASE_URL` | your Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | the public anon key |

The FTP account should be created in cPanel with its directory set to the site's folder only. The action uploads changed files and removes files it uploaded earlier; it overwrites same-named files, so the folder must be reserved for the admin panel. If a run fails with `ENOTFOUND` the server name does not resolve; with a certificate or TLS message, the host's certificate does not match the name.

Currently live at https://frontend.koderkids.pk (HTTPS is forced by the `.htaccess` in the build).

## Database
Add a new file in `supabase/migrations/` named `YYYYMMDDHHMMSS_description.sql`, then push to `master`. The deploy workflow runs `supabase db push`. Never edit a migration that already ran; add a new one.

## CI checks
`.github/workflows/ci.yml` runs the mobile typecheck and the pgTAP database tests on pull requests and on pushes to `main`. The repo's default branch is `master`, so direct pushes to `master` do not trigger it (pull requests do).
