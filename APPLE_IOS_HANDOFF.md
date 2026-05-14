# Chronicle Canvas iOS Build Handoff

This folder is a separate iOS wrapper build for Chronicle Canvas. It does **not** touch:

- the live web app at `https://chroniclecanvas.us`
- the existing Firebase hosting setup
- the Android `.aab` files already used for Google Play

## What this wrapper does

- loads the hosted Chronicle Canvas web app inside an iOS Capacitor wrapper
- intercepts paid-plan actions on iPhone so they use Apple subscriptions instead of Stripe
- keeps Stripe on the web
- prepares a server-sync module so Apple subscriptions can update the same Firebase user records that the web app reads

## Important reality

Cross-platform entitlement sync requires **one backend deploy later**. That backend code is included in:

- `server-sync/`

It is intentionally separate so the current live web repo stays untouched until you decide to merge it.

## Product IDs expected in App Store Connect

Create these **auto-renewable subscriptions** under the app:

1. `com.chroniclecanvas.app.home.monthly`
2. `com.chroniclecanvas.app.advanced.monthly`

Recommended mapping:

- `Home` -> Chronicle Canvas Home plan
- `Advanced` -> Chronicle Canvas Advanced plan (marketed in-app as Business Lite when needed)

## Apple-side setup you will still need

1. Create the iOS app in App Store Connect with bundle ID:
   - `com.chroniclecanvas.app`
2. Create the two auto-renewable subscriptions above.
3. Create an App Store Connect API key for server verification.
4. Configure App Store Server Notifications V2 later to point at:
   - `https://us-central1-timeline-builder-a5292.cloudfunctions.net/appleServerNotifications`
5. Download Apple root certificates for server-side JWS verification.

## Codemagic environment variables/group

Create a Codemagic environment group called:

- `app_store_connect`

Add:

- `APP_STORE_CONNECT_PRIVATE_KEY`
- `APP_STORE_CONNECT_KEY_IDENTIFIER`
- `APP_STORE_CONNECT_ISSUER_ID`

Codemagic should also be connected to your Apple Developer account so it can fetch signing assets for:

- `com.chroniclecanvas.app`

## Build entrypoint

Codemagic uses:

- `codemagic.yaml`

Workflow name:

- `ios-testflight`

## Current native behavior

- plan buttons become **Subscribe with Apple** inside the iPhone app
- billing portal actions become **Manage Apple Subscription**
- the app reads the signed-in Firebase web session from local storage in the hosted page
- the native bridge sends that session token to the Apple sync endpoint

## What to upload to GitHub

Upload this whole folder as its own repo, or as a new folder in your existing mobile repo:

- `chroniclecanvas-ios/`

## What not to upload publicly

If you later add real Apple key material, never commit:

- `.p8` private keys
- downloaded Apple root cert bundles you consider sensitive
- local secret env files

