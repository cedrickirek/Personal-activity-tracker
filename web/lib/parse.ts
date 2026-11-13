// The accepted entry formats (plan v2, section 6). One line, with the "when"
// part either first or last:
//
//   [date] [time [time]] activity        9h30 QRT prep, yesterday 21h gym
//   activity [date] [time [time]]        QRT prep 9h30, manger yesterday 21h00 22h15
//
// No time anywhere means "starting now".
//
// This module only reads the line. It doesn't know what time it is or what's
// already in the Sheet: deciding which day "23h30" means, and checking for
// future times, is periods.ts's job.

import { addDays, isRealDate, toDateString } from "./time";

export type ParsedEntry = {
  /** "YYYY-MM-DD" if the line has a date, else null. */
  date: string | null;
  /** Start, in minutes since midnight. null = no time typed (start now). */
  start: number | null;
  /** End as typed, in minutes since midnight. May be earlier than start (next day). */
  end: number | null;
  activity: string;
};

export type ParseResult = { ok: true; entry: ParsedEntry } | { ok: false; error: string };

export const FORMAT_HELP = [
  "QRT prep (starts now)",
  "9h30 QRT prep   ·   9:30 QRT prep   ·   9h QRT prep",
  "9h30-10h15 QRT prep   ·   9h30 10h15   ·   9h30 à 10h15   ·   9h30 to 10h15",
  "yesterday 21h gym   ·   hier 21h gym",
  "12/11 21h gym   ·   12-11   ·   12 nov   ·   12th november   ·   november 12",
  "Or put the time and date last: QRT prep 9h30   ·   manger yesterday 21h00 22h15",
];

const MAX_ACTIVITY_LENGTH = 200;

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4,
  may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9,
  september: 9, oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
};
// Longest names first, so "november" isn't matched as "nov" + "ember".
const MONTH = Object.keys(MONTHS).sort((a, b) => b.length - a.length).join("|");
const ORDINAL = "(?:st|nd|rd|th)?";
// A date is followed by a space, or by the end of the line (then it's an error:
// a date needs a time).
const AFTER_DATE = "(?:\\s+|$)";

const RELATIVE_DATE = new RegExp(`^(yesterday|hier)${AFTER_DATE}`, "i");
const NUMERIC_DATE = new RegExp(`^(\\d{1,2})[/-](\\d{1,2})${AFTER_DATE}`);
const DAY_MONTH = new RegExp(`^(\\d{1,2})${ORDINAL}\\s+(${MONTH})\\.?${AFTER_DATE}`, "i");
const MONTH_DAY = new RegExp(`^(${MONTH})\\.?\\s+(\\d{1,2})${ORDINAL}${AFTER_DATE}`, "i");

// 9h, 9h30, 09h30, 9:30, 09:30. The lookahead refuses "9h3", "9h30am" or
// "9:30:00" instead of silently reading part of them; "9h30: QRT" is fine.
const TIME = /^(\d{1,2})(?:h(\d{2})?|:(\d{2}))(?!\w|:\d)/i;
// Between two times: -, –, —, "à", "a" (phones drop the accent), "to", or just spaces.
const RANGE_SEPARATOR = /^(?:\s*(?:-|–|—)\s*|\s+(?:à|a|to)\s+|\s*(?:à)\s*|\s+)/i;
// Between a leading time and the activity: "9h30 - QRT", "9h30: QRT".
const BEFORE_ACTIVITY = /^\s*(?:-|–|—|:)?\s*/;
// Between the activity and a trailing time: "QRT - 9h30", "lunch at 12h",
// "manger de 12h à 13h". These little words belong to the time, not the activity.
const BEFORE_TRAILING_TIME = /\s*(?:[-–—:@]|\b(?:at|from|since|de|depuis)\b|\sà)\s*$/i;
// Something that looks like an attempt at a time or a date, but didn't parse.
const LOOKS_LIKE_TIME_OR_DATE = /^\d{1,2}\s*[h:]|^\d{1,2}[/-]\d/i;
const ENDS_LIKE_A_TIME = /(?:^|\s)\d{1,2}\s*[h:]\d*$/i;

type When = { date: string | null; start: number | null; end: number | null };

/**
 * Reads "[date] [time [time]]" at the start of `text`.
 * `length` is how many characters it covered; for an error, how far it got.
 */
type WhenRead =
  | { kind: "none" }
  | { kind: "ok"; when: When; length: number }
  | { kind: "error"; error: string; length: number };

type DateMatch = { date: string; length: number } | { error: string; length: number } | null;

