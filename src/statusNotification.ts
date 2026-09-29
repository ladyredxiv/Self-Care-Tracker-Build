/**
 * An ongoing Android notification showing spoons remaining and what to start with.
 *
 * Stands in for a home-screen widget: most of the always-visible benefit, but it's
 * pure JS, so it ships over the air instead of needing a config plugin, Kotlin, and
 * a rebuild.
 *
 * Off by default. A permanent entry in someone's notification shade is intrusive
 * enough that it has to be asked for.
 */

import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

import { pickStartHere } from "./db/logic";
import { startOfNextDay } from "./utils/date";
import { describeStatus, StatusSummary } from "./utils/statusText";

export { describeStatus } from "./utils/statusText";
export type { StatusSummary } from "./utils/statusText";

const STATUS_CHANNEL_ID = "spoons-status";
/** No ":" or "-": expo-notifications documents those break categories. */
const STATUS_CATEGORY_ID = "spoonsstatus";
const STATUS_NOTIFICATION_ID = "spoons-status-summary";

export const STATUS_COMPLETE_ACTION_ID = "completeTop";

export async function setupStatusNotification() {
  if (Platform.OS === "android") {
    // LOW keeps it silent and un-intrusive — it's a readout, not an alert, and it
    // would otherwise buzz on every single update.
    await Notifications.setNotificationChannelAsync(STATUS_CHANNEL_ID, {
      name: "Spoons remaining",
      importance: Notifications.AndroidImportance.LOW,
      vibrationPattern: [0],
      enableVibrate: false,
      showBadge: false,
    });
  }

  await Notifications.setNotificationCategoryAsync(STATUS_CATEGORY_ID, [
    { identifier: STATUS_COMPLETE_ACTION_ID, buttonTitle: "Done the first one" },
  ]);
}

/** Posts or refreshes the ongoing notification. */
export async function showStatusNotification(summary: StatusSummary) {
  const { title, body } = describeStatus(summary);
  const [top] = pickStartHere(summary.tasks, 1);

  await Notifications.scheduleNotificationAsync({
    identifier: STATUS_NOTIFICATION_ID,
    content: {
      title,
      body,
      sticky: true,
      autoDismiss: false,
      // Only offer the action when there's something for it to complete, otherwise
      // the button does nothing and reads as broken.
      categoryIdentifier: top ? STATUS_CATEGORY_ID : undefined,
      data: top ? { statusTaskId: top.id } : {},
    },
    trigger: null,
  });
}

/**
 * Whether the ongoing notification is actually on screen.
 *
 * Needed because remembering what was last posted isn't enough on its own: the
 * system clears notifications on reboot, and a stale "already posted this" record
 * would then suppress it forever.
 */
export async function isStatusNotificationPresented(): Promise<boolean> {
  try {
    const presented = await Notifications.getPresentedNotificationsAsync();
    return presented.some((entry) => entry.request.identifier === STATUS_NOTIFICATION_ID);
  } catch {
    // Unknown means re-post; a duplicate is better than a missing readout.
    return false;
  }
}

/**
 * Queues the readout for the start of tomorrow.
 *
 * Nothing recomputes the notification while the app is closed, so without this it
 * sits showing yesterday's spoons until the app is next opened — which for an app
 * you check *before* getting up is exactly the wrong way round. Same identifier,
 * so on delivery it replaces the current one rather than stacking.
 *
 * It's a prediction: it assumes tomorrow starts at the default budget with nothing
 * done. Opening the app corrects it, and any completion re-runs this.
 */
export async function scheduleStatusForTomorrow(summary: StatusSummary, today: string) {
  const { title, body } = describeStatus(summary);
  await Notifications.scheduleNotificationAsync({
    identifier: STATUS_NOTIFICATION_ID,
    content: {
      title,
      body,
      sticky: true,
      autoDismiss: false,
      data: {},
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: startOfNextDay(today),
      channelId: STATUS_CHANNEL_ID,
    },
  });
}

export async function hideStatusNotification() {
  await Notifications.dismissNotificationAsync(STATUS_NOTIFICATION_ID).catch(() => {});
  await Notifications.cancelScheduledNotificationAsync(STATUS_NOTIFICATION_ID).catch(() => {});
}
