import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  addDays,
  dayOfWeekFor,
  parseDateString,
  shiftDateString,
  startOfNextDay,
  startOfWeek,
  toDateString,
  weekDates,
} from "./date";

describe("toDateString", () => {
  it("uses the local calendar date, not UTC", () => {
    // 8pm Sep 25 local is already Sep 26 in UTC for any timezone west of UTC.
    // toISOString().slice(0, 10) was returning tomorrow's date here.
    const evening = new Date(2026, 8, 25, 20, 30, 0);
    assert.equal(toDateString(evening), "2026-09-25");
  });

  it("stays on the local date just before midnight", () => {
    assert.equal(toDateString(new Date(2026, 8, 25, 23, 59, 59)), "2026-09-25");
  });

  it("stays on the local date just after midnight", () => {
    assert.equal(toDateString(new Date(2026, 8, 26, 0, 0, 1)), "2026-09-26");
  });

  it("zero-pads single-digit months and days", () => {
    assert.equal(toDateString(new Date(2026, 0, 5, 12, 0, 0)), "2026-01-05");
  });
});

describe("parseDateString", () => {
  it("parses to local midnight rather than UTC midnight", () => {
    const parsed = parseDateString("2026-09-25");
    assert.equal(parsed.getFullYear(), 2026);
    assert.equal(parsed.getMonth(), 8);
    assert.equal(parsed.getDate(), 25);
    assert.equal(parsed.getHours(), 0);
  });

  it("round-trips through toDateString", () => {
    assert.equal(toDateString(parseDateString("2026-02-29")), "2026-03-01"); // 2026 isn't a leap year
    assert.equal(toDateString(parseDateString("2026-12-31")), "2026-12-31");
  });
});

describe("addDays / shiftDateString", () => {
  it("walks backwards across a month boundary", () => {
    assert.equal(shiftDateString("2026-03-01", -1), "2026-02-28");
  });

  it("walks backwards across a year boundary", () => {
    assert.equal(shiftDateString("2026-01-01", -1), "2025-12-31");
  });

  it("does not mutate the input date", () => {
    const original = new Date(2026, 8, 25);
    addDays(original, -5);
    assert.equal(original.getDate(), 25);
  });
});

describe("startOfWeek / weekDates", () => {
  // 2026-09-27 is a Sunday, so that week runs to Saturday 2026-10-03.
  it("returns the date itself when it is already Sunday", () => {
    assert.equal(startOfWeek("2026-09-27"), "2026-09-27");
  });

  it("walks back to Sunday from mid-week", () => {
    assert.equal(startOfWeek("2026-09-29"), "2026-09-27");
    assert.equal(startOfWeek("2026-10-03"), "2026-09-27");
  });

  it("gives seven dates, Sunday first and Saturday last", () => {
    const week = weekDates("2026-09-29");
    assert.equal(week.length, 7);
    assert.equal(week[0], "2026-09-27");
    assert.equal(week[6], "2026-10-03");
  });

  it("crosses a month boundary within one week", () => {
    assert.deepEqual(weekDates("2026-10-01").slice(3, 6), [
      "2026-09-30",
      "2026-10-01",
      "2026-10-02",
    ]);
  });

  it("gives the same week for every day in it", () => {
    const week = weekDates("2026-09-27");
    for (const date of week) {
      assert.deepEqual(weekDates(date), week, `${date} produced a different week`);
    }
  });
});

describe("startOfNextDay", () => {
  it("lands just after midnight on the following day", () => {
    const at = startOfNextDay("2026-09-27");
    assert.equal(toDateString(at), "2026-09-28");
    assert.equal(at.getHours(), 0);
    assert.equal(at.getMinutes(), 1);
  });

  it("is not exactly midnight", () => {
    // Scheduling on the boundary risks delivering a hair early and computing the
    // day that just ended.
    assert.ok(startOfNextDay("2026-09-27").getMinutes() > 0);
  });

  it("crosses a month boundary", () => {
    assert.equal(toDateString(startOfNextDay("2026-09-30")), "2026-10-01");
  });

  it("crosses a year boundary", () => {
    assert.equal(toDateString(startOfNextDay("2026-12-31")), "2027-01-01");
  });

  it("is always in the future relative to its own date", () => {
    const date = "2026-09-27";
    assert.ok(startOfNextDay(date).getTime() > parseDateString(date).getTime());
  });
});

describe("dayOfWeekFor", () => {
  it("reports Sunday as 0", () => {
    assert.equal(dayOfWeekFor("2026-09-27"), 0);
  });

  it("reports Friday as 5", () => {
    assert.equal(dayOfWeekFor("2026-09-25"), 5);
  });
});
