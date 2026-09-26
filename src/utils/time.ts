/** Parses "HH:MM" into its parts, or null if it isn't a valid 24-hour time. */
export function parseTimeString(time: string): { hour: number; minute: number } | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!match) return null;
  const hour = parseInt(match[1], 10);
  const minute = parseInt(match[2], 10);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return { hour, minute };
}

export function timeStringToDate(time: string): Date {
  const [hour, minute] = time.split(":").map((n) => parseInt(n, 10));
  const date = new Date();
  date.setHours(hour, minute, 0, 0);
  return date;
}

export function dateToTimeString(date: Date): string {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

export function formatTimeLabel(time: string): string {
  const date = timeStringToDate(time);
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}
