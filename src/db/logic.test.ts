import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { DayOfWeek, ScheduleType, Task } from "../types";
import {
  buildDayStatus,
  buildUsageTrend,
  capacityOptions,
  computeStreak,
  groupByTimeOfDay,
  dueInfoFor,
  intervalDueFrom,
  isDueOn,
  isRetiredOneOff,
  lastCompletionBefore,
  plannedReminders,
} from "./logic";

function makeTask(overrides: Partial<Task> & { id: number }): Task {
  return {
    name: `task-${overrides.id}`,
    energyCost: 1,
    category: "general",
    timeOfDay: "anytime",
    scheduleType: "daily" as ScheduleType,
    daysOfWeek: [],
    intervalDays: null,
    reminderEnabled: false,
    reminderTime: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

const EVERY_DAY: DayOfWeek[] = [];
const MON_WED_FRI: DayOfWeek[] = [1, 3, 5];

// 2026-09-25 is a Friday.
const CREATED = "2026-01-01T00:00:00.000Z";
const FRIDAY = "2026-09-25";
const SATURDAY = "2026-09-26";

describe("isDueOn", () => {
  const none = new Set<string>();

  it("treats a daily task as always due", () => {
    const daily = { scheduleType: "daily" as ScheduleType, daysOfWeek: EVERY_DAY, intervalDays: null, createdAt: CREATED };
    assert.equal(isDueOn(daily, none, FRIDAY), true);
    assert.equal(isDueOn(daily, none, SATURDAY), true);
  });

  it("matches the local weekday for a weekdays task", () => {
    const weekly = { scheduleType: "weekdays" as ScheduleType, daysOfWeek: MON_WED_FRI, intervalDays: null, createdAt: CREATED };
    assert.equal(isDueOn(weekly, none, FRIDAY), true);
    assert.equal(isDueOn(weekly, none, SATURDAY), false);
  });

  it("treats an empty weekday list as every day", () => {
    const weekly = { scheduleType: "weekdays" as ScheduleType, daysOfWeek: EVERY_DAY, intervalDays: null, createdAt: CREATED };
    assert.equal(isDueOn(weekly, none, SATURDAY), true);
  });

  it("treats a one-off as due until it is done", () => {
    const once = { scheduleType: "once" as ScheduleType, daysOfWeek: MON_WED_FRI, intervalDays: null, createdAt: CREATED };
    assert.equal(isDueOn(once, none, SATURDAY), true);
  });
});

describe("capacityOptions", () => {
  it("scales the choices to the user's own baseline", () => {
    assert.deepEqual(
      capacityOptions(10).map((o) => o.spoons),
      [4, 7, 10, 13]
    );
  });

  it("keeps choices strictly increasing on a small baseline", () => {
    // Naive rounding would give 1, 1, 2, 3 — two buttons doing the same thing.
    assert.deepEqual(
      capacityOptions(2).map((o) => o.spoons),
      [1, 2, 3, 4]
    );
  });

  it("never offers zero spoons", () => {
    for (const baseline of [0, 1, -5]) {
      assert.ok(
        capacityOptions(baseline).every((o) => o.spoons >= 1),
        `baseline ${baseline} produced a zero option`
      );
    }
  });

  it("always offers four labelled choices", () => {
    assert.deepEqual(
      capacityOptions(8).map((o) => o.label),
      ["Rough", "Low", "Usual", "Good"]
    );
  });
});

describe("lastCompletionBefore", () => {
  it("finds the most recent completion strictly before the date", () => {
    const dates = new Set(["2026-09-20", "2026-09-23", "2026-09-25"]);
    assert.equal(lastCompletionBefore(dates, FRIDAY), "2026-09-23");
  });

  it("ignores completions on or after the date", () => {
    assert.equal(lastCompletionBefore(new Set([FRIDAY, SATURDAY]), FRIDAY), null);
  });

  it("returns null when there are none", () => {
    assert.equal(lastCompletionBefore(new Set(), FRIDAY), null);
  });
});

describe("interval scheduling", () => {
  const every2 = {
    scheduleType: "interval" as ScheduleType,
    daysOfWeek: EVERY_DAY,
    intervalDays: 2,
    createdAt: CREATED,
  };

  it("becomes due one interval after the last completion", () => {
    assert.equal(intervalDueFrom(every2, new Set(["2026-09-23"]), FRIDAY), "2026-09-25");
  });

  it("is due immediately when never completed", () => {
    // Due since it was created, so it has been waiting ever since.
    // CREATED is UTC midnight on Jan 1, which is 7pm on Dec 31 locally — the
    // local calendar date is what counts, consistently with every other date here.
    assert.equal(intervalDueFrom(every2, new Set(), FRIDAY), "2025-12-31");
  });

  it("is not due the day after being done", () => {
    const info = dueInfoFor(every2, new Set(["2026-09-24"]), FRIDAY);
    assert.equal(info.isDue, false);
    assert.equal(info.daysWaiting, 0);
  });

  it("is due exactly on the interval", () => {
    assert.deepEqual(dueInfoFor(every2, new Set(["2026-09-23"]), FRIDAY), {
      isDue: true,
      daysWaiting: 0,
    });
  });

  it("accrues waiting time when skipped instead of losing the occurrence", () => {
    // Done Sunday the 20th, so due Tuesday the 22nd; by Friday it has waited 3 days.
    // This is the case weekday scheduling handles badly: a missed Wednesday simply
    // vanished until Friday.
    assert.deepEqual(dueInfoFor(every2, new Set(["2026-09-20"]), FRIDAY), {
      isDue: true,
      daysWaiting: 3,
    });
  });

  it("measures from the last completion before the date, not the latest overall", () => {
    // Evaluating Friday must not be influenced by a completion on Saturday.
    const info = dueInfoFor(every2, new Set(["2026-09-20", SATURDAY]), FRIDAY);
    assert.equal(info.daysWaiting, 3);
  });

  it("expresses every other day, which no weekday set can", () => {
    const dates = new Set<string>();
    const due: string[] = [];
    let last = "2026-09-25";
    for (const date of ["2026-09-26", "2026-09-27", "2026-09-28", "2026-09-29"]) {
      dates.add(last);
      if (dueInfoFor(every2, dates, date).isDue) {
        due.push(date);
        last = date;
      }
    }
    assert.deepEqual(due, ["2026-09-27", "2026-09-29"]);
  });

  it("treats a missing or nonsensical interval as daily", () => {
    for (const intervalDays of [null, 0, -3]) {
      assert.equal(
        intervalDueFrom({ ...every2, intervalDays }, new Set(["2026-09-24"]), FRIDAY),
        FRIDAY
      );
    }
  });

  it("falls back to being due now if createdAt is unparseable", () => {
    assert.equal(
      intervalDueFrom({ ...every2, createdAt: "not a date" }, new Set(), FRIDAY),
      FRIDAY
    );
  });
});

describe("isRetiredOneOff", () => {
  it("never retires a recurring task", () => {
    assert.equal(
      isRetiredOneOff({ scheduleType: "daily" }, new Set(["2026-09-24"]), FRIDAY),
      false
    );
  });

  it("keeps an uncompleted one-off around", () => {
    assert.equal(isRetiredOneOff({ scheduleType: "once" }, new Set(), FRIDAY), false);
  });

  it("keeps a one-off visible on the day it was completed", () => {
    assert.equal(isRetiredOneOff({ scheduleType: "once" }, new Set([FRIDAY]), FRIDAY), false);
  });

  it("retires a one-off on days after it was completed", () => {
    assert.equal(isRetiredOneOff({ scheduleType: "once" }, new Set([FRIDAY]), SATURDAY), true);
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

  it("counts a task completed on an off day toward spend, and shows it as done", () => {
    // Completing a task and then editing it to exclude today used to make the
    // header disagree with the budget-fit calculation. Anything completed today
    // also belongs in the main list showing as done, rather than being filed
    // under "not due today" where the tick would be hidden.
    const tasks = [
      makeTask({ id: 1, energyCost: 5, scheduleType: "weekdays", daysOfWeek: MON_WED_FRI }),
    ];
    const status = buildDayStatus({
      tasks,
      date: SATURDAY,
      budget: 10,
      completedTaskIds: new Set([1]),
      completedDatesByTask: noCompletionDates,
    });
    assert.equal(status.spent, 5);
    assert.equal(status.remaining, 5);
    assert.equal(status.tasks[0].completedToday, true);
    assert.equal(status.tasks[0].scheduledToday, true);
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
      makeTask({ id: 1, energyCost: 9, scheduleType: "weekdays", daysOfWeek: MON_WED_FRI }),
      makeTask({ id: 2, energyCost: 1, scheduleType: "weekdays", daysOfWeek: [0] }),
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

describe("plannedReminders", () => {
  // Friday 2026-09-25 at 07:00 local.
  const FRIDAY_MORNING = new Date(2026, 8, 25, 7, 0, 0);
  const reminding = {
    reminderEnabled: true,
    reminderTime: "09:00",
    scheduleType: "daily" as ScheduleType,
    daysOfWeek: EVERY_DAY,
    intervalDays: null,
    createdAt: CREATED,
  };

  it("plans one reminder per day across the horizon", () => {
    const planned = plannedReminders(reminding, new Set(), FRIDAY_MORNING, 3);
    assert.deepEqual(
      planned.map((p) => p.date),
      ["2026-09-25", "2026-09-26", "2026-09-27"]
    );
  });

  it("fires at the task's local reminder time", () => {
    const [first] = plannedReminders(reminding, new Set(), FRIDAY_MORNING, 1);
    assert.equal(first.at.getHours(), 9);
    assert.equal(first.at.getMinutes(), 0);
    assert.equal(first.at.getDate(), 25);
  });

  it("skips days already completed", () => {
    const planned = plannedReminders(reminding, new Set(["2026-09-26"]), FRIDAY_MORNING, 3);
    assert.deepEqual(
      planned.map((p) => p.date),
      ["2026-09-25", "2026-09-27"]
    );
  });

  it("skips today when its time has already passed", () => {
    const evening = new Date(2026, 8, 25, 21, 0, 0);
    const planned = plannedReminders(reminding, new Set(), evening, 2);
    assert.deepEqual(
      planned.map((p) => p.date),
      ["2026-09-26"]
    );
  });

  it("only plans days the task is scheduled for", () => {
    const planned = plannedReminders(
      { ...reminding, scheduleType: "weekdays", daysOfWeek: MON_WED_FRI },
      new Set(),
      FRIDAY_MORNING,
      7
    );
    assert.deepEqual(
      planned.map((p) => p.date),
      ["2026-09-25", "2026-09-28", "2026-09-30"]
    );
  });

  it("plans nothing when reminders are off", () => {
    assert.deepEqual(
      plannedReminders({ ...reminding, reminderEnabled: false }, new Set(), FRIDAY_MORNING, 5),
      []
    );
  });

  it("plans nothing without a reminder time", () => {
    assert.deepEqual(
      plannedReminders({ ...reminding, reminderTime: null }, new Set(), FRIDAY_MORNING, 5),
      []
    );
  });

  it("plans nothing for a malformed reminder time", () => {
    for (const bad of ["9am", "25:00", "09:60", "", "0900"]) {
      assert.deepEqual(
        plannedReminders({ ...reminding, reminderTime: bad }, new Set(), FRIDAY_MORNING, 5),
        [],
        `expected "${bad}" to be rejected`
      );
    }
  });

  it("returns nothing for a zero horizon", () => {
    assert.deepEqual(plannedReminders(reminding, new Set(), FRIDAY_MORNING, 0), []);
  });

  it("crosses a month boundary correctly", () => {
    const planned = plannedReminders(reminding, new Set(), new Date(2026, 8, 29, 7, 0, 0), 3);
    assert.deepEqual(
      planned.map((p) => p.date),
      ["2026-09-29", "2026-09-30", "2026-10-01"]
    );
  });

  it("reminds every day for an uncompleted one-off", () => {
    const planned = plannedReminders(
      { ...reminding, scheduleType: "once", daysOfWeek: MON_WED_FRI },
      new Set(),
      FRIDAY_MORNING,
      3
    );
    assert.deepEqual(
      planned.map((p) => p.date),
      ["2026-09-25", "2026-09-26", "2026-09-27"]
    );
  });

  it("stops reminding entirely once a one-off is done", () => {
    // The completed date isn't in the window at all, so a naive
    // "skip completed days" rule would keep reminding forever.
    const planned = plannedReminders(
      { ...reminding, scheduleType: "once" },
      new Set(["2026-09-20"]),
      FRIDAY_MORNING,
      5
    );
    assert.deepEqual(planned, []);
  });
});

describe("buildDayStatus priority from waiting time", () => {
  const interval = (id: number, energyCost: number, intervalDays: number) =>
    makeTask({ id, energyCost, scheduleType: "interval", intervalDays });

  it("gives the longest-waiting task the budget ahead of cheaper work", () => {
    // The shower costs 5 and has waited 4 days; two 2-cost dailies would otherwise
    // soak up the 6-point budget first and leave it marked as not fitting.
    const tasks = [
      makeTask({ id: 1, energyCost: 2 }),
      makeTask({ id: 2, energyCost: 2 }),
      interval(3, 5, 2),
    ];
    const status = buildDayStatus({
      tasks,
      date: FRIDAY,
      budget: 6,
      completedTaskIds: new Set(),
      completedDatesByTask: new Map([[3, new Set(["2026-09-19"])]]),
    });

    const shower = status.tasks.find((t) => t.id === 3);
    assert.equal(shower?.daysWaiting, 4);
    assert.equal(shower?.fitsRemainingBudget, true, "waiting work should win the slot");
    // 6 - 5 leaves 1, enough for neither 2-cost daily.
    assert.deepEqual(
      status.tasks.filter((t) => t.fitsRemainingBudget).map((t) => t.id),
      [3]
    );
  });

  it("orders by waiting time, then by cost", () => {
    const tasks = [interval(1, 9, 2), interval(2, 1, 2), makeTask({ id: 3, energyCost: 4 })];
    const status = buildDayStatus({
      tasks,
      date: FRIDAY,
      budget: 20,
      completedTaskIds: new Set(),
      completedDatesByTask: new Map([
        [1, new Set(["2026-09-22"])], // waiting 1
        [2, new Set(["2026-09-20"])], // waiting 3
      ]),
    });
    // id 2 waited longest, then id 1, then the daily with no waiting time.
    assert.deepEqual(
      status.tasks.map((t) => t.id),
      [2, 1, 3]
    );
  });

  it("falls back to cheapest-first when nothing is waiting", () => {
    const tasks = [
      makeTask({ id: 1, energyCost: 5 }),
      makeTask({ id: 2, energyCost: 1 }),
      makeTask({ id: 3, energyCost: 3 }),
    ];
    const status = buildDayStatus({
      tasks,
      date: FRIDAY,
      budget: 20,
      completedTaskIds: new Set(),
      completedDatesByTask: new Map(),
    });
    assert.deepEqual(
      status.tasks.map((t) => t.id),
      [2, 3, 1]
    );
  });

  it("files a not-yet-due interval task under upcoming", () => {
    const tasks = [interval(1, 2, 3)];
    const status = buildDayStatus({
      tasks,
      date: FRIDAY,
      budget: 10,
      completedTaskIds: new Set(),
      completedDatesByTask: new Map([[1, new Set(["2026-09-24"])]]),
    });
    assert.equal(status.tasks[0].scheduledToday, false);
    assert.equal(status.tasks[0].fitsRemainingBudget, false);
  });

  it("reports no streak for an interval task", () => {
    const tasks = [interval(1, 2, 2)];
    const status = buildDayStatus({
      tasks,
      date: FRIDAY,
      budget: 10,
      completedTaskIds: new Set([1]),
      completedDatesByTask: new Map([[1, new Set([FRIDAY, "2026-09-23"])]]),
    });
    assert.equal(status.tasks[0].streak, 0);
  });
});

describe("buildDayStatus with one-off tasks", () => {
  const noDates = new Map<number, Set<string>>();

  it("shows an uncompleted one-off regardless of weekday", () => {
    const tasks = [makeTask({ id: 1, scheduleType: "once", daysOfWeek: MON_WED_FRI })];
    const status = buildDayStatus({
      tasks,
      date: SATURDAY,
      budget: 10,
      completedTaskIds: new Set(),
      completedDatesByTask: noDates,
    });
    assert.equal(status.tasks.length, 1);
    assert.equal(status.tasks[0].scheduledToday, true);
  });

  it("still shows a one-off on the day it was completed", () => {
    const tasks = [makeTask({ id: 1, energyCost: 4, scheduleType: "once" })];
    const status = buildDayStatus({
      tasks,
      date: FRIDAY,
      budget: 10,
      completedTaskIds: new Set([1]),
      completedDatesByTask: new Map([[1, new Set([FRIDAY])]]),
    });
    assert.equal(status.tasks.length, 1);
    assert.equal(status.tasks[0].completedToday, true);
    assert.equal(status.spent, 4);
  });

  it("removes a one-off completed on an earlier day", () => {
    const tasks = [makeTask({ id: 1, scheduleType: "once" })];
    const status = buildDayStatus({
      tasks,
      date: SATURDAY,
      budget: 10,
      completedTaskIds: new Set(),
      completedDatesByTask: new Map([[1, new Set([FRIDAY])]]),
    });
    assert.deepEqual(status.tasks, []);
  });

  it("reports no streak for a one-off", () => {
    const tasks = [makeTask({ id: 1, scheduleType: "once" })];
    const status = buildDayStatus({
      tasks,
      date: FRIDAY,
      budget: 10,
      completedTaskIds: new Set([1]),
      completedDatesByTask: new Map([[1, new Set([FRIDAY, "2026-09-24"])]]),
    });
    assert.equal(status.tasks[0].streak, 0);
  });

  it("leaves repeating tasks untouched by retirement", () => {
    const tasks = [makeTask({ id: 1, scheduleType: "daily" })];
    const status = buildDayStatus({
      tasks,
      date: SATURDAY,
      budget: 10,
      completedTaskIds: new Set(),
      completedDatesByTask: new Map([[1, new Set([FRIDAY])]]),
    });
    assert.equal(status.tasks.length, 1);
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
