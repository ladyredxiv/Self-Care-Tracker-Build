/**
 * Pure budget/streak logic. Deliberately free of any database or Expo import so
 * it can be unit-tested directly — see logic.test.ts. The DB-reading adapters
 * that feed these functions live in selectors.ts.
 */

import { DayOfWeek, Task, TaskWithStatus, TimeOfDay } from "../types";
import {
  addDays,
  dateStringFromISO,
  dayOfWeekFor,
  daysBetween,
  parseDateString,
  shiftDateString,
  toDateString,
} from "../utils/date";
import { parseTimeString } from "../utils/time";

/** Safety bound so a malformed daysOfWeek array can't spin the streak walk forever. */
const MAX_STREAK_LOOKBACK_DAYS = 3650;

export function todayDateString(d: Date = new Date()): string {
  return toDateString(d);
}

/** Fields any scheduling decision needs. */
export type Schedulable = Pick<
  Task,
  "scheduleType" | "daysOfWeek" | "intervalDays" | "createdAt"
>;

export interface DueInfo {
  isDue: boolean;
  /** Days since it became due. Only interval tasks accrue this. */
  daysWaiting: number;
}

/** Most recent completion strictly before `date`, or null. ISO dates sort lexically. */
export function lastCompletionBefore(
  completedDates: ReadonlySet<string>,
  date: string
): string | null {
  let latest: string | null = null;
  for (const completed of completedDates) {
    if (completed < date && (latest === null || completed > latest)) {
      latest = completed;
    }
  }
  return latest;
}

/**
 * The date an interval task becomes due: one interval after it was last done, or
 * its creation date if it never has been.
 *
 * Measured from the last completion rather than from a fixed calendar grid — that's
 * the whole point of interval scheduling. Skipping it doesn't lose the occurrence,
 * it just means the task keeps sitting there, due.
 */
export function intervalDueFrom(
  task: Schedulable,
  completedDates: ReadonlySet<string>,
  date: string
): string {
  const interval = Math.max(1, Math.floor(task.intervalDays ?? 1));
  const last = lastCompletionBefore(completedDates, date);
  if (last !== null) return shiftDateString(last, interval);
  return dateStringFromISO(task.createdAt, date);
}

/**
 * Whether a task is due on a date, and how long it's been waiting.
 *
 * Only interval tasks accumulate waiting time. A missed daily or weekday task
 * doesn't carry forward — each day stands alone for those, and anything that
 * genuinely shouldn't be lost when skipped belongs on an interval schedule.
 */
export function dueInfoFor(
  task: Schedulable,
  completedDates: ReadonlySet<string>,
  date: string
): DueInfo {
  switch (task.scheduleType) {
    case "daily":
    case "once":
      return { isDue: true, daysWaiting: 0 };

    case "weekdays":
      return {
        isDue: task.daysOfWeek.length === 0 || task.daysOfWeek.includes(dayOfWeekFor(date)),
        daysWaiting: 0,
      };

    case "interval": {
      const waiting = daysBetween(intervalDueFrom(task, completedDates, date), date);
      return { isDue: waiting >= 0, daysWaiting: Math.max(0, waiting) };
    }
  }
}

/** Convenience wrapper where only the yes/no matters. */
export function isDueOn(
  task: Schedulable,
  completedDates: ReadonlySet<string>,
  date: string
): boolean {
  return dueInfoFor(task, completedDates, date).isDue;
}

/**
 * Whether a one-off task has served its purpose and should vanish.
 *
 * A completed one-off still shows on the day it was completed — seeing it ticked
 * off is the point — but disappears from every later day rather than lingering as
 * a permanently-done row.
 */
export function isRetiredOneOff(
  task: Pick<Task, "scheduleType">,
  completedDates: ReadonlySet<string>,
  date: string
): boolean {
  if (task.scheduleType !== "once") return false;
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
 * `fitsRemainingBudget` is allocated greedily in priority order: longest-waiting
 * first, then cheapest. The waiting term is what makes overdue work actually win
 * a slot when there isn't enough energy for everything — sorting the display alone
 * would still let cheap daily tasks consume the budget while a shower that's been
 * put off for four days got marked as not fitting.
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

  // Streaks only mean something for a fixed cadence. An interval task's "streak"
  // would be consecutive on-time completions, a different calculation; a one-off
  // has nothing to be consecutive with. Reporting 0 lets the UI's "streak > 0"
  // check hide the flame without needing to know why.
  const streakFor = (task: Task) =>
    task.scheduleType === "daily" || task.scheduleType === "weekdays"
      ? computeStreak(completedDatesFor(task), task.daysOfWeek, date)
      : 0;

  const withDueInfo = tasks.map((task) => ({
    task,
    due: dueInfoFor(task, completedDatesFor(task), date),
  }));

  let runningRemaining = remaining;
  const scheduled = withDueInfo
    .filter(({ task, due }) => due.isDue || completedTaskIds.has(task.id))
    .sort(
      (a, b) =>
        b.due.daysWaiting - a.due.daysWaiting || a.task.energyCost - b.task.energyCost
    )
    .map(({ task, due }) => {
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
        daysWaiting: due.daysWaiting,
      };
    });

  const upcoming = withDueInfo
    .filter(({ task, due }) => !due.isDue && !completedTaskIds.has(task.id))
    .map(({ task, due }) => ({
      ...task,
      completedToday: false,
      fitsRemainingBudget: false,
      scheduledToday: false,
      streak: streakFor(task),
      daysWaiting: due.daysWaiting,
    }));

  return { tasks: [...scheduled, ...upcoming], budget, spent, remaining };
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
  task: Schedulable & Pick<Task, "reminderEnabled" | "reminderTime">,
  completedDates: ReadonlySet<string>,
  from: Date,
  horizonDays: number
): PlannedReminder[] {
  if (!task.reminderEnabled || !task.reminderTime) return [];

  // A one-off that's been done is done — no further reminders, ever. Without this
  // it would keep reminding on every day it wasn't completed on.
  if (task.scheduleType === "once" && completedDates.size > 0) return [];

  const time = parseTimeString(task.reminderTime);
  if (!time) return [];

  const planned: PlannedReminder[] = [];
  for (let offset = 0; offset < horizonDays; offset++) {
    const date = toDateString(addDays(from, offset));
    // An interval task stays due until it's done, so it keeps reminding — the
    // nagging worth avoiding is about finished work, not outstanding work.
    if (!isDueOn(task, completedDates, date)) continue;
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
