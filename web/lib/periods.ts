// The end-time rules (plan v2, section 6). Pure functions: they get the rows
// already in the Sheet, the parsed entry and the current Paris time, and
// return what to write. Nothing here talks to Google, so every rule is tested
// in tests/periods.test.ts without a network.

import type { Activity, ActivityUpdate } from "./activity";
import type { ParsedEntry } from "./parse";
import {
  MINUTES_PER_DAY,
  absoluteMinute,
  addDays,
  dayNumber,
  formatHHMM,
  parseStoredTime,
  type ParisNow,
} from "./time";

/** A row with its start and end turned into absolute minutes (see time.ts). */
type Timed = {
  row: Activity;
  start: number;
  /** null while the activity is running. */
  end: number | null;
};

export type RowUpdate = { id: string; fields: ActivityUpdate };

export type NewRow = Omit<Activity, "id" | "logged_at">;

export type Plan =
  | { ok: true; updates: RowUpdate[]; newRow: NewRow; message: string }
  | { ok: false; error: string };

export type StopPlan = { updates: RowUpdate[]; message: string };

/** Rows that can't be read (bad date or time typed by hand) are ignored. */
function timed(rows: Activity[]): Timed[] {
  const result: Timed[] = [];
  for (const row of rows) {
    const start = parseStoredTime(row.start);
    if (start === null || !/^\d{4}-\d{2}-\d{2}$/.test(row.date)) continue;
    const startAbs = absoluteMinute(row.date, start);
    const end = row.end ? parseStoredTime(row.end) : null;
    // "End earlier than start = the next day."
    const endAbs =
      end === null ? null : absoluteMinute(row.date, end) + (end < start ? MINUTES_PER_DAY : 0);
    result.push({ row, start: startAbs, end: endAbs });
  }
  return result;
}

function isRunning(item: Timed): boolean {
  return item.row.status === "in_progress" && item.end === null;
}

function describeDay(date: string, today: string): string {
  if (date === today) return "";
  if (date === addDays(today, -1)) return " (yesterday)";
  return ` (${date})`;
}

/**
 * Works out the date and absolute start/end of a new entry.
 *
 * With no date typed:
 * - a range whose end is earlier than its start crossed midnight, so it
 *   started yesterday: "23h30 7h45 sleep", logged in the morning;
 * - in the night (before 06:00), a start later than now means last night:
 *   "23h50 reading", typed at 00:20. Later in the day, a start later than now
 *   is a mistake and gets rejected, rather than quietly filed under yesterday;
 * - otherwise, today.
 */
const NIGHT_ENDS_AT = 6 * 60;

function placeEntry(entry: ParsedEntry, now: ParisNow) {
  if (entry.start === null) {
    return { date: now.date, start: absoluteMinute(now.date, now.minutes), end: null };
  }
  let date = entry.date;
  if (date === null) {
    const crossesMidnight = entry.end !== null && entry.end < entry.start;
    const lastNight = entry.start > now.minutes && now.minutes < NIGHT_ENDS_AT;
    date = crossesMidnight || lastNight ? addDays(now.date, -1) : now.date;
  }
  const start = absoluteMinute(date, entry.start);
  const end =
    entry.end === null
      ? null
      : absoluteMinute(date, entry.end) + (entry.end < entry.start ? MINUTES_PER_DAY : 0);
  return { date, start, end };
}

