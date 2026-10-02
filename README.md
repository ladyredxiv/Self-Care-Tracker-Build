# Spoons

Spoons is an Expo/React Native app (Android and iOS) for tracking daily
capacity using the "spoon theory" budget model: each day you check in with how
much energy you have, tasks cost or restore spoons, and the app tracks what
you spent it on and whether it paid off.

## Running it locally

This is an [Expo](https://docs.expo.dev/versions/v54.0.0/) SDK 54 project.

```
npm install
npm start
```

`npm start` runs `expo start`, which opens the Expo CLI so you can launch the
app in a dev client or emulator. There are also `npm run android` and
`npm run ios` shortcuts for `expo start --android` / `--ios`. Only Android and
iOS are supported platforms (see `app.json`); there is no web build.

## Tests and typecheck

```
npm test
npm run typecheck
```

`npm test` runs the Node test runner against `src/**/*.test.ts`. `npm run
typecheck` runs `tsc --noEmit`. Both run automatically on every pull request
(and on pushes to `master`) via the GitHub Actions workflow in
`.github/workflows/ci.yml`.

## How updates ship

Builds are configured with EAS (`eas.json`). The `preview` build profile
produces an internal Android APK on the `preview` update channel, and
`runtimeVersion.policy` is set to `appVersion` in `app.json` — the app's
`expo.version` has to match what the installed build reports for an update to
be delivered to it.

Per `AGENTS.md`, that split matters for how a change ships:

- A JS- or asset-only change can ship as an over-the-air update to the
  `preview` channel without a new build.
- A change that adds, removes, or updates a dependency, or edits native
  config in `app.json`, needs `expo.version` bumped and a new APK built —
  an OTA update alone won't reach it, and can even crash the app if pushed
  anyway.

This README only describes those steps; it does not run them, and this repo
has no build or publish commands committed to it beyond what's shown above.
