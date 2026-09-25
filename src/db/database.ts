import * as SQLite from "expo-sqlite";
import { DailyBudget, DayOfWeek, Task, TimeOfDay } from "../types";

const db = SQLite.openDatabaseSync("selfcare.db");

export const DEFAULT_BUDGET_KEY = "defaultBudget";

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
  `);

  ensureColumn("tasks", "reminderEnabled", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn("tasks", "reminderTime", "TEXT");
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

/** Adds a column to an existing table only if it isn't already there — portable across SQLite builds that don't support "ADD COLUMN IF NOT EXISTS". */
function ensureColumn(table: string, column: string, definition: string) {
  const columns = db.getAllSync<any>(`PRAGMA table_info(${table})`);
  const exists = columns.some((c) => c.name === column);
  if (!exists) {
    db.execSync(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

// ---- Tasks ----

export function createTask(task: {
  name: string;
  energyCost: number;
  category: string;
  timeOfDay: TimeOfDay;
  daysOfWeek: DayOfWeek[];
  isRecurring: boolean;
  reminderEnabled: boolean;
  reminderTime: string | null;
}): number {
  const result = db.runSync(
    `INSERT INTO tasks (name, energyCost, category, timeOfDay, daysOfWeek, isRecurring, reminderEnabled, reminderTime, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      task.name,
      task.energyCost,
      task.category,
      task.timeOfDay,
      JSON.stringify(task.daysOfWeek),
      task.isRecurring ? 1 : 0,
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

export function updateTask(
  id: number,
  task: {
    name: string;
    energyCost: number;
    category: string;
    timeOfDay: TimeOfDay;
    daysOfWeek: DayOfWeek[];
    isRecurring: boolean;
    reminderEnabled: boolean;
    reminderTime: string | null;
  }
) {
  db.runSync(
    `UPDATE tasks SET name = ?, energyCost = ?, category = ?, timeOfDay = ?, daysOfWeek = ?, isRecurring = ?, reminderEnabled = ?, reminderTime = ? WHERE id = ?`,
    [
      task.name,
      task.energyCost,
      task.category,
      task.timeOfDay,
      JSON.stringify(task.daysOfWeek),
      task.isRecurring ? 1 : 0,
      task.reminderEnabled ? 1 : 0,
      task.reminderTime,
      id,
    ]
  );
}

function rowToTask(row: any): Task {
  return {
    id: row.id,
    name: row.name,
    energyCost: row.energyCost,
    category: row.category,
    timeOfDay: row.timeOfDay,
    daysOfWeek: JSON.parse(row.daysOfWeek),
    isRecurring: !!row.isRecurring,
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
