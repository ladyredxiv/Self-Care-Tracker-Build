/**
 * Pure budget/streak logic. Deliberately free of any database or Expo import so
 * it can be unit-tested directly — see logic.test.ts. The DB-reading adapters
 * that feed these functions live in selectors.ts.
 */

import { DayOfWeek, Task, TaskWithStatus, TimeOfDay } from "../types";
import { addDays, dayOfWeekFor, parseDateString, toDateString } from "../utils/date";
import { parseTimeString } from "../utils/time";

/** Safety bound so a malformed daysOfWeek array can't spin the streak walk forever. */
const MAX_STREAK_LOOKBACK_DAYS = 3650;

export function todayDateString(d: Date = new Date()): string {
  return toDateString(d);
}

/**
 * Whether a task belongs to a given day.
 *
 * An empty daysOfWeek array means "every day". A one-off task ignores weekdays
 * entirely — it's outstanding business every day until it gets done.
 */
export function isScheduledOn(
  task: Pick<Task, "daysOfWeek" | "isRecurring">,
  date: string
): boolean {
  if (!task.isRecurring) return true;
  if (task.daysOfWeek.length === 0) return true;
  return task.daysOfWeek.includes(dayOfWeekFor(date));
}

/**
 * Whether a one-off task has served its purpose and should vanish.
 *
 * A completed one-off still shows on the day it was completed — seeing it ticked
 * off is the point — but disappears from every later day rather than lingering as
 * a permanently-done row.
 */
export function isRetiredOneOff(
  task: Pick<Task, "isRecurring">,
  completedDates: ReadonlySet<string>,
  date: string
): boolean {
  if (task.isRecurring) return false;
  if (completedDates.size === 0) return false;
  return !completedDates.has(date);
}

/**
 * Consecutive completions counting only days the task is actually scheduled for,
 * so a Mon/Wed/Fri task isn't reset by every Tuesday.
 *
 * Today is given grace: if it's scheduled but not yet done, the streak earned on
 * previous scheduled days still stands. Any *earlier* scheduled day that was
 * missed ends the streak.
 */
export function computeStreak(
  completedDates: ReadonlySet<string>,
  daysOfWeek: DayOfWeek[],
  today: string
): number {
  let streak = 0;
  let cursor = parseDateString(today);

  for (let checked = 0; checked < MAX_STREAK_LOOKBACK_DAYS; checked++) {
    const dateStr = toDateString(cursor);
    const scheduled =
      daysOfWeek.length === 0 || daysOfWeek.includes(cursor.getDay() as DayOfWeek);

    if (scheduled) {
      if (completedDates.has(dateStr)) {
        streak++;
      } else if (dateStr !== today) {
        break;
      }
    }
    cursor = addDays(cursor, -1);
  }

  return streak;
}

export interface DayStatusInput {
  tasks: Task[];
  date: string;
  budget: number;
  completedTaskIds: ReadonlySet<number>;
  completedDatesByTask: ReadonlyMap<number, ReadonlySet<string>>;
}

export interface DayStatus {
  tasks: TaskWithStatus[];
  budget: number;
  /** Energy spent across every completed task today, scheduled or not. */
  spent: number;
  remaining: number;
}

/**
 * Status of every task for a given day, plus the single authoritative spent /
 * remaining figures. Screens must read spend from here rather than recomputing
 * it — two independent calculations previously disagreed whenever a task was
 * completed and then edited to exclude today.
 *
 * `fitsRemainingBudget` is computed greedily in cheapest-first order, so it
 * reflects genuinely achievable combinations rather than merely "costs less than
 * the whole budget".
 */
export function buildDayStatus(input: DayStatusInput): DayStatus {
  const { date, budget, completedTaskIds, completedDatesByTask } = input;

  const completedDatesFor = (task: Task) =>
    completedDatesByTask.get(task.id) ?? new Set<string>();

  // Finished one-offs drop out entirely rather than appearing under "not scheduled".
  const tasks = input.tasks.filter(
    (task) => !isRetiredOneOff(task, completedDatesFor(task), date)
  );

  const spent = tasks
    .filter((t) => completedTaskIds.has(t.id))
    .reduce((sum, t) => sum + t.energyCost, 0);
  const remaining = budget - spent;

  // Streaks are meaningless for a one-off, so it reports none and the UI's
  // "streak > 0" check hides the flame without needing to know why.
  const streakFor = (task: Task) =>
    task.isRecurring ? computeStreak(completedDatesFor(task), task.daysOfWeek, date) : 0;

  let runningRemaining = remaining;
  const scheduled = tasks
    .filter((t) => isScheduledOn(t, date))
    .sort((a, b) => a.energyCost - b.energyCost)
    .map((task) => {
      const completedToday = completedTaskIds.has(task.id);
      const fitsRemainingBudget = completedToday || task.energyCost <= runningRemaining;
      if (fitsRemainingBudget && !completedToday) {
        runningRemaining -= task.energyCost;
      }
      return {
        ...task,
        completedToday,
        fitsRemainingBudget,
        scheduledToday: true,
        streak: streakFor(task),
      };
    });

  const unscheduled = tasks
    .filter((t) => !isScheduledOn(t, date))
    .map((task) => ({
      ...task,
      completedToday: completedTaskIds.has(task.id),
      fitsRemainingBudget: false,
      scheduledToday: false,
      streak: streakFor(task),
    }));

  return { tasks: [...scheduled, ...unscheduled], budget, spent, remaining };
}

