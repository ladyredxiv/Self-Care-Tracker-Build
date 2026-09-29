/**
 * Adapters between the database and the pure logic in logic.ts. Screens read
 * from here so there's exactly one place that decides what "today" looks like.
 */

import { shiftDateString, weekDates } from "../utils/date";
import { readSleepHours } from "../health";
import { analyseSleep, SleepDay, SleepInsight } from "../utils/sleepInsight";
import { SummaryInput, TaskSummaryLine } from "../utils/summaryReport";
import { ProgressStyle, Task } from "../types";
import {
  DEFAULT_BUDGET_KEY,
  getAllTasks,
  getBudgetForDate,
  getCompletionCountsByTask,
  getDayLogsBetween,
  getLoggedCostStats,
  getSpoonsSpentForDate,
  getEnergySpentByCategory,
  getCompletedDatesByTask,
  getCompletionsForDate,
  getEnergyByDate,
  getSetting,
  markCheckedIn,
  materializeBudgetForDate,
  PROGRESS_STYLE_KEY,
  STATUS_NOTIFICATION_KEY,
  setBudgetForDate,
  setSetting,
} from "./database";
import {
  analysePayback,
  buildDayStatus,
  buildUsageTrend,
  CategoryLoad,
  DayRecord,
  DayStatus,
  DayUsage,
  CostSuggestion,
  PaybackInsight,
  rankCategoryLoad,
  suggestCostAdjustments,
} from "./logic";

/**
 * Net position for a day: what was expended less what was given back. This is what
 * "over budget" means, and what the payback analysis compares against.
 */
function netEnergy(energy: { spent: number; restored: number } | undefined): number {
  if (!energy) return 0;
  return energy.spent - energy.restored;
}

/** Used until the user sets a budget of their own. */
export const FALLBACK_BUDGET = 10;

export function getDefaultBudget(): number {
  const raw = getSetting(DEFAULT_BUDGET_KEY);
  const parsed = raw !== null ? parseInt(raw, 10) : NaN;
  return Number.isNaN(parsed) ? FALLBACK_BUDGET : parsed;
}

/**
 * Sets the day's capacity from the check-in and records that it was actively
 * chosen, so the prompt doesn't reappear. Also updates the default so tomorrow
 * starts from today's answer rather than from a number set weeks ago.
 */
export function confirmCapacity(date: string, spoons: number) {
  setBudgetForDate(date, spoons);
  setSetting(DEFAULT_BUDGET_KEY, String(spoons));
  markCheckedIn(date);
}

export function loadDayStatus(date: string): DayStatus {
  return buildDayStatus({
    tasks: getAllTasks(),
    date,
    budget: materializeBudgetForDate(date, getDefaultBudget()),
    completedTaskIds: new Set(getCompletionsForDate(date)),
    completedDatesByTask: getCompletedDatesByTask(),
    spoonsSpentByTask: getSpoonsSpentForDate(date),
  });
}

/**
 * Day status WITHOUT materialising a budget row for the date.
 *
 * loadDayStatus freezes a day's budget the first time it's opened, which is right
 * for today and wrong for tomorrow: pre-creating it would lock tomorrow in at
 * whatever the default happens to be now, so changing the default later today
 * would silently not apply. This is for previewing a day we haven't reached.
 */
export function previewDayStatus(date: string): DayStatus {
  return buildDayStatus({
    tasks: getAllTasks(),
    date,
    budget: getBudgetForDate(date) ?? getDefaultBudget(),
    completedTaskIds: new Set(getCompletionsForDate(date)),
    completedDatesByTask: getCompletedDatesByTask(),
    spoonsSpentByTask: getSpoonsSpentForDate(date),
  });
}

export function getProgressStyle(): ProgressStyle {
  const raw = getSetting(PROGRESS_STYLE_KEY);
  return raw === "streak" || raw === "hidden" || raw === "recent" ? raw : "recent";
}

export function setProgressStyle(style: ProgressStyle) {
  setSetting(PROGRESS_STYLE_KEY, style);
}

export function isStatusNotificationEnabled(): boolean {
  return getSetting(STATUS_NOTIFICATION_KEY) === "on";
}

export function setStatusNotificationEnabled(enabled: boolean) {
  setSetting(STATUS_NOTIFICATION_KEY, enabled ? "on" : "off");
}

export interface Insights {
  payback: PaybackInsight;
  costSuggestions: CostSuggestion[];
  categories: CategoryLoad[];
  avgCapacity: number | null;
  /** Energy expended, never negative. */
  avgSpent: number | null;
  /** Energy given back, reported separately so neither figure can go negative. */
  avgRestored: number | null;
}

/**
 * Pattern analysis over a longer window than the chart uses — payback needs enough
 * over-budget days with ratings after them to say anything at all.
 */
