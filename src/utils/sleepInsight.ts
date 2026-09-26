/**
 * Sleep attribution and correlation. Pure, so it's testable without Health
 * Connect, a device, or any permission grant.
 */

import { DayRating } from "../types";
import { toDateString } from "./date";

export interface SleepSessionLike {
  startTime: string;
  endTime: string;
}

/**
 * Hours slept, keyed by the date you WOKE UP on.
 *
 * A session running 23:00 to 07:00 belongs to the following morning, because what
 * matters is which day it fuelled — "last night's sleep" is today's context.
 * Attributing it to the start date would pair every night with the wrong day and
 * quietly invert the correlation.
 *
 * Multiple sessions on one date are summed, so naps and split sleep count.
 */
export function sleepHoursByWakeDate(sessions: SleepSessionLike[]): Record<string, number> {
  const byDate: Record<string, number> = {};

  for (const session of sessions) {
    const start = new Date(session.startTime).getTime();
    const end = new Date(session.endTime).getTime();
    if (Number.isNaN(start) || Number.isNaN(end) || end <= start) continue;

    const date = toDateString(new Date(end));
    byDate[date] = (byDate[date] ?? 0) + (end - start) / 3_600_000;
  }

  return byDate;
}

export function formatSleepDuration(hours: number): string {
  const totalMinutes = Math.round(hours * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

export interface SleepDay {
  date: string;
  sleepHours: number | null;
  rating: DayRating | null;
}

/** Rated days with sleep needed before any comparison is offered. */
export const MIN_SAMPLE_FOR_SLEEP = 6;

export interface SleepInsight {
  averageSleepHours: number | null;
  /** Split point between shorter and longer nights, for this person. */
  medianSleepHours: number | null;
  avgRatingAfterShorterNights: number | null;
  avgRatingAfterLongerNights: number | null
  comparableDays: number;
  hasEnoughData: boolean;
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/**
 * Whether shorter nights line up with worse days.
 *
 * Split at this person's own median rather than a fixed "8 hours", because normal
 * varies enormously and a universal threshold would mislabel most people's nights.
 * Same conservatism as the payback analysis: correlational, and silent until there
 * is enough to compare.
 */
export function analyseSleep(days: SleepDay[]): SleepInsight {
  const withBoth = days.filter(
    (day): day is SleepDay & { sleepHours: number; rating: DayRating } =>
      day.sleepHours !== null && day.rating !== null
  );

  const allSleep = days.filter((d) => d.sleepHours !== null).map((d) => d.sleepHours as number);
  const split = median(withBoth.map((d) => d.sleepHours));

  const shorter: number[] = [];
  const longer: number[] = [];
  if (split !== null) {
    for (const day of withBoth) {
      (day.sleepHours < split ? shorter : longer).push(day.rating);
    }
  }

  return {
    averageSleepHours: mean(allSleep),
    medianSleepHours: split,
    avgRatingAfterShorterNights: mean(shorter),
    avgRatingAfterLongerNights: mean(longer),
    comparableDays: withBoth.length,
    // Both sides of the split need something in them, or there's nothing to compare.
    hasEnoughData:
      withBoth.length >= MIN_SAMPLE_FOR_SLEEP && shorter.length > 0 && longer.length > 0,
  };
}

export function describeSleep(insight: SleepInsight): string {
  if (!insight.hasEnoughData) {
    return insight.comparableDays === 0
      ? "Once there are a few rated days with sleep recorded, this will show whether short nights line up with harder days."
      : `Not enough yet — ${insight.comparableDays} rated day${
          insight.comparableDays === 1 ? "" : "s"
        } with sleep so far.`;
  }

  const shorter = insight.avgRatingAfterShorterNights as number;
  const longer = insight.avgRatingAfterLongerNights as number;
  const split = formatSleepDuration(insight.medianSleepHours as number);

  if (Math.abs(longer - shorter) < 0.3) {
    return `Sleep length hasn't tracked how your days go — ${shorter.toFixed(
      1
    )} after shorter nights against ${longer.toFixed(1)} after longer ones.`;
  }

  const direction = longer > shorter ? "better" : "worse";
  return `Days after longer nights than ${split} have averaged ${direction}: ${longer.toFixed(
    1
  )} against ${shorter.toFixed(1)} after shorter ones.`;
}
