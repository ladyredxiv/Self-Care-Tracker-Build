/**
 * Keeps the ongoing notification in step with the current day.
 *
 * Separate from statusNotification.ts so that module stays free of database
 * imports, and separate from selectors.ts so the data layer doesn't reach into
 * notifications.
 */

import { Platform } from "react-native";
import { requestWidgetUpdate } from "react-native-android-widget";

import { todayDateString } from "./db/logic";
import { shiftDateString } from "./utils/date";
import { isStatusNotificationEnabled, loadDayStatus, previewDayStatus } from "./db/selectors";
import { describeStatus } from "./utils/statusText";
import {
  hideStatusNotification,
  isStatusNotificationPresented,
  scheduleStatusForTomorrow,
  showStatusNotification,
} from "./statusNotification";
import { getSetting, setSetting, STATUS_LAST_POSTED_KEY } from "./db/database";
import SpoonsWidget from "./widget/SpoonsWidget";

/**
 * Re-posts or clears the ongoing notification and refreshes the home-screen widget
 * from current state.
 *
 * Safe to call whenever the day changes; failures are swallowed because a stale
 * readout is never worth interrupting the app for. The widget is refreshed
 * regardless of the notification setting — one is a shade entry the user opted into,
 * the other is something they chose to place on their home screen.
 */
export async function refreshStatusNotification() {
  const today = todayDateString();
  let summary;
  try {
    const status = loadDayStatus(today);
    summary = {
      spent: status.spent,
      budget: status.budget,
      remaining: status.remaining,
      tasks: status.tasks,
    };
  } catch (err) {
    console.warn("Status refresh failed to load data:", err);
    return;
  }

  try {
    if (isStatusNotificationEnabled()) {
      const { title, body } = describeStatus(summary);
      const posted = `${title}
${body}`;

      /**
       * Re-posting an identical notification makes it visibly reappear in the
       * shade. Home reloads on every focus, so without this it flashed on each
       * tab change — and, because the record used to be a module variable that a
       * cold start reset, on every app launch too. Persisting it fixes the launch
       * case; checking the notification is still on screen stops a stale record
       * suppressing it for good after a reboot clears the tray.
       */
      const unchanged = getSetting(STATUS_LAST_POSTED_KEY) === posted;
      // Not an early return: the widget below still needs refreshing even when
      // the notification is already saying the right thing.
      if (!unchanged || !(await isStatusNotificationPresented())) {
        await showStatusNotification(summary);
        setSetting(STATUS_LAST_POSTED_KEY, posted);
      }

      /**
       * Nothing recomputes this while the app is closed, so the readout sat
       * showing yesterday's spoons until the app was next opened — wrong way round
       * for something you check before getting up. Queue tomorrow's now.
       */
      const tomorrow = shiftDateString(today, 1);
      const preview = previewDayStatus(tomorrow);
      await scheduleStatusForTomorrow(
        {
          spent: preview.spent,
          budget: preview.budget,
          remaining: preview.remaining,
          tasks: preview.tasks,
        },
        today
      );
    } else {
      await hideStatusNotification();
      setSetting(STATUS_LAST_POSTED_KEY, "");
    }
  } catch (err) {
    console.warn("Status notification refresh failed:", err);
  }

  if (Platform.OS !== "android") return;
  try {
    // A no-op when the widget isn't on the home screen, so this needs no setting.
    await requestWidgetUpdate({
      widgetName: "Spoons",
      renderWidget: () => <SpoonsWidget summary={summary} />,
    });
  } catch (err) {
    console.warn("Widget refresh failed:", err);
  }
}
