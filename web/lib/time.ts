// Time helpers. Everything is computed in Europe/Paris explicitly, because
// Vercel's servers run on UTC: `new Date().getHours()` there is 1-2 hours off.
//
// Two representations are used throughout:
// - a calendar date as "YYYY-MM-DD" and a time of day as minutes since
//   midnight (0-1439), which is what the Sheet stores (as "HH:MM");
// - an "absolute minute": days since 1970-01-01 * 1440 + minutes. It turns
//   "date + time" into one number, so comparing and subtracting moments works
//   across midnight (23:30 yesterday < 07:45 today).

export const TIMEZONE = "Europe/Paris";
export const MINUTES_PER_DAY = 1440;

export type ParisNow = { date: string; minutes: number; iso: string };

const partsFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
  timeZoneName: "longOffset",
});

/** The current Paris date, time of day, and an ISO timestamp with offset. */
export function parisNow(at: Date = new Date()): ParisNow {
  const parts: Record<string, string> = {};
  for (const part of partsFormatter.formatToParts(at)) parts[part.type] = part.value;
  const date = `${parts.year}-${parts.month}-${parts.day}`;
  const minutes = Number(parts.hour) * 60 + Number(parts.minute);
  // "GMT+01:00" -> "+01:00" ("GMT" alone means +00:00)
  const offset = parts.timeZoneName.replace("GMT", "") || "+00:00";
  const iso = `${date}T${parts.hour}:${parts.minute}:${parts.second}${offset}`;
  return { date, minutes, iso };
}

/** "YYYY-MM-DD" -> days since 1970-01-01. Calendar arithmetic only, no time zone. */
export function dayNumber(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86_400_000);
}

export function dateFromDayNumber(day: number): string {
  return new Date(day * 86_400_000).toISOString().slice(0, 10);
}

export function addDays(date: string, days: number): string {
  return dateFromDayNumber(dayNumber(date) + days);
}

/** True if the numbers form a real calendar date (rejects 31/02). */
export function isRealDate(year: number, month: number, day: number): boolean {
  const d = new Date(Date.UTC(year, month - 1, day));
  return d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day;
}

export function toDateString(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Minutes since midnight -> zero-padded "HH:MM". */
export function formatHHMM(minutes: number): string {
  const m = ((minutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/**
 * Reads a time stored in the Sheet. Accepts what the app writes ("09:30") and
 * what a hand edit can leave behind ("9:30", "09:30:00"). Returns null if it
 * isn't a time.
 */
export function parseStoredTime(value: string): number | null {
  const match = /^\s*(\d{1,2})[:hH](\d{2})(?::\d{2})?\s*$/.exec(value);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

export function absoluteMinute(date: string, minutes: number): number {
  return dayNumber(date) * MINUTES_PER_DAY + minutes;
}
