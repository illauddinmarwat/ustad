# Google Cloud Vision API key restriction

The mobile app reads `GOOGLE_VISION_API_KEY` from `.env` (surfaced via Expo `extra`). That key is bundled into the client — **restrict it in Google Cloud** before any production rollout.

## Steps (Google Cloud Console)

1. Open **APIs & Services** → **Credentials** → select your API key.
2. Under **Application restrictions**:
   - **Android apps**: add your package name `com.ustad.mobile` and the SHA-1 of your release (and debug) signing cert.
   - **iOS apps**: add your bundle ID `com.ustad.mobile`.
   - For **Expo web**, optionally add **HTTP referrers** for your hosted domain only (not `*`).
3. Under **API restrictions**, choose **Restrict key** → enable only **Cloud Vision API**.
4. Save, then redeploy the app and smoke-test OCR from a device.

## Operational notes

- Rotating the key requires updating `mobile/.env` and rebuilding the app.
- Keep using the `phase3_ocr_enabled` flag in `app_settings` so OCR can be disabled instantly without a store release.
- Add per-worker or per-IP rate limiting (e.g. Edge Function proxy) if abuse becomes an issue; the app currently calls Vision directly from the client.
