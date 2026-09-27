# This project is pinned to Expo SDK 54

Read the exact versioned docs at https://docs.expo.dev/versions/v54.0.0/ before
writing any code. Do not follow v57 docs or guides — SDK 57 caused problems
during the initial build (Aug 2026) and the pin to 54 is deliberate. Confirm the
installed version with `node -e "console.log(require('expo/package.json').version)"`
rather than assuming.

Target Android. Reminders are **local** scheduled notifications only (no FCM, no
push tokens), so nothing here needs Google Play Services.

# EAS release compatibility

Use `runtimeVersion.policy: "fingerprint"`. Do not change this to `appVersion`
without rebuilding and reinstalling the APK first.

It was briefly switched to `appVersion` with the version bumped to 1.0.1. That
silently broke update delivery: the installed APK was built under `fingerprint`,
so its embedded runtime is the hash `a966e026...`, while `eas update` then stamped
updates `"1.0.1"`. Nothing matched, so "Check for updates" reported "nothing new"
forever with no error anywhere. Reverting to `fingerprint` at version 1.0.0
reproduces `a966e026...` exactly and restores delivery with no rebuild — verified
with `npx expo-updates fingerprint:generate --platform android`.

The two policies fail in opposite directions, which is the real reason for the
choice. `fingerprint` fails safe: a mismatched update is simply never delivered.
`appVersion` fails loud: the update IS delivered, and if native dependencies
changed without someone remembering to bump the version, the app can crash on
launch. For an app used daily for health tracking, silence beats a crash.

Practical consequence: adding or removing ANY dependency changes the fingerprint
and requires a new APK. JS/asset-only changes keep it stable and ship over the air
to the `preview` channel. Always confirm with `fingerprint:generate` before
publishing, and compare against `eas build:list`.
