export type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0 = Sunday

export type TimeOfDay = "morning" | "afternoon" | "evening" | "anytime";

/**
 * How a task recurs. These are genuinely different kinds of recurrence rather
 * than variations on one:
 *
 * - `daily`    — non-negotiables, due every day.
 * - `weekdays` — tied to the calendar, e.g. therapy homework on Tuesdays.
 * - `interval` — every N days *since last done*, for maintenance like showers or
 *                sheets. Unlike weekdays this can't be lost by being skipped: it
 *                stays due and accrues waiting time, and a week has an odd number
 *                of days so weekday sets can't express "every other day" anyway.
 * - `once`     — a single occurrence that disappears once done.
 */
export type ScheduleType = "daily" | "weekdays" | "interval" | "once";

/** How per-task progress is shown. "recent" is the default because it doesn't punish crashes. */
export type ProgressStyle = "recent" | "streak" | "hidden";

export interface Task {
  id: number;
  name: string;
  energyCost: number;
  category: string;
  timeOfDay: TimeOfDay;
  scheduleType: ScheduleType;
  daysOfWeek: DayOfWeek[]; // only meaningful for "weekdays"; empty = every day
  intervalDays: number | null; // only meaningful for "interval"
  /**
   * Always gets a spoon: allocated before anything else regardless of cost or how
   * long other things have waited. For medication, hygiene — the things that
   * mustn't be crowded out by a long-neglected chore.
   */
  isEssential: boolean;
  reminderEnabled: boolean;
  reminderTime: string | null; // "HH:MM", 24-hour, local time
  createdAt: string;
}

export interface Completion {
  id: number;
  taskId: number;
  date: string; // YYYY-MM-DD
  completedAt: string;
}

export interface DailyBudget {
  date: string; // YYYY-MM-DD
  budget: number;
}

/** How many spoons the day was rated as having gone, 1 (rough) to 5 (great). */
export type DayRating = 1 | 2 | 3 | 4 | 5;

/**
 * What the user said about a day, as opposed to what they did in it.
 *
 * Kept separate from completions and budgets because it records outcome rather
 * than activity — whether the pacing actually worked, which is the only thing that
 * makes overspend patterns interpretable.
 */
export interface DayLog {
  date: string; // YYYY-MM-DD
  /** Whether capacity was confirmed for the day, vs. silently inherited. */
  checkedIn: boolean;
  rating: DayRating | null;
  note: string | null;
}

/**
 * Raw table contents for a backup. Rows stay in their on-disk shape (daysOfWeek as
 * a JSON string, booleans as 0/1) so a restore is a straight reinsert.
 */
export interface DatabaseSnapshot {
  tasks: any[];
  completions: any[];
  dailyBudgets: any[];
  settings: any[];
  /** Optional: absent from backups written before day logs existed. */
  dayLogs?: any[];
}

export interface TaskWithStatus extends Task {
  completedToday: boolean;
  fitsRemainingBudget: boolean;
  scheduledToday: boolean;
  streak: number;
  /** Completions within the recent window, for the non-punishing progress measure. */
  recentCompletions: number;
  /**
   * Days elapsed since an interval task became due — 0 if due today, or for any
   * other schedule type. Drives both display and budget priority.
   */
  daysWaiting: number;
}
