import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

import { plannedReminders } from "./db/logic";
import { Task } from "./types";

const REMINDER_CHANNEL_ID = "self-care-reminders";

/**
 * Category identifiers must not contain ":" or "-" — expo-notifications documents
 * that categories may silently misbehave if they do.
 */
const REMINDER_CATEGORY_ID = "selfcarereminder";

export const COMPLETE_ACTION_ID = "complete";

/**
 * iOS silently drops pending notifications past 64, so the per-task window shrinks
 * as the number of reminding tasks grows. Android's ceiling is far higher, but
 * there's no reason to schedule differently per platform.
 */
const MAX_PENDING_REMINDERS = 60;
const MAX_HORIZON_DAYS = 14;

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export async function setupNotifications() {
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync(REMINDER_CHANNEL_ID, {
      name: "Self-care reminders",
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }

  // Gives every reminder a "Mark done" button. opensAppToForeground is left at its
  // default of true deliberately: with it false, the response listener never fires
  // when the app has been killed, which is exactly when a reminder matters most.
  await Notifications.setNotificationCategoryAsync(REMINDER_CATEGORY_ID, [
    {
      identifier: COMPLETE_ACTION_ID,
      buttonTitle: "Mark done",
    },
  ]);
}

export async function requestNotificationPermissions(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  const requested = await Notifications.requestPermissionsAsync();
  return requested.granted;
}

function reminderIdentifier(taskId: number, date: string): string {
  return `task-${taskId}-${date}`;
}

/**
 * Cancels every reminder belonging to a task by matching the identifier prefix
 * against what's actually scheduled.
 *
 * Reading the real schedule rather than guessing at identifiers also clears
 * reminders left behind by the previous repeating-trigger scheme, whose ids were
 * `task-<id>-daily` and `task-<id>-<weekday>`.
 */
export async function cancelTaskReminders(taskId: number) {
  const prefix = `task-${taskId}-`;
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    scheduled
      .filter((entry) => entry.identifier.startsWith(prefix))
      .map((entry) =>
        Notifications.cancelScheduledNotificationAsync(entry.identifier).catch(() => {})
      )
  );
}

/** Cancels just one day's reminder, leaving the rest of the window armed. */
export async function cancelReminderForDate(taskId: number, date: string) {
  await Notifications.cancelScheduledNotificationAsync(
    reminderIdentifier(taskId, date)
  ).catch(() => {});
}

/** Replaces a task's armed reminders with the ones it should currently have. */
export async function scheduleTaskReminders(
  task: Task,
  completedDates: ReadonlySet<string>,
  horizonDays: number = MAX_HORIZON_DAYS
) {
  await cancelTaskReminders(task.id);

  const planned = plannedReminders(task, completedDates, new Date(), horizonDays);

  for (const { date, at } of planned) {
    await Notifications.scheduleNotificationAsync({
      identifier: reminderIdentifier(task.id, date),
      content: {
        title: task.name,
        body: `${task.energyCost} energy · time for a self-care check-in`,
        categoryIdentifier: REMINDER_CATEGORY_ID,
        // Carried so the "Mark done" action knows which day it is completing —
        // not necessarily the day the action is tapped.
        data: { taskId: task.id, date },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: at,
        channelId: REMINDER_CHANNEL_ID,
      },
    });
  }
}

/**
 * Re-arms every task's reminders. Safe to call on each launch, and necessary:
 * the scheduling window is finite, so running the app is what keeps it topped up.
 */
export async function rescheduleAllReminders(
  tasks: Task[],
  completedDatesByTask: ReadonlyMap<number, ReadonlySet<string>>
) {
  const reminding = tasks.filter((task) => task.reminderEnabled && task.reminderTime);
  const horizonDays =
    reminding.length === 0
      ? MAX_HORIZON_DAYS
      : Math.min(
          MAX_HORIZON_DAYS,
          Math.max(1, Math.floor(MAX_PENDING_REMINDERS / reminding.length))
        );

  for (const task of tasks) {
    await scheduleTaskReminders(
      task,
      completedDatesByTask.get(task.id) ?? new Set<string>(),
      horizonDays
    );
  }
}
