/**
 * Keeps the ongoing notification in step with the current day.
 *
 * Separate from statusNotification.ts so that module stays free of database
 * imports, and separate from selectors.ts so the data layer doesn't reach into
 * notifications.
 */

import { todayDateString } from "./db/logic";
import { isStatusNotificationEnabled, loadDayStatus } from "./db/selectors";
import { hideStatusNotification, showStatusNotification } from "./statusNotification";

/**
 * Re-posts or clears the ongoing notification from current state. Safe to call
 * whenever the day changes; failures are swallowed because a stale readout is never
 * worth interrupting the app for.
 */
export async function refreshStatusNotification() {
  try {
    if (!isStatusNotificationEnabled()) {
      await hideStatusNotification();
      return;
    }
    const status = loadDayStatus(todayDateString());
    await showStatusNotification({
      spent: status.spent,
      budget: status.budget,
      remaining: status.remaining,
      tasks: status.tasks,
    });
  } catch (err) {
    console.warn("Status notification refresh failed:", err);
  }
}
