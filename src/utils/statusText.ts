/**
 * Text for the ongoing status notification.
 *
 * Pure, and kept out of statusNotification.ts because that module imports
 * expo-notifications — which pulls in the Expo runtime and can't be loaded by the
 * test runner. Same rule as db/logic.ts: anything worth testing stays free of
 * native imports.
 */

import { pickStartHere } from "../db/logic";
import { TaskWithStatus } from "../types";

export interface StatusSummary {
  spent: number;
  budget: number;
  remaining: number;
  tasks: TaskWithStatus[];
}

/**
 * Body text for the ongoing notification. Exported for testing — the interesting
 * part is what it says when there's nothing left to suggest.
 */
export function describeStatus(summary: StatusSummary): { title: string; body: string } {
  const { remaining, budget } = summary;
  const title =
    remaining < 0
      ? `${-remaining} over your ${budget}`
      : `${remaining} of ${budget} spoons left`;

  const next = pickStartHere(summary.tasks, 2);
  if (next.length === 0) {
    const anythingDue = summary.tasks.some((t) => t.scheduledToday && !t.completedToday);
    return {
      title,
      body: anythingDue ? "Nothing else fits today — that's allowed." : "All done for today.",
    };
  }

  return { title, body: `Start here: ${next.map((t) => t.name).join(" · ")}` };
}
