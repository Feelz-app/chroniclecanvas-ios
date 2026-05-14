# Chronicle Canvas Apple Subscription Sync Module

This folder is a **separate backend module** for the iOS app. It is not live until you merge it into the Firebase Functions codebase and deploy it.

## Exposed endpoints

1. `syncAppleSubscription`
   - called by the iOS wrapper after a purchase, restore, or entitlement refresh

2. `appleServerNotifications`
   - target for App Store Server Notifications V2

## Expected environment variables

- `APPLE_BUNDLE_ID=com.chroniclecanvas.app`
- `APPLE_IAP_ENVIRONMENT=Sandbox` or `Production`
- `APPLE_APP_STORE_APP_ID=<numeric app id once Apple assigns it>`
- `APPLE_ROOT_CA_PATHS=/workspace/certs/AppleRootCA-G3.cer,/workspace/certs/AppleRootCA-G2.cer`

### Optional, if you later call the full App Store Server API

- `APPLE_API_KEY_ID`
- `APPLE_API_ISSUER_ID`
- `APPLE_API_PRIVATE_KEY`

## Important merge note

The current live Stripe webhook code writes directly to the `plan` field.

For the cleanest cross-platform entitlement model, when you merge this module into the live backend you should also start storing:

- `stripePlan`
- `applePlan`
- `effectivePlan`

This module already writes `applePlan` and recalculates an `effectivePlan`, but your live Stripe path will need the same pattern before production so Apple and Stripe do not stomp each other.

