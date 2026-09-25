/**
 * Adapters between the database and the pure logic in logic.ts. Screens read
 * from here so there's exactly one place that decides what "today" looks like.
 */

import { shiftDateString } from "../utils/date";
import {
  DEFAULT_BUDGET_KEY,
  getAllTasks,
  getBudgetForDate,
  getCompletedDatesByTask,
  getCompletionsForDate,
  getEnergySpentByDate,
  getSetting,
  materializeBudgetForDate,
} from "./database";
import { buildDayStatus, buildUsageTrend, DayStatus, DayUsage } from "./logic";

/** Used until the user sets a budget of their own. */
export const FALLBACK_BUDGET = 10;

export function getDefaultBudget(): number {
  const raw = getSetting(DEFAULT_BUDGET_KEY);
  const parsed = raw !== null ? parseInt(raw, 10) : NaN;
  return Number.isNaN(parsed) ? FALLBACK_BUDGET : parsed;
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
