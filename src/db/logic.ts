/**
 * Pure budget/streak logic. Deliberately free of any database or Expo import so
 * it can be unit-tested directly — see logic.test.ts. The DB-reading adapters
 * that feed these functions live in selectors.ts.
 */

import { DayOfWeek, DayRating, Task, TaskWithStatus, TimeOfDay } from "../types";
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

/** Window used for the gentler "N of last N days" progress measure. */
export const RECENT_WINDOW_DAYS = 30;

/**
 * Completions inside the recent window.
 *
 * Offered as an alternative to streaks because a streak punishes exactly the thing
 * this app exists to accommodate: crash for two days through no fault of your own
 * and a month of progress reads as zero. A count over a window is both gentler and
 * a more honest description of a fluctuating condition.
 */
export function recentCompletionCount(
  completedDates: ReadonlySet<string>,
  today: string,
  windowDays: number = RECENT_WINDOW_DAYS
): number {
  const earliest = shiftDateString(today, -(windowDays - 1));
  let count = 0;
  for (const date of completedDates) {
    if (date >= earliest && date <= today) count++;
  }
  return count;
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
 * `fitsRemainingBudget` is allocated greedily in priority order: essentials first,
 * then longest-waiting, then cheapest. The waiting term is what makes overdue work
 * actually win a slot when there isn't enough energy for everything — sorting the
 * display alone would still let cheap daily tasks consume the budget while a shower
 * that's been put off for four days got marked as not fitting. Essentials outrank
 * even that, so medication can't be crowded out by a neglected chore.
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
        Number(b.task.isEssential) - Number(a.task.isEssential) ||
        b.due.daysWaiting - a.due.daysWaiting ||
        a.task.energyCost - b.task.energyCost
    )
    .map(({ task, due }) => {
      const completedToday = completedTaskIds.has(task.id);
      const fitsRemainingBudget =
        completedToday ||
        // A restorative activity gives energy back, so it's always available — and
        // most available precisely when the budget is already blown, which a plain
        // "cost <= remaining" test would get backwards.
        task.energyCost <= 0 ||
        task.energyCost <= runningRemaining;
      if (fitsRemainingBudget && !completedToday) {
        runningRemaining -= task.energyCost;
      }
      return {
        ...task,
        completedToday,
        fitsRemainingBudget,
        scheduledToday: true,
        streak: streakFor(task),
        recentCompletions: recentCompletionCount(completedDatesFor(task), date),
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
      recentCompletions: recentCompletionCount(completedDatesFor(task), date),
      daysWaiting: due.daysWaiting,
    }));

  return { tasks: [...scheduled, ...upcoming], budget, spent, remaining };
}

export interface DayRecord {
  date: string;
  budget: number;
  spent: number;
  rating: DayRating | null;
}

/** Days after an overspend to look for payback. */
export const PAYBACK_LAG_DAYS = 2;

/**
 * Fewest over-budget days with follow-up ratings before any comparison is
 * reported. Below this, a "pattern" is one or two coincidences, and this is
 * health-adjacent enough that overstating it would be worse than saying nothing.
 */
export const MIN_SAMPLE_FOR_PAYBACK = 3;

