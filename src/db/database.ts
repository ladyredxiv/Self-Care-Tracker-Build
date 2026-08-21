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
    `INSERT INTO completions (taskId, date, completedAt) VALUES (?, ?, ?)`,
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

export function getStreak(taskId: number, today: string): number {
  const rows = db.getAllSync<any>(
    `SELECT date FROM completions WHERE taskId = ? ORDER BY date DESC`,
    [taskId]
  );
  const dates = new Set(rows.map((r) => r.date));
  let streak = 0;
  let cursor = new Date(today);
  // if today isn't completed yet, start checking from yesterday
  if (!dates.has(today)) {
    cursor.setDate(cursor.getDate() - 1);
  }
  while (dates.has(cursor.toISOString().slice(0, 10))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
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