export function planEntry(rows: Activity[], entry: ParsedEntry, rawInput: string, now: ParisNow): Plan {
  const nowAbs = absoluteMinute(now.date, now.minutes);
  const placed = placeEntry(entry, now);

  if (dayNumber(placed.date) > dayNumber(now.date)) {
    return { ok: false, error: "That date is in the future." };
  }
  if (placed.start > nowAbs) {
    return {
      ok: false,
      error: "That start time is in the future. For last night, start with “yesterday”, e.g. “yesterday 23h30 reading”.",
    };
  }
  if (placed.end !== null && placed.end > nowAbs) {
    return { ok: false, error: "That end time is in the future." };
  }

  const existing = timed(rows);
  const updates: RowUpdate[] = [];
  const closed: string[] = [];
  const S = placed.start;

  for (const item of existing) {
    // Rule 5: the running activity ends where the new one starts, if it began
    // less than 24 hours earlier (otherwise it's left for a fix by hand).
    const runningBefore =
      isRunning(item) && item.start <= S && S - item.start < MINUTES_PER_DAY;
    // Rule 5, filled-in-later case (the v1 Step 1 bug): an activity whose
    // *inferred* end is after the new start is cut there. Rule 6: a stated end
    // is never moved.
    const interrupted =
      item.end !== null &&
      item.row.end_type !== "stated" &&
      item.row.status !== "abandoned" &&
      item.start < S &&
      S < item.end;

    if (runningBefore || interrupted) {
      updates.push({
        id: item.row.id,
        fields: { end: formatHHMM(S), status: "done", end_type: "inferred" },
      });
      closed.push(item.row.activity);
    }
  }

  let end = "";
  let endType: NewRow["end_type"] = "";
  let status: NewRow["status"] = "in_progress";

  if (placed.end !== null) {
    // Rule 3: a range is stated by me.
    end = formatHHMM(placed.end);
    endType = "stated";
    status = "done";
  } else {
    // Rule 7: an entry filled in later ends where the next activity starts.
    const nextStart = existing
      .map((item) => item.start)
      .filter((start) => start > S && start - S < MINUTES_PER_DAY)
      .sort((a, b) => a - b)[0];
    if (nextStart !== undefined) {
      end = formatHHMM(nextStart);
      endType = "inferred";
      status = "done";
    }
  }

  const newRow: NewRow = {
    date: placed.date,
    start: formatHHMM(S),
    end,
    planned_end: "",
    activity: entry.activity,
    category: "",
    status,
    comments: "",
    raw_input: rawInput,
    end_type: endType,
  };

  const when = describeDay(placed.date, now.date);
  let message =
    status === "in_progress"
      ? `Started “${entry.activity}” at ${newRow.start}${when}.`
      : `Logged “${entry.activity}” ${newRow.start}–${end}${when}.`;
  if (closed.length) message += ` Ended ${closed.map((a) => `“${a}”`).join(", ")} at ${newRow.start}.`;

  return { ok: true, updates, newRow, message };
}

/** Rule 9: "Stop current" ends the running activity now. */
export function planStop(rows: Activity[], now: ParisNow): StopPlan {
  const nowAbs = absoluteMinute(now.date, now.minutes);
  const running = timed(rows).filter((item) => isRunning(item) && item.start <= nowAbs);
  const recent = running.filter((item) => nowAbs - item.start < MINUTES_PER_DAY);
  const stale = running.filter((item) => nowAbs - item.start >= MINUTES_PER_DAY);

  const updates = recent.map((item) => ({
    id: item.row.id,
    fields: { end: formatHHMM(now.minutes), status: "done", end_type: "stated" } as ActivityUpdate,
  }));

  let message = recent.length
    ? `Stopped ${recent.map((item) => `“${item.row.activity}”`).join(", ")} at ${formatHHMM(now.minutes)}.`
    : "Nothing is running.";
  if (stale.length) {
    message += ` ${stale.map((item) => `“${item.row.activity}” (${item.row.date})`).join(", ")} has been running for over 24 hours: fix it in the Sheet.`;
  }
  return { updates, message };
}

export type TodayItem = {
  id: string;
  activity: string;
  start: string;
  end: string;
  running: boolean;
  startedYesterday: boolean;
};

/**
 * What the page lists: today's rows, plus yesterday's rows that run into
 * today (a night's sleep, or something still running), in time order.
 */
export function todayView(rows: Activity[], now: ParisNow): TodayItem[] {
  const startOfToday = absoluteMinute(now.date, 0);
  const yesterday = addDays(now.date, -1);
  return timed(rows)
    .filter(
      (item) =>
        item.row.date === now.date ||
        (item.row.date === yesterday &&
          (isRunning(item) || (item.end !== null && item.end > startOfToday))),
    )
    .sort((a, b) => a.start - b.start)
    .map((item) => ({
      id: item.row.id,
      activity: item.row.activity,
      start: formatHHMM(item.start),
      end: item.end === null ? "" : formatHHMM(item.end),
      running: isRunning(item),
      startedYesterday: item.row.date === yesterday,
    }));
}
