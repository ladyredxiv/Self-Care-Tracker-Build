/**
 * Pure budget/streak logic. Deliberately free of any database or Expo import so
 * it can be unit-tested directly — see logic.test.ts. The DB-reading adapters
 * that feed these functions live in selectors.ts.
 */

import { DayOfWeek, Task, TaskWithStatus } from "../types";
import { addDays, dayOfWeekFor, parseDateString, toDateString } from "../utils/date";

/** Safety bound so a malformed daysOfWeek array can't spin the streak walk forever. */
const MAX_STREAK_LOOKBACK_DAYS = 3650;

export function todayDateString(d: Date = new Date()): string {
  return toDateString(d);
}

/** An empty daysOfWeek array means "every day". */
export function isScheduledOn(task: Pick<Task, "daysOfWeek">, date: string): boolean {
  if (task.daysOfWeek.length === 0) return true;
  return task.daysOfWeek.includes(dayOfWeekFor(date));
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
  const { tasks, date, budget, completedTaskIds, completedDatesByTask } = input;

  const spent = tasks
    .filter((t) => completedTaskIds.has(t.id))
    .reduce((sum, t) => sum + t.energyCost, 0);
  const remaining = budget - spent;

  const streakFor = (task: Task) =>
    computeStreak(completedDatesByTask.get(task.id) ?? new Set<string>(), task.daysOfWeek, date);

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
