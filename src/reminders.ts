/**
 * Bridges the database and the OS scheduler. Kept separate so notifications.ts
 * stays free of database imports and db/logic.ts stays pure.
 */

import { getAllTasks, getCompletedDatesByTask, getTaskById } from "./db/database";
import {
  cancelReminderForDate,
  cancelTaskReminders,
  rescheduleAllReminders,
  scheduleTaskReminders,
} from "./notifications";

/** Re-arms every reminder from current database state. Call on launch. */
export async function syncAllReminders() {
  await rescheduleAllReminders(getAllTasks(), getCompletedDatesByTask());
}

/** Re-arms one task's reminders, e.g. after editing it or un-completing a day. */
export async function syncRemindersForTask(taskId: number) {
  const task = getTaskById(taskId);
  if (!task) {
    await cancelTaskReminders(taskId);
    return;
  }
  await scheduleTaskReminders(task, getCompletedDatesByTask().get(taskId) ?? new Set<string>());
}

/**
 * Called when a task is completed: drops only that day's reminder so the task
 * stops nagging about something already done, while future days stay armed.
 */
export async function clearReminderForCompletion(taskId: number, date: string) {
  await cancelReminderForDate(taskId, date);
}
