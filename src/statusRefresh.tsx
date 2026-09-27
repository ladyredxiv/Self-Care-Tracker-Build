/**
 * Keeps the ongoing notification in step with the current day.
 *
 * Separate from statusNotification.ts so that module stays free of database
 * imports, and separate from selectors.ts so the data layer doesn't reach into
 * notifications.
 */

import { Appearance, Platform } from "react-native";
import { requestWidgetUpdate } from "react-native-android-widget";

import { todayDateString } from "./db/logic";
import { isStatusNotificationEnabled, loadDayStatus } from "./db/selectors";
import { describeStatus } from "./utils/statusText";
import { hideStatusNotification, showStatusNotification } from "./statusNotification";
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
/**
 * What the notification last said. Re-posting an identical notification makes it
 * visibly reappear in the shade, and Home reloads on every focus — so simply
 * moving between the Today and Tasks tabs made it flash each time.
 */
let lastPosted: string | null = null;

export async function refreshStatusNotification() {
  let summary;
  try {
    const status = loadDayStatus(todayDateString());
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
      if (posted !== lastPosted) {
        await showStatusNotification(summary);
        lastPosted = posted;
      }
    } else {
      await hideStatusNotification();
      lastPosted = null;
    }
  } catch (err) {
    console.warn("Status notification refresh failed:", err);
  }

  if (Platform.OS !== "android") return;
  try {
    // A no-op when the widget isn't on the home screen, so this needs no setting.
    await requestWidgetUpdate({
      widgetName: "Spoons",
      renderWidget: () => (
        <SpoonsWidget summary={summary} isDark={Appearance.getColorScheme() === "dark"} />
      ),
    });
  } catch (err) {
    console.warn("Widget refresh failed:", err);
  }
}
