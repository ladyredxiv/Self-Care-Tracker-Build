import * as SQLite from "expo-sqlite";
import {
  DatabaseSnapshot,
  DayLog,
  DayOfWeek,
  DayRating,
  ScheduleType,
  Task,
  TimeOfDay,
} from "../types";

const db = SQLite.openDatabaseSync("selfcare.db");

export const DEFAULT_BUDGET_KEY = "defaultBudget";
export const PROGRESS_STYLE_KEY = "progressStyle";

export function initDatabase() {
  db.execSync(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      energyCost INTEGER NOT NULL,
      category TEXT NOT NULL DEFAULT 'general',
      timeOfDay TEXT NOT NULL DEFAULT 'anytime',
      daysOfWeek TEXT NOT NULL DEFAULT '[]',
      isRecurring INTEGER NOT NULL DEFAULT 1,
      reminderEnabled INTEGER NOT NULL DEFAULT 0,
      reminderTime TEXT,
      createdAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS completions (
      id INTEGER PRIMARY KEY NOT NULL,
      taskId INTEGER NOT NULL,
      date TEXT NOT NULL,
      completedAt TEXT NOT NULL,
      FOREIGN KEY (taskId) REFERENCES tasks (id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS daily_budgets (
      date TEXT PRIMARY KEY NOT NULL,
      budget INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS day_logs (
      date TEXT PRIMARY KEY NOT NULL,
      checkedIn INTEGER NOT NULL DEFAULT 0,
      rating INTEGER,
      note TEXT,
      updatedAt TEXT NOT NULL
    );
  `);

  ensureColumn("tasks", "reminderEnabled", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn("tasks", "reminderTime", "TEXT");
  ensureColumn("tasks", "intervalDays", "INTEGER");
  ensureColumn("tasks", "isEssential", "INTEGER NOT NULL DEFAULT 0");
  migrateToScheduleTypes();
  enforceOneCompletionPerTaskPerDay();

  db.execSync(`CREATE INDEX IF NOT EXISTS idx_completions_date ON completions (date)`);
}

/**
 * Guarantees a task can only be completed once per day.
 *
 * Without this, a double-tap inserted two rows and getEnergySpentByDate's SUM
 * double-counted the energy forever. A UNIQUE table constraint can't be added to
 * an existing table, so we drop any duplicates already on disk (keeping the
 * earliest) and enforce it with a unique index instead.
 */
function enforceOneCompletionPerTaskPerDay() {
  db.execSync(`
    DELETE FROM completions
    WHERE id NOT IN (SELECT MIN(id) FROM completions GROUP BY taskId, date);

    CREATE UNIQUE INDEX IF NOT EXISTS idx_completions_task_date
      ON completions (taskId, date);
  `);
}

/**
 * Adds a column to an existing table only if it isn't already there — portable
 * across SQLite builds that don't support "ADD COLUMN IF NOT EXISTS".
 * Returns whether it actually added the column, so callers can run a one-time
 * backfill without needing a separate migration-version record.
 */
function ensureColumn(table: string, column: string, definition: string): boolean {
  const columns = db.getAllSync<any>(`PRAGMA table_info(${table})`);
  if (columns.some((c) => c.name === column)) return false;
  db.execSync(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  return true;
}

/**
 * Introduces the explicit scheduleType, derived from what the old boolean plus
 * weekday list implied:
 *   isRecurring = 0        -> 'once'
 *   no weekdays selected   -> 'daily'
 *   some weekdays selected -> 'weekdays'
 *
 * The backfill runs only on the migration step that adds the column, which is what
 * makes it idempotent — afterwards a task legitimately set to 'daily' is
 * indistinguishable from one that was never migrated.
 *
 * The now-redundant isRecurring column is left in place and kept in sync on write.
 * Dropping it would mean a table rebuild, and the risk of that failing at launch on
 * an app used daily isn't worth the tidiness.
 */
function migrateToScheduleTypes() {
  const added = ensureColumn("tasks", "scheduleType", "TEXT NOT NULL DEFAULT 'daily'");
  if (!added) return;

  db.execSync(`
    UPDATE tasks SET scheduleType = CASE
      WHEN isRecurring = 0 THEN 'once'
      WHEN daysOfWeek IS NULL OR daysOfWeek = '[]' THEN 'daily'
      ELSE 'weekdays'
    END
  `);
}

// ---- Tasks ----

/** Everything the form supplies; id and createdAt are assigned here. */
export interface TaskInput {
  name: string;
  energyCost: number;
  category: string;
  timeOfDay: TimeOfDay;
  scheduleType: ScheduleType;
  daysOfWeek: DayOfWeek[];
  intervalDays: number | null;
  isEssential: boolean;
  reminderEnabled: boolean;
  reminderTime: string | null;
}

export function createTask(task: TaskInput): number {
  const result = db.runSync(
    `INSERT INTO tasks (name, energyCost, category, timeOfDay, scheduleType, daysOfWeek, intervalDays, isEssential, isRecurring, reminderEnabled, reminderTime, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      task.name,
      task.energyCost,
      task.category,
      task.timeOfDay,
      task.scheduleType,
      JSON.stringify(task.daysOfWeek),
      task.intervalDays,
      task.isEssential ? 1 : 0,
      // Legacy column, kept in sync so an older build reading this row still
      // behaves sensibly.
      task.scheduleType === "once" ? 0 : 1,
      task.reminderEnabled ? 1 : 0,
      task.reminderTime,
      new Date().toISOString(),
    ]
  );
  return result.lastInsertRowId;
}

export function getAllTasks(): Task[] {
  const rows = db.getAllSync<any>(`SELECT * FROM tasks ORDER BY energyCost ASC`);
  return rows.map(rowToTask);
}

export function getTaskById(id: number): Task | null {
  const row = db.getFirstSync<any>(`SELECT * FROM tasks WHERE id = ?`, [id]);
  return row ? rowToTask(row) : null;
}

export function deleteTask(id: number) {
  db.runSync(`DELETE FROM tasks WHERE id = ?`, [id]);
  db.runSync(`DELETE FROM completions WHERE taskId = ?`, [id]);
}

export function updateTask(id: number, task: TaskInput) {
  db.runSync(
    `UPDATE tasks SET name = ?, energyCost = ?, category = ?, timeOfDay = ?, scheduleType = ?, daysOfWeek = ?, intervalDays = ?, isEssential = ?, isRecurring = ?, reminderEnabled = ?, reminderTime = ? WHERE id = ?`,
    [
      task.name,
      task.energyCost,
      task.category,
      task.timeOfDay,
      task.scheduleType,
      JSON.stringify(task.daysOfWeek),
      task.intervalDays,
      task.isEssential ? 1 : 0,
      task.scheduleType === "once" ? 0 : 1,
      task.reminderEnabled ? 1 : 0,
      task.reminderTime,
      id,
    ]
  );
}

const SCHEDULE_TYPES: ScheduleType[] = ["daily", "weekdays", "interval", "once"];

function rowToTask(row: any): Task {
  return {
    id: row.id,
    name: row.name,
    energyCost: row.energyCost,
    category: row.category,
    timeOfDay: row.timeOfDay,
    // Falls back rather than trusting the column blindly: a row written by a build
    // that predates scheduleType would otherwise yield undefined and break every
    // switch over it.
    scheduleType: SCHEDULE_TYPES.includes(row.scheduleType)
      ? row.scheduleType
      : row.isRecurring === 0
        ? "once"
        : "daily",
    daysOfWeek: JSON.parse(row.daysOfWeek),
    intervalDays: typeof row.intervalDays === "number" ? row.intervalDays : null,
    isEssential: !!row.isEssential,
    reminderEnabled: !!row.reminderEnabled,
    reminderTime: row.reminderTime ?? null,
    createdAt: row.createdAt,
  };
}

// ---- Completions ----

export function completeTask(taskId: number, date: string) {
  db.runSync(
    `INSERT OR IGNORE INTO completions (taskId, date, completedAt) VALUES (?, ?, ?)`,
    [taskId, date, new Date().toISOString()]
  );
}

export function uncompleteTask(taskId: number, date: string) {
  db.runSync(`DELETE FROM completions WHERE taskId = ? AND date = ?`, [taskId, date]);
}

export function getCompletionsForDate(date: string): number[] {
  const rows = db.getAllSync<any>(`SELECT taskId FROM completions WHERE date = ?`, [date]);
  return rows.map((r) => r.taskId);
}

/**
 * Every completion date, grouped by task, for streak calculation. Loading the
 * whole table at once keeps this a single query instead of one per task; a
 * personal tracker's completion history stays small.
 */
export function getCompletedDatesByTask(): Map<number, Set<string>> {
  const rows = db.getAllSync<any>(`SELECT taskId, date FROM completions`);
  const byTask = new Map<number, Set<string>>();
  for (const row of rows) {
    let dates = byTask.get(row.taskId);
    if (!dates) {
      dates = new Set<string>();
      byTask.set(row.taskId, dates);
    }
    dates.add(row.date);
  }
  return byTask;
}

// ---- Daily budget ----

export function getBudgetForDate(date: string): number | null {
  const row = db.getFirstSync<any>(`SELECT budget FROM daily_budgets WHERE date = ?`, [date]);
  return row ? row.budget : null;
}

export function setBudgetForDate(date: string, budget: number) {
  db.runSync(
    `INSERT INTO daily_budgets (date, budget) VALUES (?, ?)
     ON CONFLICT(date) DO UPDATE SET budget = excluded.budget`,
    [date, budget]
  );
}

/**
 * Freezes a day's effective budget the first time that day is opened, returning
 * whatever budget applies. Without this, past days with no saved budget were
 * rendered using the *current* default, so raising today's budget retroactively
 * rewrote every untouched day in the trend chart.
 */
export function materializeBudgetForDate(date: string, fallback: number): number {
  const existing = getBudgetForDate(date);
  if (existing !== null) return existing;
  setBudgetForDate(date, fallback);
  return fallback;
}

/** Total energy spent (sum of completed tasks' energy cost) per date, for dates within the given range. */
export function getEnergySpentByDate(startDate: string, endDate: string): Record<string, number> {
  const rows = db.getAllSync<any>(
    `SELECT completions.date as date, SUM(tasks.energyCost) as spent
     FROM completions
     JOIN tasks ON tasks.id = completions.taskId
     WHERE completions.date BETWEEN ? AND ?
     GROUP BY completions.date`,
    [startDate, endDate]
  );
  const result: Record<string, number> = {};
  for (const row of rows) {
    result[row.date] = row.spent;
  }
  return result;
}

// ---- Day logs (capacity check-in and end-of-day reflection) ----

export function getDayLog(date: string): DayLog | null {
  const row = db.getFirstSync<any>(`SELECT * FROM day_logs WHERE date = ?`, [date]);
  return row ? rowToDayLog(row) : null;
}

export function getDayLogsBetween(startDate: string, endDate: string): DayLog[] {
  const rows = db.getAllSync<any>(
    `SELECT * FROM day_logs WHERE date BETWEEN ? AND ? ORDER BY date`,
    [startDate, endDate]
  );
  return rows.map(rowToDayLog);
}

/** Records that capacity for the day was actively confirmed rather than inherited. */
export function markCheckedIn(date: string) {
  db.runSync(
    `INSERT INTO day_logs (date, checkedIn, updatedAt) VALUES (?, 1, ?)
     ON CONFLICT(date) DO UPDATE SET checkedIn = 1, updatedAt = excluded.updatedAt`,
    [date, new Date().toISOString()]
  );
}

export function setDayReflection(date: string, rating: DayRating | null, note: string | null) {
  db.runSync(
    `INSERT INTO day_logs (date, rating, note, updatedAt) VALUES (?, ?, ?, ?)
     ON CONFLICT(date) DO UPDATE SET
       rating = excluded.rating,
       note = excluded.note,
       updatedAt = excluded.updatedAt`,
    [date, rating, note, new Date().toISOString()]
  );
}

function rowToDayLog(row: any): DayLog {
  const rating = typeof row.rating === "number" && row.rating >= 1 && row.rating <= 5
    ? (row.rating as DayRating)
    : null;
  return {
    date: row.date,
    checkedIn: !!row.checkedIn,
    rating,
    note: row.note ?? null,
  };
}

/** Completions per task over a date range, for the summary report. */
export function getCompletionCountsByTask(
  startDate: string,
  endDate: string
): { taskId: number; completions: number }[] {
  return db.getAllSync<any>(
    `SELECT taskId, COUNT(*) as completions
     FROM completions WHERE date BETWEEN ? AND ? GROUP BY taskId`,
    [startDate, endDate]
  );
}

/** Energy spent per task category over a date range, for the load breakdown. */
export function getEnergySpentByCategory(
  startDate: string,
  endDate: string
): { category: string; spent: number }[] {
  return db.getAllSync<any>(
    `SELECT tasks.category as category, SUM(tasks.energyCost) as spent
     FROM completions
     JOIN tasks ON tasks.id = completions.taskId
     WHERE completions.date BETWEEN ? AND ?
     GROUP BY tasks.category`,
    [startDate, endDate]
  );
}

// ---- Settings (e.g. default budget) ----

export function getSetting(key: string): string | null {
  const row = db.getFirstSync<any>(`SELECT value FROM settings WHERE key = ?`, [key]);
  return row ? row.value : null;
}

export function setSetting(key: string, value: string) {
  db.runSync(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [key, value]
  );
}

// ---- Backup / restore ----

export function exportSnapshot(): DatabaseSnapshot {
  return {
    tasks: db.getAllSync<any>(`SELECT * FROM tasks ORDER BY id`),
    completions: db.getAllSync<any>(`SELECT * FROM completions ORDER BY id`),
    dailyBudgets: db.getAllSync<any>(`SELECT * FROM daily_budgets ORDER BY date`),
    settings: db.getAllSync<any>(`SELECT * FROM settings ORDER BY key`),
    dayLogs: db.getAllSync<any>(`SELECT * FROM day_logs ORDER BY date`),
  };
}

/**
 * Replaces all local data with a snapshot, in a single transaction so a malformed
 * backup can't leave the database half-wiped.
 *
 * Completions are inserted with OR IGNORE: a backup taken before the uniqueness
 * index existed may itself contain duplicate (taskId, date) rows, and those must
 * not abort the whole restore.
 */
export function restoreSnapshot(snapshot: DatabaseSnapshot) {
  db.withTransactionSync(() => {
    db.runSync(`DELETE FROM completions`);
    db.runSync(`DELETE FROM tasks`);
    db.runSync(`DELETE FROM daily_budgets`);
    db.runSync(`DELETE FROM settings`);
    db.runSync(`DELETE FROM day_logs`);

    for (const t of snapshot.tasks) {
      const daysOfWeek =
        typeof t.daysOfWeek === "string" ? t.daysOfWeek : JSON.stringify(t.daysOfWeek ?? []);

      // Backups predating scheduleType only carry the isRecurring/daysOfWeek pair,
      // so the same derivation the schema migration uses is applied here.
      const scheduleType: ScheduleType = SCHEDULE_TYPES.includes(t.scheduleType)
        ? t.scheduleType
        : t.isRecurring === 0 || t.isRecurring === false
          ? "once"
          : daysOfWeek === "[]"
            ? "daily"
            : "weekdays";

      db.runSync(
        `INSERT INTO tasks (id, name, energyCost, category, timeOfDay, scheduleType, daysOfWeek, intervalDays, isEssential, isRecurring, reminderEnabled, reminderTime, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          t.id,
          t.name,
          t.energyCost,
          t.category ?? "general",
          t.timeOfDay ?? "anytime",
          scheduleType,
          daysOfWeek,
          typeof t.intervalDays === "number" ? t.intervalDays : null,
          t.isEssential ? 1 : 0,
          scheduleType === "once" ? 0 : 1,
          t.reminderEnabled ? 1 : 0,
          t.reminderTime ?? null,
          t.createdAt ?? new Date().toISOString(),
        ]
      );
    }

    for (const c of snapshot.completions) {
      db.runSync(
        `INSERT OR IGNORE INTO completions (taskId, date, completedAt) VALUES (?, ?, ?)`,
        [c.taskId, c.date, c.completedAt ?? new Date().toISOString()]
      );
    }

    for (const b of snapshot.dailyBudgets) {
      db.runSync(`INSERT OR REPLACE INTO daily_budgets (date, budget) VALUES (?, ?)`, [
        b.date,
        b.budget,
      ]);
    }

    for (const s of snapshot.settings) {
      db.runSync(`INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)`, [s.key, s.value]);
    }

    // Absent from backups written before day logs existed, hence the guard.
    for (const log of snapshot.dayLogs ?? []) {
      db.runSync(
        `INSERT OR REPLACE INTO day_logs (date, checkedIn, rating, note, updatedAt) VALUES (?, ?, ?, ?, ?)`,
        [
          log.date,
          log.checkedIn ? 1 : 0,
          typeof log.rating === "number" ? log.rating : null,
          log.note ?? null,
          log.updatedAt ?? new Date().toISOString(),
        ]
      );
    }
  });
}
