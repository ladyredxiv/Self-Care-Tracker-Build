/**
 * Adapters between the database and the pure logic in logic.ts. Screens read
 * from here so there's exactly one place that decides what "today" looks like.
 */

import { shiftDateString } from "../utils/date";
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
  getEnergySpentByDate,
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
  avgSpent: number | null;
}

/**
 * Pattern analysis over a longer window than the chart uses — payback needs enough
 * over-budget days with ratings after them to say anything at all.
 */
export function loadInsights(days: number, today: string): Insights {
  const start = shiftDateString(today, -(days - 1));
  const dates: string[] = [];
  for (let i = days - 1; i >= 0; i--) dates.push(shiftDateString(today, -i));

  const spentByDate = getEnergySpentByDate(start, today);
  const ratingByDate = new Map(getDayLogsBetween(start, today).map((log) => [log.date, log.rating]));
  const fallback = getDefaultBudget();

  const records: DayRecord[] = dates.map((date) => ({
    date,
    budget: getBudgetForDate(date) ?? fallback,
    spent: spentByDate[date] ?? 0,
    rating: ratingByDate.get(date) ?? null,
  }));

  // Days the user never opened the app have no budget and no spend; averaging them
  // in would drag every figure toward zero.
  const active = records.filter((r) => r.spent > 0 || ratingByDate.has(r.date));
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
    avgSpent: average(active.map((r) => r.spent)),
  };
}

/** Everything the appointment summary needs, gathered in one pass. */
export function loadSummaryInput(days: number, today: string): SummaryInput {
  const from = shiftDateString(today, -(days - 1));
  const insights = loadInsights(days, today);

  const spentByDate = getEnergySpentByDate(from, today);
  const ratingByDate = new Map(getDayLogsBetween(from, today).map((l) => [l.date, l.rating]));
  const fallback = getDefaultBudget();

  const records: DayRecord[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = shiftDateString(today, -i);
    records.push({
      date,
      budget: getBudgetForDate(date) ?? fallback,
      spent: spentByDate[date] ?? 0,
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

export function loadUsageTrend(days: number, today: string): DayUsage[] {
  const dates: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    dates.push(shiftDateString(today, -i));
  }

  const budgetByDate: Record<string, number | null> = {};
  for (const date of dates) {
    budgetByDate[date] = getBudgetForDate(date);
  }

  return buildUsageTrend(
    dates,
    budgetByDate,
    getEnergySpentByDate(dates[0], dates[dates.length - 1]),
    getDefaultBudget()
  );
}
