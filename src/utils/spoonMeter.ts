/**
 * Model for the spoon marks in the header.
 *
 * Pure, because the interesting cases aren't visual: being over budget, and being
 * *above* budget after a restorative task, both break the naive "filled out of
 * total" framing.
 */

/** Past this many, individual marks stop being countable and a bar reads better. */
export const MAX_SPOON_MARKS = 16;

export interface SpoonMeterModel {
  mode: "marks" | "bar";
  /** Marks still available. Always the true count, even above the day's budget. */
  filled: number;
  /** Marks used up. */
  empty: number;
  /** Spoons past zero, when more was spent than the budget allowed. */
  over: number;
  /** How many of the available spoons came from topping up above the budget. */
  bonus: number;
  /** 0–1 proportion remaining, for the bar fallback. */
  fillRatio: number;
}

export function spoonMeterModel(
  budget: number,
  spent: number,
  maxMarks: number = MAX_SPOON_MARKS
): SpoonMeterModel {
  const total = Math.max(0, Math.round(budget));
  const remaining = Math.round(budget - spent);

  /**
   * Deliberately NOT capped at the budget. A restorative activity can leave more
   * spoons available than the day started with, and the marks have to show that —
   * the whole reason for drawing them is that they can be counted without doing
   * arithmetic, so a row that stops at the budget forces you back to reading the
   * number. Extra marks simply mean extra spoons.
   */
  const filled = Math.max(remaining, 0);
  /**
   * Derived from `filled` rather than from `spent` directly, so the two always
   * agree: rounding each independently let a fractional spend produce 8 filled and
   * 2.4 empty. Clamping at zero also means a top-up above the budget adds marks
   * without subtracting empties below nothing, and overspending stops adding
   * empties past the original allocation — that surplus is reported as `over`.
   */
  const empty = Math.min(Math.max(total - filled, 0), total);

  return {
    mode: filled + empty > maxMarks ? "bar" : "marks",
    filled,
    empty,
    over: Math.max(-remaining, 0),
    bonus: Math.max(remaining - total, 0),
    fillRatio: total === 0 ? 0 : Math.min(Math.max(remaining / total, 0), 1),
  };
}

/** Short summary beside the marks. Says what's left, or what it cost to go past. */
export function describeSpoons(model: SpoonMeterModel, total: number): string {
  if (model.over > 0) return `${model.over} past your ${total}`;
  if (model.bonus > 0) return `${model.filled} left — ${model.bonus} topped up`;
  return `${model.filled} of ${total} left`;
}
