# Detox E2E (optional)

End-to-end tests are **not** run in CI by default: this Expo app needs native projects (`ios/` / `android/`) from `npx expo prebuild` before Detox can build a binary.

## Prerequisites

- macOS with Xcode (for iOS simulator), or Android SDK for Android.
- After prebuild: `cd mobile && npx expo prebuild`
- Install pods (iOS): `cd ios && pod install`

## Install

From `mobile/`:

```bash
npm install
```

Detox CLI is invoked via `npx detox`.

## Configuration

- `.detoxrc.cjs` — app binary path and build command (update paths after prebuild if your scheme name differs).
- `e2e/jest.config.js` — Jest runner for Detox.
- `e2e/smoke.e2e.ts` — launches the app and asserts the auth screen is visible.

## Run (iOS example)

```bash
cd mobile
npx detox build --configuration ios.sim.debug
npx detox test --configuration ios.sim.debug
```

## Environment gate

Tests use `describe.skip` unless `RUN_E2E=1` is set, so `npm test` (Jest unit tests) stays unaffected:

```bash
RUN_E2E=1 npx detox test --configuration ios.sim.debug
```

Tune selectors in `e2e/smoke.e2e.ts` to match your actual UI copy (e.g. "Sign in").
