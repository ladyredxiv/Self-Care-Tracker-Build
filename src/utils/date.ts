/**
 * Local-time date helpers.
 *
 * Every "YYYY-MM-DD" string in this app is a LOCAL calendar date, not UTC.
 * This matters: the previous implementation used `toISOString().slice(0, 10)`,
 * which rolls over to the next day at UTC midnight — 8pm in US Eastern. Evening
 * self-care is a core use case, so completions were being written under
 * tomorrow's date while `getDay()` still reported today's weekday.
 */

import { DayOfWeek } from "../types";

/** Formats a Date as a local "YYYY-MM-DD" calendar date. */
export function toDateString(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Parses a "YYYY-MM-DD" string as local midnight.
 * `new Date("2026-09-25")` would parse as UTC midnight, which is the bug above.
 */
export function parseDateString(date: string): Date {
  const [year, month, day] = date.split("-").map((n) => parseInt(n, 10));
  return new Date(year, month - 1, day);
}

/** Returns a new Date `days` after `date` (negative walks backwards). */
export function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

/** Shifts a local date string by `days`, staying in local time throughout. */
export function shiftDateString(date: string, days: number): string {
  return toDateString(addDays(parseDateString(date), days));
}

/**
 * Whole days from `from` to `to`, negative if `to` is earlier.
 *
 * Rounded rather than truncated because a DST transition makes a local day 23 or
 * 25 hours long, which would otherwise shift the result by one.
 */
export function daysBetween(from: string, to: string): number {
  const ms = parseDateString(to).getTime() - parseDateString(from).getTime();
  return Math.round(ms / 86_400_000);
}

/**
 * Local date portion of an ISO timestamp, falling back when it can't be parsed —
 * createdAt comes from the database and shouldn't be able to crash scheduling.
 */
export function dateStringFromISO(iso: string, fallback: string): string {
  const parsed = new Date(iso);
  return Number.isNaN(parsed.getTime()) ? fallback : toDateString(parsed);
}

/** Day of week (0 = Sunday) for a local date string. */
export function dayOfWeekFor(date: string): DayOfWeek {
  return parseDateString(date).getDay() as DayOfWeek;
}