export interface PlannedReminder {
  /** Local date the reminder belongs to, "YYYY-MM-DD". */
  date: string;
  /** Exact local moment to fire. */
  at: Date;
}

/**
 * The reminders that should currently be armed for a task, as concrete one-shot
 * moments rather than an OS-level repeating rule.
 *
 * Repeating triggers can't be suppressed for a single day — cancelling one
 * removes it forever — which is why a completed task used to keep nagging. Planning
 * discrete occurrences means today's can be cancelled on completion while the rest
 * stay armed. The cost is that the window has to be topped up when the app runs,
 * which is why the horizon is days rather than hours.
 *
 * Skips days the task isn't scheduled for, days already completed, and times that
 * have already passed.
 */
export function plannedReminders(
  task: Pick<Task, "daysOfWeek" | "isRecurring" | "reminderEnabled" | "reminderTime">,
  completedDates: ReadonlySet<string>,
  from: Date,
  horizonDays: number
): PlannedReminder[] {
  if (!task.reminderEnabled || !task.reminderTime) return [];

  // A one-off that's been done is done — no further reminders, ever. Without this
  // it would keep reminding on every day it wasn't completed on.
  if (!task.isRecurring && completedDates.size > 0) return [];

  const time = parseTimeString(task.reminderTime);
  if (!time) return [];

  const planned: PlannedReminder[] = [];
  for (let offset = 0; offset < horizonDays; offset++) {
    const date = toDateString(addDays(from, offset));
    if (!isScheduledOn(task, date)) continue;
    if (completedDates.has(date)) continue;

    const at = parseDateString(date);
    at.setHours(time.hour, time.minute, 0, 0);
    if (at.getTime() <= from.getTime()) continue;

    planned.push({ date, at });
  }
  return planned;
}

/** Display order for time-of-day groups; "anytime" trails as the catch-all. */
export const TIME_OF_DAY_ORDER: TimeOfDay[] = ["morning", "afternoon", "evening", "anytime"];

export interface TimeOfDayGroup<T> {
  timeOfDay: TimeOfDay;
  tasks: T[];
}

/**
 * Buckets tasks into time-of-day groups, dropping empty ones.
 *
 * Input order is preserved within each group, which matters: buildDayStatus hands
 * tasks over sorted cheapest-first, and that ordering is what its greedy
 * `fitsRemainingBudget` pass was based on. Grouping is presentation only — it must
 * not reorder tasks in a way that contradicts which ones were said to fit.
 */
export function groupByTimeOfDay<T extends { timeOfDay: TimeOfDay }>(
  tasks: T[]
): TimeOfDayGroup<T>[] {
  return TIME_OF_DAY_ORDER.map((timeOfDay) => ({
    timeOfDay,
    tasks: tasks.filter((task) => task.timeOfDay === timeOfDay),
  })).filter((group) => group.tasks.length > 0);
}

export interface DayUsage {
  date: string;
  budget: number;
  spent: number;
  /** Whether this day has a saved budget, vs. falling back to the current default. */
  hasExplicitBudget: boolean;
}

/**
 * Budget vs. actual spend per day, oldest first.
 *
 * Days are expected to carry their own saved budget — selectors.ts freezes each
 * day's budget the first time it's opened, so later changes to the default can't
 * retroactively rewrite history. `fallbackBudget` only covers days that predate
 * that behaviour.
 */
export function buildUsageTrend(
  dates: string[],
  budgetByDate: Readonly<Record<string, number | null>>,
  spentByDate: Readonly<Record<string, number>>,
  fallbackBudget: number
): DayUsage[] {
  return dates.map((date) => {
    const explicitBudget = budgetByDate[date] ?? null;
    return {
      date,
      budget: explicitBudget ?? fallbackBudget,
      spent: spentByDate[date] ?? 0,
      hasExplicitBudget: explicitBudget !== null,
    };
  });
}
