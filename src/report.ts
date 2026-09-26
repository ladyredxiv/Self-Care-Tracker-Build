/**
 * Writes and shares the appointment summary. The report text itself is built by
 * the pure builder in utils/summaryReport.ts.
 */

import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";

import { todayDateString } from "./db/logic";
import { loadSummaryInput } from "./db/selectors";
import { buildSummaryReport, summaryFileName } from "./utils/summaryReport";

export type ShareSummaryResult = { ok: true } | { ok: false; error: string };

export async function shareSummary(days: number): Promise<ShareSummaryResult> {
  try {
    const today = todayDateString();
    const report = buildSummaryReport(loadSummaryInput(days, today));

    const file = new File(Paths.cache, summaryFileName(today, days));
    file.create({ overwrite: true });
    file.write(report);

    if (!(await Sharing.isAvailableAsync())) {
      return { ok: false, error: `Sharing isn't available on this device. Saved to ${file.uri}` };
    }

    await Sharing.shareAsync(file.uri, {
      mimeType: "text/plain",
      dialogTitle: `Spoons summary — last ${days} days`,
      UTI: "public.plain-text",
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
