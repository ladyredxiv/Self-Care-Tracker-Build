/**
 * Manual OTA update check, for tightening the dogfooding loop.
 *
 * Without this you wait out two cold starts to see a pushed change: expo-updates
 * is configured with fallbackToCacheTimeout 0, so launch one downloads in the
 * background and launch two actually runs the new bundle.
 */

import * as Updates from "expo-updates";

export type UpdateCheck =
  /** Expo Go or a dev server — there's no updates runtime to ask. */
  | { status: "unsupported" }
  | { status: "none" }
  /** Downloaded and staged; takes effect on reload. */
  | { status: "ready" }
  | { status: "error"; error: string };

export async function checkAndFetchUpdate(): Promise<UpdateCheck> {
  // checkForUpdateAsync rejects outright in development, so this guard is
  // required rather than defensive.
  if (!Updates.isEnabled) return { status: "unsupported" };

  try {
    const check = await Updates.checkForUpdateAsync();

    // A roll back to the embedded bundle is also something to apply, even though
    // it reports isAvailable: false.
    if (!check.isAvailable && !check.isRollBackToEmbedded) {
      return { status: "none" };
    }

    const fetched = await Updates.fetchUpdateAsync();
    if (!fetched.isNew && !fetched.isRollBackToEmbedded) {
      return { status: "none" };
    }

    return { status: "ready" };
  } catch (err) {
    return { status: "error", error: err instanceof Error ? err.message : String(err) };
  }
}

/** Restarts into the update fetched by checkAndFetchUpdate. */
export async function applyUpdate(): Promise<void> {
  await Updates.reloadAsync();
}
