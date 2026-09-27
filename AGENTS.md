# This project is pinned to Expo SDK 54

Read the exact versioned docs at https://docs.expo.dev/versions/v54.0.0/ before
writing any code. Do not follow v57 docs or guides — SDK 57 caused problems
during the initial build (Aug 2026) and the pin to 54 is deliberate. Confirm the
installed version with `node -e "console.log(require('expo/package.json').version)"`
rather than assuming.

Target Android. Reminders are **local** scheduled notifications only (no FCM, no
push tokens), so nothing here needs Google Play Services.

# EAS release compatibility

Use `runtimeVersion.policy: "appVersion"` (Morgan approved replacing fingerprint).
The current native runtime is 1.0.1. Before changing native dependencies or native
app configuration, bump `expo.version` and build a new APK. Keep package.json and
the root package-lock.json versions aligned. JS/assets-only updates can retain
the version and ship to the existing `preview` EAS Update channel.
