import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { describeSpoons, MAX_SPOON_MARKS, spoonMeterModel } from "./spoonMeter";

describe("spoonMeterModel", () => {
  it("fills every mark at the start of the day", () => {
    const model = spoonMeterModel(10, 0);
    assert.equal(model.filled, 10);
    assert.equal(model.empty, 0);
    assert.equal(model.mode, "marks");
  });

  it("empties marks as spoons are spent", () => {
    const model = spoonMeterModel(10, 4);
    assert.equal(model.filled, 6);
    assert.equal(model.empty, 4);
  });

  it("reports how far past zero an overspend went", () => {
    const model = spoonMeterModel(10, 13);
    assert.equal(model.filled, 0);
    assert.equal(model.empty, 10);
    assert.equal(model.over, 3);
    assert.equal(describeSpoons(model, 10), "3 past your 10");
  });

  it("treats going above budget as a bonus rather than inventing marks", () => {
    // A restorative activity can leave you above the day's budget. Adding extra
    // marks would make the row's length stop meaning anything.
    const model = spoonMeterModel(10, -2);
    assert.equal(model.filled, 10);
    assert.equal(model.empty, 0);
    assert.equal(model.bonus, 2);
    assert.equal(describeSpoons(model, 10), "12 left of 10");
  });

  it("switches to a bar once marks stop being countable", () => {
    assert.equal(spoonMeterModel(MAX_SPOON_MARKS, 0).mode, "marks");
    assert.equal(spoonMeterModel(MAX_SPOON_MARKS + 1, 0).mode, "bar");
  });

  it("gives a proportional fill for the bar", () => {
    assert.equal(spoonMeterModel(20, 5).fillRatio, 0.75);
  });

  it("clamps the bar fill rather than overflowing it", () => {
    assert.equal(spoonMeterModel(20, 30).fillRatio, 0);
    assert.equal(spoonMeterModel(20, -5).fillRatio, 1);
  });

  it("survives a zero budget without dividing by it", () => {
    const model = spoonMeterModel(0, 0);
    assert.equal(model.filled, 0);
    assert.equal(model.fillRatio, 0);
    assert.ok(Number.isFinite(model.fillRatio));
  });

  it("never renders a negative number of marks", () => {
    for (const [budget, spent] of [
      [10, 99],
      [0, 5],
      [-3, 2],
    ]) {
      const model = spoonMeterModel(budget, spent);
      assert.ok(model.filled >= 0 && model.empty >= 0, `${budget}/${spent} went negative`);
    }
  });

  it("rounds fractional spend to whole marks", () => {
    // Marks are countable things; half a spoon isn't drawable.
    const model = spoonMeterModel(10, 2.4);
    assert.equal(model.filled + model.empty, 10);
  });
});
