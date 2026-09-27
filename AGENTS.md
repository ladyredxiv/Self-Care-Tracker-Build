# This project is pinned to Expo SDK 54

Read the exact versioned docs at https://docs.expo.dev/versions/v54.0.0/ before
writing any code. Do not follow v57 docs or guides — SDK 57 caused problems
during the initial build (Aug 2026) and the pin to 54 is deliberate. Confirm the
installed version with `node -e "console.log(require('expo/package.json').version)"`
rather than assuming.

Target Android. Reminders are **local** scheduled notifications only (no FCM, no
push tokens), so nothing here needs Google Play Services.

# EAS release compatibility

Use `runtimeVersion.policy: "appVersion"`. The installed APK is **1.0.1**, so
`expo.version` in app.json must stay `1.0.1` for updates to reach it. Keep
package.json's version aligned.

## Before changing this, check what is actually installed

Do not reason about the runtime from config history — read it from the device or
from `eas build:list`. The app shows it in Settings under "App updates", and the
"nothing new to install" dialog names it.

This has now broken twice, in both directions:

- Switching config to `appVersion` while the installed APK was a `fingerprint`
  build stranded it: updates stamped `"1.0.1"` matched nothing.
- Reverting config to `fingerprint` *after* a 1.0.1 APK had been built and
  installed stranded it again, the same way.

Either mismatch is silent. `eas update` succeeds, the phone reports "nothing new
to install", and nothing anywhere reports an error.

## Why appVersion here

Two `fingerprint` builds errored (runtime `118bf2d8...`) before the `appVersion`
1.0.1 build succeeded, and Morgan wants updates that are easy to ship.

The tradeoff to respect: `appVersion` fails LOUD. Unlike `fingerprint`, which
simply withholds a mismatched update, `appVersion` will happily deliver JS to a
binary whose native side no longer matches — which can crash on launch. The
guardrail is therefore discipline, not arithmetic:

**Bump `expo.version` and build a new APK before shipping any change that adds,
removes or updates a dependency, or edits native config in app.json.** JS- and
asset-only changes keep the version and ship over the air to the `preview`
channel.
