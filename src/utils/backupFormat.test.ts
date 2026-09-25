import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { DatabaseSnapshot } from "../types";
import {
  BACKUP_FORMAT_VERSION,
  backupFileName,
  buildBackup,
  describeBackup,
  parseBackup,
  serializeBackup,
} from "./backupFormat";

function snapshot(overrides: Partial<DatabaseSnapshot> = {}): DatabaseSnapshot {
  return {
    tasks: [{ id: 1, name: "10 min walk", energyCost: 2, daysOfWeek: "[]" }],
    completions: [{ id: 1, taskId: 1, date: "2026-09-25", completedAt: "x" }],
    dailyBudgets: [{ date: "2026-09-25", budget: 10 }],
    settings: [{ key: "defaultBudget", value: "10" }],
    ...overrides,
  };
}

const EXPORTED_AT = "2026-09-25T19:24:22.000Z";

describe("round trip", () => {
  it("parses what it serializes", () => {
    const text = serializeBackup(buildBackup(snapshot(), EXPORTED_AT));
    const result = parseBackup(text);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.backup.formatVersion, BACKUP_FORMAT_VERSION);
    assert.equal(result.backup.data.tasks.length, 1);
    assert.equal(result.backup.data.completions.length, 1);
  });
});

describe("backupFileName", () => {
  it("builds a filesystem-safe sortable name", () => {
    const name = backupFileName(EXPORTED_AT);
    assert.equal(name, "spoons-backup-2026-09-25-19-24-22.json");
    assert.ok(!/[:]/.test(name), "must not contain colons");
  });
});

describe("parseBackup rejects bad input", () => {
  it("rejects non-JSON", () => {
    const result = parseBackup("not json at all");
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.error, /valid JSON/);
  });

  it("rejects JSON that isn't an object", () => {
    assert.equal(parseBackup("[1,2,3]").ok, false);
    assert.equal(parseBackup("null").ok, false);
  });

  it("rejects another app's file", () => {
    const result = parseBackup(JSON.stringify({ app: "someotherapp", formatVersion: 1, data: {} }));
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.error, /isn't a Spoons backup/);
  });

  it("rejects a backup from a newer app version", () => {
    const backup = buildBackup(snapshot(), EXPORTED_AT);
    const text = JSON.stringify({ ...backup, formatVersion: BACKUP_FORMAT_VERSION + 1 });
    const result = parseBackup(text);
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.error, /newer version/);
  });

  it("rejects a missing data section", () => {
    const result = parseBackup(JSON.stringify({ app: "spoons", formatVersion: 1 }));
    assert.equal(result.ok, false);
  });

  it("rejects a missing table", () => {
    const backup = buildBackup(snapshot(), EXPORTED_AT);
    const broken = { ...backup, data: { ...backup.data, completions: undefined } };
    const result = parseBackup(JSON.stringify(broken));
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.error, /completions/);
  });

  it("rejects a task with no id", () => {
    const result = parseBackup(
      serializeBackup(buildBackup(snapshot({ tasks: [{ name: "no id" }] }), EXPORTED_AT))
    );
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.error, /no id or name/);
  });

  it("rejects completions orphaned from their task", () => {
    const result = parseBackup(
      serializeBackup(
        buildBackup(
          snapshot({ completions: [{ id: 1, taskId: 999, date: "2026-09-25" }] }),
          EXPORTED_AT
        )
      )
    );
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.error, /doesn't contain/);
  });

  it("accepts an older format version", () => {
    const backup = buildBackup(snapshot(), EXPORTED_AT);
    const result = parseBackup(JSON.stringify({ ...backup, formatVersion: 0 }));
    assert.equal(result.ok, true);
  });

  it("accepts an empty but well-formed backup", () => {
    const empty = snapshot({ tasks: [], completions: [], dailyBudgets: [], settings: [] });
    const result = parseBackup(serializeBackup(buildBackup(empty, EXPORTED_AT)));
    assert.equal(result.ok, true);
  });

  it("tolerates a missing exportedAt", () => {
    const backup = buildBackup(snapshot(), EXPORTED_AT);
    const result = parseBackup(JSON.stringify({ ...backup, exportedAt: undefined }));
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.backup.exportedAt, "");
  });
});

describe("describeBackup", () => {
  it("summarises counts and date", () => {
    assert.equal(
      describeBackup(buildBackup(snapshot(), EXPORTED_AT)),
      "1 task and 1 completion, saved 2026-09-25"
    );
  });

  it("pluralises correctly", () => {
    const many = snapshot({
      tasks: [
        { id: 1, name: "a" },
        { id: 2, name: "b" },
      ],
      completions: [],
    });
    assert.equal(
      describeBackup(buildBackup(many, EXPORTED_AT)),
      "2 tasks and 0 completions, saved 2026-09-25"
    );
  });

  it("handles an unknown export date", () => {
    const backup = { ...buildBackup(snapshot(), EXPORTED_AT), exportedAt: "" };
    assert.match(describeBackup(backup), /an unknown date/);
  });
});
