# Chronicle Canvas iOS Wrapper

This is a **separate** iOS app wrapper for Chronicle Canvas.

It was created to keep the current web app and existing Google Play build safe while we prepare the iPhone build.

## What is in here

- Capacitor iOS wrapper that loads the hosted Chronicle Canvas app
- Native Apple subscription bridge for Home and Advanced memberships
- Codemagic configuration for TestFlight/App Store builds
- Separate Apple sync backend module that can later be merged into Firebase Functions

## What is intentionally not changed here

- the live website
- the Stripe web checkout
- the Google Play `.aab` files

## Local structure

- `capacitor.config.ts` — wrapper config
- `ios/` — generated native iOS project
- `server-sync/` — separate backend module for Apple subscription verification and notifications
- `codemagic.yaml` — Codemagic build recipe
- `APPLE_IOS_HANDOFF.md` — step-by-step operational handoff

## Current subscription model

- iPhone app uses **Apple auto-renewable subscriptions**
- website keeps **Stripe**
- user entitlements are meant to sync through the shared Firebase user record

## Before App Store submission

You still need to:

1. create the iOS app in App Store Connect
2. create the Apple subscription products
3. connect Codemagic to App Store Connect
4. merge and deploy the `server-sync/` module into the live Firebase backend
5. test purchase, restore, cancel, and renewal flows in Apple sandbox

