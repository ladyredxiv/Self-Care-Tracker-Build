# Contributing

This is a short guide for people working on this repo. If you're a coding
agent, read `AGENTS.md` instead — it covers the same ground plus more detail.

## Tests and typecheck

```
npm test
npm run typecheck
```

`npm test` runs the Node test runner against `src/**/*.test.ts`. `npm run
typecheck` runs `tsc --noEmit`. Run both before opening a pull request — the
GitHub Actions workflow in `.github/workflows/ci.yml` runs both on every pull
request (and on pushes to `master`), so a failing check will block review.

## Project layout

- `App.tsx` — root component: sets up the database, notifications, theming,
  and the screen navigator.
- `index.ts` — entry point; registers the root component and the widget task
  handler.
- `src/` — app code, organized by kind: `components/`, `screens/`, `db/`,
  `hooks/`, `utils/`, and `widget/`, plus top-level modules like `theme.tsx`
  and `notifications.ts`.
- `assets/` — app icons, splash image, and illustration art used in the UI.
- `app.json` — Expo app config (name, version, runtime policy, platforms).
- `eas.json` — EAS Build/Submit config (the `preview` and `production`
  profiles and channels).
- `AGENTS.md` — instructions for coding agents working in this repo.

## Native config and dependencies

`runtimeVersion.policy` in `app.json` is set to `appVersion`: the installed
build only accepts an update whose `expo.version` matches what it already
has. That means:

- A change that adds, removes, or updates a dependency, or edits native
  config in `app.json`, needs `expo.version` bumped and a new build. An
  over-the-air update will not carry those changes to installed builds, and
  can crash the app if pushed as one anyway.
- A JS- or asset-only change doesn't need a version bump or a new build —
  it ships as an over-the-air update to the `preview` channel instead.

This file only describes that split; it doesn't run any build or publish
commands, and none are included here.
