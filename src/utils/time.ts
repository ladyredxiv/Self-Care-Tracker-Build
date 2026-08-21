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
