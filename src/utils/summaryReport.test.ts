import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { analysePayback, DayRecord } from "../db/logic";
import { buildSummaryReport, summaryFileName, SummaryInput } from "./summaryReport";

const records: DayRecord[] = [
  { date: "2026-09-20", budget: 10, spent: 12, rating: 4 },
  { date: "2026-09-21", budget: 10, spent: 4, rating: 2 },
  { date: "2026-09-22", budget: 10, spent: 0, rating: null }, // untouched day
  { date: "2026-09-23", budget: 8, spent: 6, rating: 3 },
];

function input(overrides: Partial<SummaryInput> = {}): SummaryInput {
  return {
    from: "2026-09-20",
    to: "2026-09-23",
    records,
    payback: analysePayback(records),
    categories: [
      { category: "movement", spent: 12 },
      { category: "rest", spent: 6 },
    ],
    tasks: [{ name: "10 min walk", schedule: "every 2 days · 3 energy", completions: 4 }],
    avgCapacity: 9.3,
    avgSpent: 7.3,
    ...overrides,
  };
}

describe("buildSummaryReport", () => {
  it("states the range and the headline figures", () => {
    const report = buildSummaryReport(input());
    assert.match(report, /2026-09-20 to 2026-09-23/);
    assert.match(report, /Typical daily capacity\s+9\.3/);
    assert.match(report, /Typical daily spend\s+7\.3/);
    assert.match(report, /Days over capacity\s+1/);
    assert.match(report, /Days rated\s+3/);
  });

  it("explains that the units are self-defined", () => {
    // A clinician reading "spent 12" needs to know it isn't a standard measure.
    assert.match(buildSummaryReport(input()), /self-defined units/);
  });

  it("omits days the app was never opened from the daily detail", () => {
    const report = buildSummaryReport(input());
    assert.ok(report.includes("2026-09-21"), "an active day should be listed");
    assert.ok(
      !report.includes("2026-09-22"),
      "a day with no spend and no rating would read as 'did nothing'"
    );
  });

  it("includes categories and activities", () => {
    const report = buildSummaryReport(input());
    assert.match(report, /movement\s+12/);
    assert.match(report, /10 min walk/);
    assert.match(report, /completed 4×/);
  });

  it("omits empty sections rather than printing bare headings", () => {
    const report = buildSummaryReport(input({ categories: [], tasks: [] }));
    assert.ok(!report.includes("ENERGY BY CATEGORY"));
    assert.ok(!report.includes("ACTIVITIES"));
  });

  it("renders em dashes rather than zeroes for unknown averages", () => {
    const report = buildSummaryReport(input({ avgCapacity: null, avgSpent: null }));
    assert.match(report, /Typical daily capacity\s+—/);
  });

  it("does not claim a pattern from too little data", () => {
    const report = buildSummaryReport(input());
    assert.match(report, /Not enough to compare/);
    assert.ok(
      !report.includes("not a clinical finding"),
      "the caveat belongs with an actual claim, not with a refusal to make one"
    );
  });

  it("caveats the payback finding when there is one", () => {
    const many: DayRecord[] = [
      { date: "2026-09-01", budget: 10, spent: 14, rating: 4 },
      { date: "2026-09-02", budget: 10, spent: 4, rating: 2 },
      { date: "2026-09-03", budget: 10, spent: 15, rating: 3 },
      { date: "2026-09-04", budget: 10, spent: 4, rating: 1 },
      { date: "2026-09-05", budget: 10, spent: 13, rating: 3 },
      { date: "2026-09-06", budget: 10, spent: 4, rating: 2 },
    ];
    const report = buildSummaryReport(
      input({ records: many, payback: analysePayback(many) })
    );
    assert.match(report, /not a clinical finding/);
  });
});

describe("summaryFileName", () => {
  it("names the file by range end and length", () => {
    assert.equal(summaryFileName("2026-09-26", 30), "spoons-summary-2026-09-26-30d.txt");
  });
});
