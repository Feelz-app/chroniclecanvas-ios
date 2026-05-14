# Codemagic Setup

This is the exact setup path for the Chronicle Canvas iOS wrapper.

## 1. Push this folder to GitHub

Use this folder as the repo root:

- `chroniclecanvas-ios/`

The important files are already included:

- `codemagic.yaml`
- `capacitor.config.ts`
- `ios/`
- `server-sync/`

## 2. Connect the repo in Codemagic

In Codemagic:

1. Add application
2. Choose GitHub
3. Select the repo that contains this iOS folder
4. Let Codemagic detect `codemagic.yaml`

## 3. Create the environment group

Create a group named:

- `app_store_connect`

Add:

- `APP_STORE_CONNECT_PRIVATE_KEY`
- `APP_STORE_CONNECT_KEY_IDENTIFIER`
- `APP_STORE_CONNECT_ISSUER_ID`

## 4. Connect Apple Developer signing

Codemagic needs access to the Apple Developer account that owns:

- `com.chroniclecanvas.app`

Let Codemagic manage signing automatically if possible.

## 5. Use this workflow

Workflow name:

- `ios-testflight`

## 6. Build output

Codemagic will build:

- signed `.ipa`
- TestFlight submission

## 7. Before the first real build

Make sure App Store Connect already has:

- the app with bundle ID `com.chroniclecanvas.app`
- the two subscription products
- tax/banking/contracts handled on Apple’s side