export interface PaybackInsight {
  overBudgetDays: number;
  ratedDays: number;
  overallAvgRating: number | null;
  /** Mean rating across the days following an overspend. */
  avgRatingAfterOverBudget: number | null;
  avgRatingAfterWithinBudget: number | null;
  /** Overspends followed by a below-average stretch. */
  paybackDays: number;
  /** Overspends that had any rated follow-up at all — the real sample size. */
  comparableOverBudgetDays: number;
  hasEnoughData: boolean;
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/**
 * Looks for post-exertional payback: whether going over budget is followed by
 * worse days.
 *
 * This is the question pacing exists to answer, and the one thing a generic
 * to-do list can never surface. Correlational only — it reports what the numbers
 * say and deliberately doesn't claim causation.
 */
export function analysePayback(
  records: DayRecord[],
  lagDays: number = PAYBACK_LAG_DAYS
): PaybackInsight {
  const byDate = new Map(records.map((r) => [r.date, r]));
  const allRatings = records.filter((r) => r.rating !== null).map((r) => r.rating as number);
  const overallAvgRating = mean(allRatings);

  const followUpAverage = (date: string): number | null => {
    const ratings: number[] = [];
    for (let lag = 1; lag <= lagDays; lag++) {
      const next = byDate.get(shiftDateString(date, lag));
      if (next?.rating != null) ratings.push(next.rating);
    }
    return mean(ratings);
  };

  const afterOver: number[] = [];
  const afterWithin: number[] = [];
  let overBudgetDays = 0;
  let paybackDays = 0;

  for (const record of records) {
    const isOver = record.spent > record.budget;
    if (isOver) overBudgetDays++;

    const follow = followUpAverage(record.date);
    if (follow === null) continue;

    if (isOver) {
      afterOver.push(follow);
      if (overallAvgRating !== null && follow < overallAvgRating) paybackDays++;
    } else {
      afterWithin.push(follow);
    }
  }

  return {
    overBudgetDays,
    ratedDays: allRatings.length,
    overallAvgRating,
    avgRatingAfterOverBudget: mean(afterOver),
    avgRatingAfterWithinBudget: mean(afterWithin),
    paybackDays,
    comparableOverBudgetDays: afterOver.length,
    hasEnoughData: afterOver.length >= MIN_SAMPLE_FOR_PAYBACK,
  };
}

/**
 * One plain sentence about the payback comparison, or an honest statement that
 * there isn't enough to say yet. Never phrased as a telling-off.
 */
export function describePayback(insight: PaybackInsight): string {
  if (!insight.hasEnoughData) {
    const needed = MIN_SAMPLE_FOR_PAYBACK - insight.comparableOverBudgetDays;
    return insight.ratedDays === 0
      ? "Rate how your days go and this will start showing whether overspending catches up with you."
      : `Not enough to compare yet — ${needed} more over-budget day${needed === 1 ? "" : "s"} with a rating after it.`;
  }

  const after = insight.avgRatingAfterOverBudget as number;
  const within = insight.avgRatingAfterWithinBudget;

  if (within === null) {
    return `After going over budget, the next couple of days averaged ${after.toFixed(1)} out of 5.`;
  }

  const gap = within - after;
  if (gap < 0.3) {
    return `Going over budget hasn't been followed by worse days so far — ${after.toFixed(
      1
    )} after overspending versus ${within.toFixed(1)} otherwise.`;
  }

  return `The couple of days after going over budget averaged ${after.toFixed(
    1
  )} out of 5, against ${within.toFixed(1)} after staying within it. ${
    insight.paybackDays
  } of ${insight.comparableOverBudgetDays} overspends were followed by a below-average stretch.`;
}

export interface CategoryLoad {
  category: string;
  spent: number;
}

/** Energy spent per category, heaviest first. */
export function rankCategoryLoad(entries: CategoryLoad[]): CategoryLoad[] {
  return [...entries].sort((a, b) => b.spent - a.spent || a.category.localeCompare(b.category));
}

export interface CapacityOption {
  key: string;
  label: string;
  spoons: number;
}

/**
 * The one-tap capacity choices for the morning check-in.
 *
 * Expressed relative to the user's own usual budget rather than as fixed numbers,
 * because a spoon isn't a unit that means anything across people — "a rough day"
 * is only definable against your own baseline.
 *
 * Values are forced strictly increasing so a small baseline can't produce two
 * buttons that do the same thing.
 */
export function capacityOptions(baseline: number): CapacityOption[] {
  const steps = [
    { key: "rough", label: "Rough", factor: 0.4 },
    { key: "low", label: "Low", factor: 0.7 },
    { key: "usual", label: "Usual", factor: 1 },
    { key: "good", label: "Good", factor: 1.3 },
  ];

  const safeBaseline = Math.max(1, Math.round(baseline));
  let previous = 0;
  return steps.map((step) => {
    const spoons = Math.max(previous + 1, Math.round(safeBaseline * step.factor));
    previous = spoons;
    return { key: step.key, label: step.label, spoons };
  });
}

export const DAY_RATING_LABELS: Record<number, string> = {
  1: "Rough",
  2: "Hard",
  3: "Okay",
  4: "Good",
  5: "Great",
};

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
