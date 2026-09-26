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
  /** Marks still available. */
  filled: number;
  /** Marks used up. */
  empty: number;
  /** Spoons past zero, when more was spent than the budget allowed. */
  over: number;
  /** Spoons above the day's budget, from restorative activities. */
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

  // Capped at the budget: a restorative activity that puts you above it is shown
  // as a bonus rather than by inventing extra marks, which would make the row's
  // length meaningless.
  const filled = Math.min(Math.max(remaining, 0), total);

  return {
    mode: total > maxMarks ? "bar" : "marks",
    filled,
    empty: Math.max(total - filled, 0),
    over: Math.max(-remaining, 0),
    bonus: Math.max(remaining - total, 0),
    fillRatio: total === 0 ? 0 : Math.min(Math.max(remaining / total, 0), 1),
  };
}

/** Short summary beside the marks. Says what's left, or what it cost to go past. */
export function describeSpoons(model: SpoonMeterModel, total: number): string {
  if (model.over > 0) return `${model.over} past your ${total}`;
  if (model.bonus > 0) return `${model.filled + model.bonus} left of ${total}`;
  return `${model.filled} of ${total} left`;
}
