import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { addDays, dayOfWeekFor, parseDateString, shiftDateString, toDateString } from "./date";

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

describe("dayOfWeekFor", () => {
  it("reports Sunday as 0", () => {
    assert.equal(dayOfWeekFor("2026-09-27"), 0);
  });

  it("reports Friday as 5", () => {
    assert.equal(dayOfWeekFor("2026-09-25"), 5);
  });
});
