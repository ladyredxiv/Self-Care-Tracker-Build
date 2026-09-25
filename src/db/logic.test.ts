import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { DayOfWeek, Task } from "../types";
import {
  buildDayStatus,
  buildUsageTrend,
  computeStreak,
  groupByTimeOfDay,
  isScheduledOn,
} from "./logic";

function makeTask(overrides: Partial<Task> & { id: number }): Task {
  return {
    name: `task-${overrides.id}`,
    energyCost: 1,
    category: "general",
    timeOfDay: "anytime",
    daysOfWeek: [],
    isRecurring: true,
    reminderEnabled: false,
    reminderTime: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

const EVERY_DAY: DayOfWeek[] = [];
const MON_WED_FRI: DayOfWeek[] = [1, 3, 5];

// 2026-09-25 is a Friday.
const FRIDAY = "2026-09-25";
const SATURDAY = "2026-09-26";

describe("isScheduledOn", () => {
  it("treats an empty daysOfWeek as every day", () => {
    assert.equal(isScheduledOn({ daysOfWeek: EVERY_DAY }, FRIDAY), true);
    assert.equal(isScheduledOn({ daysOfWeek: EVERY_DAY }, SATURDAY), true);
  });

  it("matches the local weekday", () => {
    assert.equal(isScheduledOn({ daysOfWeek: MON_WED_FRI }, FRIDAY), true);
    assert.equal(isScheduledOn({ daysOfWeek: MON_WED_FRI }, SATURDAY), false);
  });
});

describe("computeStreak", () => {
  it("counts consecutive daily completions", () => {
    const dates = new Set(["2026-09-25", "2026-09-24", "2026-09-23"]);
    assert.equal(computeStreak(dates, EVERY_DAY, FRIDAY), 3);
  });

  it("keeps the streak alive when today is not done yet", () => {
    const dates = new Set(["2026-09-24", "2026-09-23"]);
    assert.equal(computeStreak(dates, EVERY_DAY, FRIDAY), 2);
  });

  it("breaks on a missed earlier day", () => {
    const dates = new Set(["2026-09-25", "2026-09-23"]); // 24th missed
    assert.equal(computeStreak(dates, EVERY_DAY, FRIDAY), 1);
  });

  it("returns 0 with no completions", () => {
    assert.equal(computeStreak(new Set(), EVERY_DAY, FRIDAY), 0);
  });

  it("ignores unscheduled days for a Mon/Wed/Fri task", () => {
    // Fri 25th, Wed 23rd, Mon 21st — consecutive *scheduled* days.
    // The old day-by-day walk scored this 1 because Thu 24th had no completion.
    const dates = new Set(["2026-09-25", "2026-09-23", "2026-09-21"]);
    assert.equal(computeStreak(dates, MON_WED_FRI, FRIDAY), 3);
  });

  it("does not break a Mon/Wed/Fri streak when evaluated on an off day", () => {
    const dates = new Set(["2026-09-25", "2026-09-23", "2026-09-21"]);
    assert.equal(computeStreak(dates, MON_WED_FRI, SATURDAY), 3);
  });

  it("breaks a Mon/Wed/Fri streak on a missed scheduled day", () => {
    const dates = new Set(["2026-09-25", "2026-09-21"]); // Wed 23rd missed
    assert.equal(computeStreak(dates, MON_WED_FRI, FRIDAY), 1);
  });

  it("terminates on a daysOfWeek array that matches nothing real", () => {
    assert.equal(computeStreak(new Set(), [9 as DayOfWeek], FRIDAY), 0);
  });
});

describe("buildDayStatus", () => {
  const noCompletionDates = new Map<number, Set<string>>();

  it("reports spend and remaining from a single calculation", () => {
    const tasks = [
      makeTask({ id: 1, energyCost: 3 }),
      makeTask({ id: 2, energyCost: 4 }),
    ];
    const status = buildDayStatus({
      tasks,
      date: FRIDAY,
      budget: 10,
      completedTaskIds: new Set([1]),
      completedDatesByTask: noCompletionDates,
    });
    assert.equal(status.spent, 3);
    assert.equal(status.remaining, 7);
    assert.equal(status.budget, 10);
  });

  it("counts completed-but-unscheduled tasks toward spend", () => {
    // Completing a task and then editing it to exclude today used to make the
    // header disagree with the budget-fit calculation.
    const tasks = [makeTask({ id: 1, energyCost: 5, daysOfWeek: MON_WED_FRI })];
    const status = buildDayStatus({
      tasks,
      date: SATURDAY,
      budget: 10,
      completedTaskIds: new Set([1]),
      completedDatesByTask: noCompletionDates,
    });
    assert.equal(status.spent, 5);
    assert.equal(status.remaining, 5);
    assert.equal(status.tasks[0].scheduledToday, false);
    assert.equal(status.tasks[0].completedToday, true);
  });

  it("fits tasks greedily cheapest-first", () => {
    const tasks = [
      makeTask({ id: 1, energyCost: 2 }),
      makeTask({ id: 2, energyCost: 3 }),
      makeTask({ id: 3, energyCost: 4 }),
    ];
    const status = buildDayStatus({
      tasks,
      date: FRIDAY,
      budget: 5,
      completedTaskIds: new Set(),
      completedDatesByTask: noCompletionDates,
    });
    const fits = status.tasks.map((t) => [t.id, t.fitsRemainingBudget]);
    // 2 + 3 exhausts the budget, so the 4-cost task no longer fits.
    assert.deepEqual(fits, [
      [1, true],
      [2, true],
      [3, false],
    ]);
  });

  it("always marks completed tasks as fitting, even past budget", () => {
    const tasks = [makeTask({ id: 1, energyCost: 12 })];
    const status = buildDayStatus({
      tasks,
      date: FRIDAY,
      budget: 5,
      completedTaskIds: new Set([1]),
      completedDatesByTask: noCompletionDates,
    });
    assert.equal(status.tasks[0].fitsRemainingBudget, true);
    assert.equal(status.remaining, -7);
  });

  it("sorts scheduled tasks ahead of unscheduled ones", () => {
    const tasks = [
      makeTask({ id: 1, energyCost: 9, daysOfWeek: MON_WED_FRI }),
      makeTask({ id: 2, energyCost: 1, daysOfWeek: [0] }),
    ];
    const status = buildDayStatus({
      tasks,
      date: FRIDAY,
      budget: 10,
      completedTaskIds: new Set(),
      completedDatesByTask: noCompletionDates,
    });
    assert.deepEqual(
      status.tasks.map((t) => t.id),
      [1, 2]
    );
  });

  it("attaches per-task streaks", () => {
    const tasks = [makeTask({ id: 1 })];
    const status = buildDayStatus({
      tasks,
      date: FRIDAY,
      budget: 10,
      completedTaskIds: new Set([1]),
      completedDatesByTask: new Map([[1, new Set(["2026-09-25", "2026-09-24"])]]),
    });
    assert.equal(status.tasks[0].streak, 2);
  });
});

describe("groupByTimeOfDay", () => {
  it("orders groups morning, afternoon, evening, then anytime", () => {
    const tasks = [
      { id: 1, timeOfDay: "anytime" as const },
      { id: 2, timeOfDay: "evening" as const },
      { id: 3, timeOfDay: "morning" as const },
      { id: 4, timeOfDay: "afternoon" as const },
    ];
    assert.deepEqual(
      groupByTimeOfDay(tasks).map((g) => g.timeOfDay),
      ["morning", "afternoon", "evening", "anytime"]
    );
  });

  it("omits empty groups", () => {
    const tasks = [{ id: 1, timeOfDay: "evening" as const }];
    assert.deepEqual(
      groupByTimeOfDay(tasks).map((g) => g.timeOfDay),
      ["evening"]
    );
  });

  it("preserves input order within a group so greedy budget order survives", () => {
    const tasks = [
      { id: 1, timeOfDay: "morning" as const },
      { id: 2, timeOfDay: "evening" as const },
      { id: 3, timeOfDay: "morning" as const },
    ];
    const morning = groupByTimeOfDay(tasks).find((g) => g.timeOfDay === "morning");
    assert.deepEqual(morning?.tasks.map((t) => t.id), [1, 3]);
  });

  it("returns nothing for no tasks", () => {
    assert.deepEqual(groupByTimeOfDay([]), []);
  });

  it("keeps every task when grouping a full day", () => {
    const tasks = [
      makeTask({ id: 1, energyCost: 1, timeOfDay: "evening" }),
      makeTask({ id: 2, energyCost: 2, timeOfDay: "morning" }),
      makeTask({ id: 3, energyCost: 3, timeOfDay: "morning" }),
    ];
    const status = buildDayStatus({
      tasks,
      date: FRIDAY,
      budget: 10,
      completedTaskIds: new Set(),
      completedDatesByTask: new Map(),
    });
    const grouped = groupByTimeOfDay(status.tasks);
    assert.equal(grouped.flatMap((g) => g.tasks).length, 3);
    // cheapest-first ordering from buildDayStatus survives inside the group
    assert.deepEqual(
      grouped.find((g) => g.timeOfDay === "morning")?.tasks.map((t) => t.id),
      [2, 3]
    );
  });
});

describe("buildUsageTrend", () => {
  it("prefers each day's saved budget over the current default", () => {
    const trend = buildUsageTrend(
      ["2026-09-24", "2026-09-25"],
      { "2026-09-24": 6, "2026-09-25": 12 },
      { "2026-09-25": 4 },
      99
    );
    assert.deepEqual(trend, [
      { date: "2026-09-24", budget: 6, spent: 0, hasExplicitBudget: true },
      { date: "2026-09-25", budget: 12, spent: 4, hasExplicitBudget: true },
    ]);
  });

  it("falls back only for days with no saved budget", () => {
    const trend = buildUsageTrend(["2026-09-24"], { "2026-09-24": null }, {}, 10);
    assert.deepEqual(trend, [
      { date: "2026-09-24", budget: 10, spent: 0, hasExplicitBudget: false },
    ]);
  });

  it("treats a saved budget of 0 as explicit", () => {
    const trend = buildUsageTrend(["2026-09-24"], { "2026-09-24": 0 }, {}, 10);
    assert.equal(trend[0].budget, 0);
    assert.equal(trend[0].hasExplicitBudget, true);
  });
});
