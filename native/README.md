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
cd android && ./gradlew assembleRelease
```
Without `keys/keystore.properties`, Gradle writes `app/build/outputs/apk/release/app-release-unsigned.apk`.
That file is the release build for the original upload key. It is not an installable update until that key signs it.
Do not create a replacement keystore, and do not put the unsigned APK in `docs/download/`.

Release signing reads `keys/keystore.properties` (storeFile, storePassword, keyAlias, keyPassword), or the path in `$MYCARGPS_KEYSTORE_PROPS`.
`keys/` is never committed. With that file present, `./gradlew assembleRelease bundleRelease` produces the signed APK and AAB.

Version: `VERSION_CODE` / `VERSION_NAME` env vars. Defaults are versionCode 4 and versionName 1.0.3.
The saved `docs/download/StreetKnowledge.apk` is versionCode 3, versionName 1.0.2. CI uses the Gradle defaults and does not substitute `github.run_number`.

Sign the unsigned release with the original identity (`CN=MyCar GPS, O=Payneless Services, C=US`, SHA-256 `90:62:1E:0A:92:1B:20:53:9B:F1:84:D3:4E:D7:24:26:19:E9:E2:EA:E2:F2:9B:AA:DA:BF:8D:8A:16:F4:30:70`):
```
apksigner sign --ks <original-upload.jks> --ks-key-alias <alias> \
  --out StreetKnowledge-1.0.3-signed.apk app-release-unsigned.apk
```

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
