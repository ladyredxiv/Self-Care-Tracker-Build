import type { WidgetTaskHandlerProps } from "react-native-android-widget";

import { initDatabase } from "../db/database";
import { todayDateString } from "../db/logic";
import { loadDayStatus } from "../db/selectors";
import { StatusSummary } from "../utils/statusText";
import SpoonsWidget from "./SpoonsWidget";

/**
 * Renders the home-screen widget.
 *
 * This runs in a headless JS context, not inside the app: React context, navigation
 * and the theme provider are all absent, and it can fire when the app has never been
 * opened since boot. Hence initDatabase() here as well as in App — it's idempotent,
 * and without it the very first widget render could hit a schema that hasn't been
 * created yet.
 *
 * Any failure renders a placeholder instead of throwing. A crashed widget task shows
 * as a blank box on the home screen with nothing to explain it.
 */
export async function widgetTaskHandler(props: WidgetTaskHandlerProps) {
  if (props.widgetAction === "WIDGET_DELETED") return;

  let summary: StatusSummary;
  try {
    initDatabase();
    const status = loadDayStatus(todayDateString());
    summary = {
      spent: status.spent,
      budget: status.budget,
      remaining: status.remaining,
      tasks: status.tasks,
    };
  } catch (err) {
    console.warn("Widget data load failed:", err);
    summary = { spent: 0, budget: 0, remaining: 0, tasks: [] };
  }

  props.renderWidget(<SpoonsWidget summary={summary} />);
}
