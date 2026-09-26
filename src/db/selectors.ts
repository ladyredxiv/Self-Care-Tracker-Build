/**
 * Adapters between the database and the pure logic in logic.ts. Screens read
 * from here so there's exactly one place that decides what "today" looks like.
 */

import { shiftDateString } from "../utils/date";
import {
  DEFAULT_BUDGET_KEY,
  getAllTasks,
  getBudgetForDate,
  getDayLogsBetween,
  getEnergySpentByCategory,
  getCompletedDatesByTask,
  getCompletionsForDate,
  getEnergySpentByDate,
  getSetting,
  markCheckedIn,
  materializeBudgetForDate,
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
  PaybackInsight,
  rankCategoryLoad,
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
  });
}

export interface Insights {
  payback: PaybackInsight;
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

  return {
    payback: analysePayback(records),
    categories: rankCategoryLoad(getEnergySpentByCategory(start, today)),
    avgCapacity: average(active.map((r) => r.budget)),
    avgSpent: average(active.map((r) => r.spent)),
  };
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