export function loadInsights(days: number, today: string): Insights {
  const start = shiftDateString(today, -(days - 1));
  const dates: string[] = [];
  for (let i = days - 1; i >= 0; i--) dates.push(shiftDateString(today, -i));

  const energyByDate = getEnergyByDate(start, today);
  const ratingByDate = new Map(getDayLogsBetween(start, today).map((log) => [log.date, log.rating]));
  const fallback = getDefaultBudget();

  const records: DayRecord[] = dates.map((date) => ({
    date,
    budget: getBudgetForDate(date) ?? fallback,
    spent: netEnergy(energyByDate[date]),
    rating: ratingByDate.get(date) ?? null,
  }));

  // Days the user never opened the app have no budget and no spend; averaging them
  // in would drag every figure toward zero.
  const active = records.filter(
    (r) => energyByDate[r.date] !== undefined || ratingByDate.has(r.date)
  );
  const average = (values: number[]) =>
    values.length === 0 ? null : values.reduce((a, b) => a + b, 0) / values.length;

  const tasksById = new Map(getAllTasks().map((task) => [task.id, task]));
  const costSuggestions = suggestCostAdjustments(
    getLoggedCostStats(start, today).flatMap((row) => {
      const task = tasksById.get(row.taskId);
      return task
        ? [{
            taskId: row.taskId,
            name: task.name,
            configuredCost: task.energyCost,
            times: row.times,
            averageSpent: row.averageSpent,
          }]
        : [];
    })
  );

  return {
    payback: analysePayback(records),
    costSuggestions,
    categories: rankCategoryLoad(getEnergySpentByCategory(start, today)),
    avgCapacity: average(active.map((r) => r.budget)),
    avgSpent: average(active.map((r) => energyByDate[r.date]?.spent ?? 0)),
    avgRestored: average(active.map((r) => energyByDate[r.date]?.restored ?? 0)),
  };
}

/**
 * Sleep context for a window, paired with the day ratings it should be compared
 * against. Async and separate from loadInsights because Health Connect is a
 * permissioned native query — Stats renders without it and fills this in when it
 * arrives, so a slow or absent provider never blocks the screen.
 */
export async function loadSleepInsight(days: number, today: string): Promise<SleepInsight> {
  const from = shiftDateString(today, -(days - 1));
  const sleepByDate = await readSleepHours(from, today);
  const ratingByDate = new Map(getDayLogsBetween(from, today).map((l) => [l.date, l.rating]));

  const sleepDays: SleepDay[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = shiftDateString(today, -i);
    sleepDays.push({
      date,
      sleepHours: sleepByDate[date] ?? null,
      rating: ratingByDate.get(date) ?? null,
    });
  }
  return analyseSleep(sleepDays);
}

/** Hours slept before today, or null when unavailable. */
export async function loadLastNightSleep(today: string): Promise<number | null> {
  const sleepByDate = await readSleepHours(today, today);
  return sleepByDate[today] ?? null;
}

/** Everything the appointment summary needs, gathered in one pass. */
export function loadSummaryInput(days: number, today: string): SummaryInput {
  const from = shiftDateString(today, -(days - 1));
  const insights = loadInsights(days, today);

  const energyByDate = getEnergyByDate(from, today);
  const ratingByDate = new Map(getDayLogsBetween(from, today).map((l) => [l.date, l.rating]));
  const fallback = getDefaultBudget();

  const records: DayRecord[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = shiftDateString(today, -i);
    records.push({
      date,
      budget: getBudgetForDate(date) ?? fallback,
      spent: netEnergy(energyByDate[date]),
      rating: ratingByDate.get(date) ?? null,
    });
  }

  const counts = new Map(
    getCompletionCountsByTask(from, today).map((row) => [row.taskId, row.completions])
  );
  const tasks: TaskSummaryLine[] = getAllTasks()
    .map((task) => ({
      name: task.name,
      schedule: describeScheduleForReport(task),
      completions: counts.get(task.id) ?? 0,
    }))
    .filter((line) => line.completions > 0)
    .sort((a, b) => b.completions - a.completions || a.name.localeCompare(b.name));

  return {
    from,
    to: today,
    records,
    payback: insights.payback,
    categories: insights.categories,
    tasks,
    avgCapacity: insights.avgCapacity,
    avgSpent: insights.avgSpent,
  };
}

function describeScheduleForReport(task: Task): string {
  const cost =
    task.energyCost < 0 ? `restores ${-task.energyCost}` : `${task.energyCost} energy`;
  switch (task.scheduleType) {
    case "daily":
      return `every day · ${cost}`;
    case "interval":
      return `every ${task.intervalDays ?? 1} days · ${cost}`;
    case "weekdays":
      return `${task.daysOfWeek.length || 7} days a week · ${cost}`;
    case "once":
      return `one-off · ${cost}`;
  }
}

/**
 * The calendar week containing `today`, Sunday to Saturday.
 *
 * A fixed week rather than a rolling window: on a rolling chart every bar shifts
 * daily and there's no stable sense of where you are in the week. Days later in
 * the week are included so the shape of the week is visible, and the chart draws
 * them as empty rather than inventing a capacity for a day not yet reached.
 */
export function loadWeekUsage(today: string): DayUsage[] {
  const dates = weekDates(today);
  const budgetByDate: Record<string, number | null> = {};
  for (const date of dates) budgetByDate[date] = getBudgetForDate(date);

  return buildUsageTrend(
    dates,
    budgetByDate,
    getEnergyByDate(dates[0], dates[dates.length - 1]),
    getDefaultBudget()
  );
}

