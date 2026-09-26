/**
 * Backup file format — pure, so it can be unit-tested without touching SQLite or
 * the filesystem. All I/O lives in src/backup.ts.
 */

import { DatabaseSnapshot } from "../types";

export const BACKUP_APP_ID = "spoons";

/**
 * 2 added tasks.scheduleType and intervalDays; 3 added day_logs; 4 added
 * tasks.isEssential and allows a negative energyCost for restorative activities.
 *
 * Older backups still restore: restoreSnapshot derives scheduleType from the old
 * isRecurring and daysOfWeek pair, and treats missing dayLogs as empty. The version
 * check exists to stop a NEWER file being fed to a build that predates those
 * columns, where the extra data would be silently dropped.
 */
export const BACKUP_FORMAT_VERSION = 4;

export interface BackupFile {
  app: typeof BACKUP_APP_ID;
  formatVersion: number;
  exportedAt: string;
  data: DatabaseSnapshot;
}

export type ParseResult =
  | { ok: true; backup: BackupFile }
  | { ok: false; error: string };

export function buildBackup(snapshot: DatabaseSnapshot, exportedAt: string): BackupFile {
  return {
    app: BACKUP_APP_ID,
    formatVersion: BACKUP_FORMAT_VERSION,
    exportedAt,
    data: snapshot,
  };
}

export function serializeBackup(backup: BackupFile): string {
  return JSON.stringify(backup, null, 2);
}

/** Filename with a sortable local timestamp, safe for Android/iOS filesystems. */
export function backupFileName(exportedAt: string): string {
  const stamp = exportedAt.slice(0, 19).replace(/[:T]/g, "-");
  return `spoons-backup-${stamp}.json`;
}

/**
 * Validates untrusted text before it is allowed anywhere near restoreSnapshot,
 * which wipes existing data. Every failure path must produce a message worth
 * showing the user, because restoring a bad file is unrecoverable.
 */
export function parseBackup(text: string): ParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: "That file isn't valid JSON." };
  }

  if (typeof raw !== "object" || raw === null) {
    return { ok: false, error: "That file doesn't contain a backup object." };
  }

  const candidate = raw as Partial<BackupFile>;

  if (candidate.app !== BACKUP_APP_ID) {
    return { ok: false, error: "That file isn't a Spoons backup." };
  }

  if (typeof candidate.formatVersion !== "number") {
    return { ok: false, error: "That backup is missing its format version." };
  }

  if (candidate.formatVersion > BACKUP_FORMAT_VERSION) {
    return {
      ok: false,
      error: `That backup was written by a newer version of Spoons (format ${candidate.formatVersion}). Update the app first.`,
    };
  }

  const data = candidate.data;
  if (typeof data !== "object" || data === null) {
    return { ok: false, error: "That backup has no data section." };
  }

  for (const table of ["tasks", "completions", "dailyBudgets", "settings"] as const) {
    if (!Array.isArray((data as DatabaseSnapshot)[table])) {
      return { ok: false, error: `That backup is missing its "${table}" list.` };
    }
  }

  const snapshot = data as DatabaseSnapshot;

  // A task row without an id or name can't be reinserted, and a completion
  // pointing at a missing task would be orphaned.
  if (snapshot.tasks.some((t) => typeof t?.id !== "number" || typeof t?.name !== "string")) {
    return { ok: false, error: "That backup contains a task with no id or name." };
  }

  const taskIds = new Set(snapshot.tasks.map((t) => t.id));
  if (snapshot.completions.some((c) => !taskIds.has(c?.taskId))) {
    return { ok: false, error: "That backup has completions for tasks it doesn't contain." };
  }

  return {
    ok: true,
    backup: {
      app: BACKUP_APP_ID,
      formatVersion: candidate.formatVersion,
      exportedAt: typeof candidate.exportedAt === "string" ? candidate.exportedAt : "",
      data: snapshot,
    },
  };
}

/** Short human summary for the restore confirmation dialog. */
export function describeBackup(backup: BackupFile): string {
  const { tasks, completions } = backup.data;
  const when = backup.exportedAt ? backup.exportedAt.slice(0, 10) : "an unknown date";
  return `${tasks.length} task${tasks.length === 1 ? "" : "s"} and ${completions.length} completion${
    completions.length === 1 ? "" : "s"
  }, saved ${when}`;
}
