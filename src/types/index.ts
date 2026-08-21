export type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0 = Sunday

export type TimeOfDay = "morning" | "afternoon" | "evening" | "anytime";

export interface Task {
  id: number;
  name: string;
  energyCost: number;
  category: string;
  timeOfDay: TimeOfDay;
  daysOfWeek: DayOfWeek[]; // empty array = every day
  isRecurring: boolean;
  reminderEnabled: boolean;
  reminderTime: string | null; // "HH:MM", 24-hour, local time
  createdAt: string;
}

export interface Completion {
  id: number;
  taskId: number;
  date: string; // YYYY-MM-DD
  completedAt: string;
}

export interface DailyBudget {
  date: string; // YYYY-MM-DD
  budget: number;
}

export interface TaskWithStatus extends Task {
  completedToday: boolean;
  fitsRemainingBudget: boolean;
  scheduledToday: boolean;
  streak: number;
}
