# Street Knowledge — native apps (Android + iOS) via Capacitor

This folder wraps the Street Knowledge web app (repo `docs/`) as native apps. The PWA stays as it is; `scripts/copy-web.sh`
copies it into `www/` and adds `native-shim.js`, which only runs inside the app:
- location through `@capacitor/geolocation` (falls back to the browser API)
- voice guidance through `@capacitor-community/text-to-speech` (Android WebView has no speechSynthesis)
- tel:/website links open outside the app; the service worker is not registered in the app
- invite links point to the GitHub Pages URL

App id: `com.paynelessservices.mycargps` · name: **Street Knowledge**

## Repo layout
```
docs/                    <- PWA (GitHub Pages)
native/                  <- this folder
.github/workflows/       <- copy from native/repo-root/.github/workflows/ (android.yml, ios.yml)
```

## Build Android locally (JDK 21 + Android SDK 35)
```
npm ci
WEB_SRC=../docs npm run sync        # copy web + npx cap sync
cd android && ./gradlew assembleDebug                    # app/build/outputs/apk/debug/app-debug.apk
./gradlew assembleRelease bundleRelease                  # needs keys/keystore.properties (see below)
```
Release signing reads `keys/keystore.properties` (storeFile, storePassword, keyAlias, keyPassword), or the path in `$MYCARGPS_KEYSTORE_PROPS`.
`keys/` is never committed.
Version: `VERSION_CODE` / `VERSION_NAME` env vars (default 1 / 1.0.0).

## iOS (needs macOS + Xcode 16)
```
npm ci && WEB_SRC=../docs npm run sync && npx cap open ios
```
In Xcode, set your Team under Signing & Capabilities, then Product > Archive > Distribute (App Store Connect / TestFlight).
CI (`ios.yml`) only checks that the app compiles, unsigned, for simulator and device.

## Icons / splash
`python3 scripts/make-icons.py` regenerates them from `www/icons/icon-512.png` (needs Pillow).

## GitHub Actions secrets (optional, for signed Android builds in CI)
`ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`
