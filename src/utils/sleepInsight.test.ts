import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { DayRating } from "../types";
import {
  analyseSleep,
  describeSleep,
  formatSleepDuration,
  MIN_SAMPLE_FOR_SLEEP,
  SleepDay,
  sleepHoursByWakeDate,
} from "./sleepInsight";

// Local times, matching the TZ the test runner pins.
const night = (start: string, end: string) => ({ startTime: start, endTime: end });

describe("sleepHoursByWakeDate", () => {
  it("attributes a night to the morning you woke up", () => {
    // 23:00 on the 25th to 07:00 on the 26th fuelled the 26th, not the 25th.
    // Attributing it to the start date would pair every night with the wrong day.
    const hours = sleepHoursByWakeDate([
      night("2026-09-25T23:00:00-04:00", "2026-09-26T07:00:00-04:00"),
    ]);
    assert.deepEqual(hours, { "2026-09-26": 8 });
  });

  it("sums split sleep and naps on the same date", () => {
    const hours = sleepHoursByWakeDate([
      night("2026-09-25T23:00:00-04:00", "2026-09-26T03:00:00-04:00"),
      night("2026-09-26T04:00:00-04:00", "2026-09-26T07:00:00-04:00"),
    ]);
    assert.equal(hours["2026-09-26"], 7);
  });

  it("ignores sessions that end before they start", () => {
    assert.deepEqual(
      sleepHoursByWakeDate([night("2026-09-26T07:00:00-04:00", "2026-09-25T23:00:00-04:00")]),
      {}
    );
  });

  it("ignores unparseable timestamps", () => {
    assert.deepEqual(sleepHoursByWakeDate([night("not a date", "also not")]), {});
  });

  it("returns nothing for no sessions", () => {
    assert.deepEqual(sleepHoursByWakeDate([]), {});
  });
});

describe("formatSleepDuration", () => {
  it("drops the minutes when there are none", () => {
    assert.equal(formatSleepDuration(8), "8h");
  });

  it("shows hours and minutes", () => {
    assert.equal(formatSleepDuration(6.5), "6h 30m");
  });

  it("rounds to the nearest minute", () => {
    assert.equal(formatSleepDuration(7.008), "7h");
  });
});

describe("analyseSleep", () => {
  const day = (date: string, sleepHours: number | null, rating: DayRating | null): SleepDay => ({
    date,
    sleepHours,
    rating,
  });

  it("stays quiet below the sample threshold", () => {
    const insight = analyseSleep([day("2026-09-01", 6, 3), day("2026-09-02", 8, 4)]);
    assert.equal(insight.hasEnoughData, false);
    assert.match(describeSleep(insight), /Not enough yet/);
  });

  it("asks for data when there is none", () => {
    const insight = analyseSleep([day("2026-09-01", null, null)]);
    assert.equal(insight.comparableDays, 0);
    assert.match(describeSleep(insight), /Once there are a few rated days/);
  });

  it("splits at the person's own median rather than a fixed eight hours", () => {
    // Everything here is under 8h, so a fixed threshold would put every night on one
    // side and find nothing to compare.
    const days = [
      day("2026-09-01", 4, 1),
      day("2026-09-02", 4.5, 2),
      day("2026-09-03", 5, 2),
      day("2026-09-04", 6, 4),
      day("2026-09-05", 6.5, 4),
      day("2026-09-06", 7, 5),
    ];
    const insight = analyseSleep(days);
    assert.equal(insight.hasEnoughData, true);
    assert.equal(insight.medianSleepHours, 5.5);
    assert.ok(
      (insight.avgRatingAfterLongerNights as number) >
        (insight.avgRatingAfterShorterNights as number)
    );
    assert.match(describeSleep(insight), /longer nights/);
  });

  it("reports when sleep length hasn't tracked anything", () => {
    const days = Array.from({ length: MIN_SAMPLE_FOR_SLEEP }, (_, i) =>
      day(`2026-09-0${i + 1}`, 4 + i, 3 as DayRating)
    );
    const insight = analyseSleep(days);
    assert.equal(insight.hasEnoughData, true);
    assert.match(describeSleep(insight), /hasn't tracked/);
  });

  it("needs both sides of the split populated", () => {
    // Identical sleep every night: the median equals every value, so nothing lands
    // on the "shorter" side and there is no comparison to draw.
    const days = Array.from({ length: 8 }, (_, i) => day(`2026-09-0${i + 1}`, 7, 3 as DayRating));
    assert.equal(analyseSleep(days).hasEnoughData, false);
  });

  it("averages sleep across nights even when unrated", () => {
    const insight = analyseSleep([day("2026-09-01", 6, null), day("2026-09-02", 8, null)]);
    assert.equal(insight.averageSleepHours, 7);
    assert.equal(insight.comparableDays, 0);
  });

  it("handles an empty window", () => {
    const insight = analyseSleep([]);
    assert.equal(insight.averageSleepHours, null);
    assert.equal(insight.hasEnoughData, false);
  });
});
