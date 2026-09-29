/**
 * Plain-text summary of a date range, for taking to an appointment.
 *
 * Pure so it can be tested without a filesystem; src/report.ts handles writing and
 * sharing it. Plain text rather than a chart on purpose — it needs to survive being
 * pasted into an email, read aloud, or printed.
 */

import { DayRecord, describePayback, PaybackInsight } from "../db/logic";
import { CategoryLoad } from "../db/logic";

export interface TaskSummaryLine {
  name: string;
  schedule: string;
  completions: number;
}

export interface SummaryInput {
  from: string;
  to: string;
  records: DayRecord[];
  payback: PaybackInsight;
  categories: CategoryLoad[];
  tasks: TaskSummaryLine[];
  avgCapacity: number | null;
  avgSpent: number | null;
}

function formatNumber(value: number | null): string {
  return value === null ? "—" : value.toFixed(1);
}

export function buildSummaryReport(input: SummaryInput): string {
  const { from, to, records, payback, categories, tasks, avgCapacity, avgSpent } = input;

  const rated = records.filter((r) => r.rating !== null);
  // DayRecord.spent is the net position, so this stays correct for days topped up
  // by restorative activities.
  const overBudget = records.filter((r) => r.spent > r.budget);
  const activeDays = records.filter((r) => r.spent !== 0 || r.rating !== null);

  const lines: string[] = [];

  lines.push("SPOONS — SELF-CARE SUMMARY");
  lines.push(`${from} to ${to}`);
  lines.push("");
  lines.push("This is a self-recorded log of daily energy budgeting. Energy is measured");
  lines.push("in self-defined units (“spoons”) and days are self-rated, so figures are");
  lines.push("meaningful relative to each other rather than as clinical measures.");
  lines.push("");

  lines.push("OVERVIEW");
  lines.push(`  Days in range            ${records.length}`);
  lines.push(`  Days with activity       ${activeDays.length}`);
  lines.push(`  Days rated               ${rated.length}`);
  lines.push(`  Typical daily capacity   ${formatNumber(avgCapacity)}`);
  lines.push(`  Typical daily spend      ${formatNumber(avgSpent)}`);
  lines.push(`  Days over capacity       ${overBudget.length}`);
  lines.push(`  Average day rating       ${formatNumber(payback.overallAvgRating)} (1 rough – 5 great)`);
  lines.push("");

  lines.push("AFTER-EFFECTS OF OVERSPENDING");
  lines.push(`  ${describePayback(payback)}`);
  if (payback.hasEnoughData) {
    lines.push("  Correlation within this log only; not a clinical finding.");
  }
  lines.push("");

  if (categories.length > 0) {
    lines.push("ENERGY BY CATEGORY");
    for (const category of categories) {
      lines.push(`  ${category.category.padEnd(22)} ${category.spent}`);
    }
    lines.push("");
  }

  if (tasks.length > 0) {
    lines.push("ACTIVITIES");
    for (const task of tasks) {
      lines.push(`  ${task.name}`);
      lines.push(`    ${task.schedule} · completed ${task.completions}×`);
    }
    lines.push("");
  }

  lines.push("DAILY DETAIL");
  lines.push("  date         capacity  spent  rating");
  for (const record of records) {
    // Days the app was never opened carry no information; listing them as zeroes
    // would read as "did nothing", which isn't what was recorded.
    if (record.spent === 0 && record.rating === null) continue;
    lines.push(
      `  ${record.date}   ${String(record.budget).padStart(6)}  ${String(record.spent).padStart(5)}  ${
        record.rating === null ? "     —" : String(record.rating).padStart(6)
      }`
    );
  }
  lines.push("");

  return lines.join("\n");
}

export function summaryFileName(to: string, days: number): string {
  return `spoons-summary-${to}-${days}d.txt`;
}