function matchDate(text: string, today: string): DateMatch {
  const year = Number(today.slice(0, 4));
  const build = (month: number, day: number, length: number): DateMatch =>
    isRealDate(year, month, day)
      ? { date: toDateString(year, month, day), length }
      : { error: "That date doesn't exist.", length };

  let m = RELATIVE_DATE.exec(text);
  if (m) return { date: addDays(today, -1), length: m[0].length };
  m = NUMERIC_DATE.exec(text);
  if (m) return build(Number(m[2]), Number(m[1]), m[0].length);
  m = DAY_MONTH.exec(text);
  if (m) return build(MONTHS[m[2].toLowerCase()], Number(m[1]), m[0].length);
  m = MONTH_DAY.exec(text);
  if (m) return build(MONTHS[m[1].toLowerCase()], Number(m[2]), m[0].length);
  return null;
}

type TimeMatch = { minutes: number; length: number } | { error: string; length: number } | null;

function matchTime(text: string): TimeMatch {
  const m = TIME.exec(text);
  if (!m) return null;
  const hours = Number(m[1]);
  const minutes = Number(m[2] ?? m[3] ?? 0);
  if (hours > 23 || minutes > 59) return { error: `"${m[0]}" isn't a valid time.`, length: m[0].length };
  return { minutes: hours * 60 + minutes, length: m[0].length };
}

function readWhen(text: string, today: string): WhenRead {
  let position = 0;
  let date: string | null = null;

  const dateMatch = matchDate(text, today);
  if (dateMatch && "error" in dateMatch) return { kind: "error", ...dateMatch };
  if (dateMatch) {
    date = dateMatch.date;
    position = dateMatch.length;
  }

  const first = matchTime(text.slice(position));
  if (first && "error" in first) return { kind: "error", error: first.error, length: position + first.length };
  if (!first) {
    if (date) {
      return { kind: "error", error: "A date needs a time, e.g. \"yesterday 21h gym\".", length: position };
    }
    return { kind: "none" };
  }
  position += first.length;

  // A second time makes it a range. Only taken if a real time follows the
  // separator, so "9h30 a meeting" or "9h30 to do list" stay activities.
  let end: number | null = null;
  const separator = RANGE_SEPARATOR.exec(text.slice(position));
  if (separator) {
    const second = matchTime(text.slice(position + separator[0].length));
    if (second && "error" in second) {
      return { kind: "error", error: second.error, length: position + separator[0].length + second.length };
    }
    if (second) {
      end = second.minutes;
      position += separator[0].length + second.length;
    }
  }

  return { kind: "ok", when: { date, start: first.minutes, end }, length: position };
}

/**
 * Looks for the "when" part at the end of the line: the longest ending that
 * reads completely as "[date] [time [time]]". Returns where it starts.
 */
function readTrailingWhen(text: string, today: string): WhenRead & { at?: number } {
  let error: (WhenRead & { at?: number }) | null = null;
  for (let at = 1; at < text.length; at++) {
    if (!/\s/.test(text[at - 1]) || /\s/.test(text[at])) continue; // start of a word
    const ending = text.slice(at);
    const read = readWhen(ending, today);
    if (read.kind === "ok" && read.length === ending.length) return { ...read, at };
    // An error only counts if the bad date or time is the very end of the
    // line ("gym yesterday", "gym 25h"), not a word in the middle.
    if (read.kind === "error" && read.length === ending.length && !error) error = { ...read, at };
  }
  return error ?? { kind: "none" };
}

function fail(error: string): ParseResult {
  return { ok: false, error };
}

function finish(when: When, activity: string): ParseResult {
  if (!activity) return fail("Add the activity, e.g. \"9h30 QRT prep\".");
  if (activity.length > MAX_ACTIVITY_LENGTH) {
    return fail(`Keep the activity under ${MAX_ACTIVITY_LENGTH} characters.`);
  }
  return { ok: true, entry: { ...when, activity } };
}

/**
 * Reads one entry line. `today` ("YYYY-MM-DD", Paris) is only used to resolve
 * "yesterday" and the year of a date like "12 nov".
 */
export function parseEntry(input: string, today: string): ParseResult {
  const text = input.trim().replace(/\s+/g, " ");
  if (!text) return fail("Type an activity.");

  // 1. The "when" part first: "9h30 QRT prep".
  const leading = readWhen(text, today);
  if (leading.kind === "error") return fail(leading.error);
  if (leading.kind === "ok") {
    return finish(leading.when, text.slice(leading.length).replace(BEFORE_ACTIVITY, "").trim());
  }
  if (LOOKS_LIKE_TIME_OR_DATE.test(text)) return fail("I couldn't read that time.");

  // 2. The "when" part last: "QRT prep 9h30".
  const trailing = readTrailingWhen(text, today);
  if (trailing.kind === "error") return fail(trailing.error);
  if (trailing.kind === "ok") {
    const activity = text.slice(0, trailing.at).replace(BEFORE_TRAILING_TIME, "").trim();
    return finish(trailing.when, activity);
  }
  if (ENDS_LIKE_A_TIME.test(text)) return fail("I couldn't read that time.");

  // 3. No time anywhere: it starts now.
  return finish({ date: null, start: null, end: null }, text);
}
