/**
 * Backup file I/O: writing a snapshot out through the share sheet, and reading one
 * back in. The format and all validation live in utils/backupFormat.ts.
 *
 * Uses the expo-file-system v19 File/Paths API (SDK 54), not the legacy
 * readAsStringAsync/writeAsStringAsync functions.
 */

import * as DocumentPicker from "expo-document-picker";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";

import { exportSnapshot, restoreSnapshot } from "./db/database";
import {
  backupFileName,
  BackupFile,
  buildBackup,
  describeBackup,
  parseBackup,
  serializeBackup,
} from "./utils/backupFormat";

export type ExportResult = { ok: true; fileName: string } | { ok: false; error: string };
export type ReadResult = { ok: true; backup: BackupFile; summary: string } | { ok: false; error: string };

/**
 * Writes a backup to the cache directory and hands it to the OS share sheet, so
 * the user can put it somewhere that survives reinstalling the app. Cache is the
 * right home for the temp copy: once it's been shared out, the local copy is
 * disposable and the system may reclaim it.
 */
export async function exportBackup(): Promise<ExportResult> {
  try {
    const snapshot = exportSnapshot();
    const exportedAt = new Date().toISOString();
    const fileName = backupFileName(exportedAt);

    const file = new File(Paths.cache, fileName);
    file.create({ overwrite: true });
    file.write(serializeBackup(buildBackup(snapshot, exportedAt)));

    if (!(await Sharing.isAvailableAsync())) {
      // Nothing to share with, but the file was still written — tell the user where.
      return { ok: false, error: `Sharing isn't available on this device. Saved to ${file.uri}` };
    }

    await Sharing.shareAsync(file.uri, {
      mimeType: "application/json",
      dialogTitle: "Save your Spoons backup",
      UTI: "public.json",
    });

    return { ok: true, fileName };
  } catch (err) {
    return { ok: false, error: describeError(err) };
  }
}

/**
 * Prompts for a backup file and validates it. Deliberately does NOT apply it —
 * the caller must confirm with the user first, since applying replaces all data.
 */
export async function pickBackup(): Promise<ReadResult | null> {
  try {
    const picked = await DocumentPicker.getDocumentAsync({
      // Some Android file providers report JSON as octet-stream, so accept both
      // rather than hiding the user's own backup from the picker.
      type: ["application/json", "application/octet-stream"],
      copyToCacheDirectory: true,
    });

    if (picked.canceled || !picked.assets?.length) return null;

    const text = await new File(picked.assets[0].uri).text();
    const parsed = parseBackup(text);
    if (!parsed.ok) return { ok: false, error: parsed.error };

    return { ok: true, backup: parsed.backup, summary: describeBackup(parsed.backup) };
  } catch (err) {
    return { ok: false, error: describeError(err) };
  }
}

/** Applies an already-validated backup, replacing all local data. */
export function applyBackup(backup: BackupFile): { ok: true } | { ok: false; error: string } {
  try {
    restoreSnapshot(backup.data);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: describeError(err) };
  }
}

function describeError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
