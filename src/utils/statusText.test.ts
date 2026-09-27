import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { describeStatus } from "./statusText";
import { TaskWithStatus } from "../types";

function task(id: number, name: string, overrides: Partial<TaskWithStatus> = {}): TaskWithStatus {
  return {
    id,
    name,
    energyCost: 2,
    category: "general",
    timeOfDay: "anytime",
    scheduleType: "daily",
    daysOfWeek: [],
    intervalDays: null,
    isEssential: false,
    icon: null,
    reminderEnabled: false,
    reminderTime: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    completedToday: false,
    spoonsSpentToday: null,
    fitsRemainingBudget: true,
    scheduledToday: true,
    streak: 0,
    recentCompletions: 0,
    daysWaiting: 0,
    ...overrides,
  };
}

describe("describeStatus", () => {
  it("reports what's left and what to start with", () => {
    const status = describeStatus({
      spent: 4,
      budget: 10,
      remaining: 6,
      tasks: [task(1, "Meds"), task(2, "Shower")],
    });
    assert.equal(status.title, "6 of 10 spoons left");
    assert.equal(status.body, "Start here: Meds · Shower");
  });

  it("names the overspend rather than showing a negative", () => {
    const status = describeStatus({ spent: 13, budget: 10, remaining: -3, tasks: [] });
    assert.equal(status.title, "3 over your 10");
  });

  it("suggests at most two so the line stays readable", () => {
    const status = describeStatus({
      spent: 0,
      budget: 10,
      remaining: 10,
      tasks: [task(1, "A"), task(2, "B"), task(3, "C")],
    });
    assert.equal(status.body, "Start here: A · B");
  });

  it("says so without blame when nothing further fits", () => {
    // The distinction that matters: work remains, but today's energy is spent.
    const status = describeStatus({
      spent: 10,
      budget: 10,
      remaining: 0,
      tasks: [task(1, "Laundry", { fitsRemainingBudget: false })],
    });
    assert.match(status.body, /that's allowed/);
  });

  it("recognises a finished day", () => {
    const status = describeStatus({
      spent: 6,
      budget: 10,
      remaining: 4,
      tasks: [task(1, "Meds", { completedToday: true })],
    });
    assert.equal(status.body, "All done for today.");
  });

  it("treats an empty task list as a finished day", () => {
    const status = describeStatus({ spent: 0, budget: 8, remaining: 8, tasks: [] });
    assert.equal(status.body, "All done for today.");
  });

  it("ignores tasks that aren't due today", () => {
    const status = describeStatus({
      spent: 0,
      budget: 8,
      remaining: 8,
      tasks: [task(1, "Bins", { scheduledToday: false })],
    });
    assert.equal(status.body, "All done for today.");
  });
});
