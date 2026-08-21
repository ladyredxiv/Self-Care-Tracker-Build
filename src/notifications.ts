import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { Task } from "./types";

const REMINDER_CHANNEL_ID = "self-care-reminders";

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
}

export async function requestNotificationPermissions(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  const requested = await Notifications.requestPermissionsAsync();
  return requested.granted;
}

function identifierFor(taskId: number, key: string): string {
  return `task-${taskId}-${key}`;
}

/** Cancels every reminder we might have previously scheduled for a task, across all possible day slots. */
export async function cancelTaskReminders(taskId: number) {
  const keys = ["daily", "0", "1", "2", "3", "4", "5", "6"];
  await Promise.all(
    keys.map((key) =>
      Notifications.cancelScheduledNotificationAsync(identifierFor(taskId, key)).catch(() => {})
    )
  );
}

/** Cancels any existing reminders for the task, then schedules fresh ones based on its current settings. */
export async function scheduleTaskReminders(task: Task) {
  await cancelTaskReminders(task.id);

  if (!task.reminderEnabled || !task.reminderTime) return;

  const [hourStr, minuteStr] = task.reminderTime.split(":");
  const hour = parseInt(hourStr, 10);
  const minute = parseInt(minuteStr, 10);
  if (Number.isNaN(hour) || Number.isNaN(minute)) return;

  const content = {
    title: task.name,
    body: `${task.energyCost} energy · time for a self-care check-in`,
  };

  if (task.daysOfWeek.length === 0) {
    await Notifications.scheduleNotificationAsync({
      identifier: identifierFor(task.id, "daily"),
      content,
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour,
        minute,
        channelId: REMINDER_CHANNEL_ID,
      },
    });
    return;
  }

  await Promise.all(
    task.daysOfWeek.map((day) =>
      Notifications.scheduleNotificationAsync({
        identifier: identifierFor(task.id, String(day)),
        content,
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
          weekday: day + 1, // expo-notifications: 1 = Sunday ... 7 = Saturday
          hour,
          minute,
          channelId: REMINDER_CHANNEL_ID,
        },
      })
    )
  );
}

/** Re-syncs every task's reminders against the OS scheduler. Safe to call on every app launch. */
export async function rescheduleAllReminders(tasks: Task[]) {
  await Promise.all(tasks.map((task) => scheduleTaskReminders(task)));
}
