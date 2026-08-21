import { Task, TaskWithStatus } from "../types";
import {
  DEFAULT_BUDGET_KEY,
  getBudgetForDate,
  getCompletionsForDate,
  getEnergySpentByDate,
  getSetting,
  getStreak,
} from "./database";

export function todayDateString(d: Date = new Date()): string {
  return d.toISOString().slice(0, 10);
}

export function isScheduledToday(task: Task, date: Date): boolean {
  if (task.daysOfWeek.length === 0) return true;
  return task.daysOfWeek.includes(date.getDay() as any);
}

/**
 * Ranks tasks by status for a given day: which are already done, which are
 * scheduled, and which still fit inside the remaining energy budget.
 * Remaining budget is computed greedily in energyCost order (cheapest first)
 * so "fitsRemainingBudget" reflects genuinely achievable combinations, not
 * just "cheaper than the full budget".
 */
export function getTasksWithStatus(tasks: Task[], date: Date, totalBudget: number): TaskWithStatus[] {
  const dateStr = todayDateString(date);
  const completedIds = new Set(getCompletionsForDate(dateStr));

  const spent = tasks
    .filter((t) => completedIds.has(t.id))
    .reduce((sum, t) => sum + t.energyCost, 0);
  let remaining = totalBudget - spent;

  const scheduled = tasks
    .filter((t) => isScheduledToday(t, date))
    .sort((a, b) => a.energyCost - b.energyCost);

  const result: TaskWithStatus[] = [];
  let runningRemaining = remaining;

  for (const task of scheduled) {
    const completedToday = completedIds.has(task.id);
    const fits = completedToday || task.energyCost <= runningRemaining;
    if (fits && !completedToday) {
      runningRemaining -= task.energyCost;
    }
    result.push({
      ...task,
      completedToday,
      fitsRemainingBudget: fits,
      scheduledToday: true,
      streak: getStreak(task.id, dateStr),
    });
  }

  const unscheduled = tasks
    .filter((t) => !isScheduledToday(t, date))
    .map((task) => ({
      ...task,
      completedToday: false,
      fitsRemainingBudget: false,
      scheduledToday: false,
      streak: getStreak(task.id, dateStr),
    }));

  return [...result, ...unscheduled];
}

export interface DayUsage {
  date: string;
  budget: number;
  spent: number;
  /** Whether this day has an explicit saved budget, vs. falling back to the current default. */
  hasExplicitBudget: boolean;
}

/**
 * Energy budget vs. actual spend for each of the last `days` days (oldest first).
 * Days without an explicitly saved budget fall back to the current default budget
 * setting — historical days may not reflect what the default actually was at the
 * time, but this avoids showing blank/zero budgets for days the user never touched
 * the budget input.
 */
export function getUsageTrend(days: number, today: Date = new Date()): DayUsage[] {
  const dates: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    dates.push(todayDateString(d));
  }

  const spentByDate = getEnergySpentByDate(dates[0], dates[dates.length - 1]);
  const defaultSetting = getSetting(DEFAULT_BUDGET_KEY);
  const fallbackBudget = defaultSetting ? parseInt(defaultSetting, 10) : 10;

  return dates.map((date) => {
    const explicitBudget = getBudgetForDate(date);
    return {
      date,
      budget: explicitBudget ?? fallbackBudget,
      spent: spentByDate[date] ?? 0,
      hasExplicitBudget: explicitBudget !== null,
    };
  });
}
