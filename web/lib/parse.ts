// The accepted entry formats (plan v2, section 6). One line:
//
//   [date] [time [time]] activity
//
// This module only reads the line. It doesn't know what time it is or what's
// already in the Sheet: deciding which day "23h30" means, and checking for
// future times, is periods.ts's job.

import { addDays, isRealDate, toDateString } from "./time";

export type ParsedEntry = {
  /** "YYYY-MM-DD" if the line starts with a date, else null. */
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
const BEFORE_ACTIVITY = /^\s*(?:-|–|—|:)?\s*/;
// Something that looks like an attempt at a time or a date, but didn't parse.
const LOOKS_LIKE_TIME_OR_DATE = /^\d{1,2}\s*[h:]|^\d{1,2}[/-]\d/i;

function fail(error: string): ParseResult {
  return { ok: false, error };
}

type DateMatch = { date: string; length: number } | { error: string } | null;

function matchDate(text: string, today: string): DateMatch {
  const year = Number(today.slice(0, 4));
  const build = (month: number, day: number, length: number): DateMatch =>
    isRealDate(year, month, day)
      ? { date: toDateString(year, month, day), length }
      : { error: "That date doesn't exist." };

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

type TimeMatch = { minutes: number; length: number } | { error: string } | null;

function matchTime(text: string): TimeMatch {
  const m = TIME.exec(text);
  if (!m) return null;
  const hours = Number(m[1]);
  const minutes = Number(m[2] ?? m[3] ?? 0);
  if (hours > 23 || minutes > 59) return { error: `"${m[0]}" isn't a valid time.` };
  return { minutes: hours * 60 + minutes, length: m[0].length };
}

/**
 * Reads one entry line. `today` ("YYYY-MM-DD", Paris) is only used to resolve
 * "yesterday" and the year of a date like "12 nov".
 */
export function parseEntry(input: string, today: string): ParseResult {
  const text = input.trim();
  if (!text) return fail("Type an activity.");

  let rest = text;
  let date: string | null = null;
  let start: number | null = null;
  let end: number | null = null;

  const dateMatch = matchDate(rest, today);
  if (dateMatch && "error" in dateMatch) return fail(dateMatch.error);
  if (dateMatch) {
    date = dateMatch.date;
    rest = rest.slice(dateMatch.length);
  }

  const first = matchTime(rest);
  if (first && "error" in first) return fail(first.error);
  if (first) {
    start = first.minutes;
    rest = rest.slice(first.length);

    // A second time makes it a range. Only taken if a real time follows the
    // separator, so "9h30 a meeting" or "9h30 to do list" stay activities.
    const separator = RANGE_SEPARATOR.exec(rest);
    if (separator) {
      const second = matchTime(rest.slice(separator[0].length));
      if (second && "error" in second) return fail(second.error);
      if (second) {
        end = second.minutes;
        rest = rest.slice(separator[0].length + second.length);
      }
    }
  } else if (date) {
    return fail("A date needs a time, e.g. \"yesterday 21h gym\".");
  } else if (LOOKS_LIKE_TIME_OR_DATE.test(rest)) {
    return fail("I couldn't read that time.");
  }

  // After a time, the activity must be separated from it ("9h30QRT" was
  // already refused by TIME's lookahead).
  const activity = rest.replace(BEFORE_ACTIVITY, "").trim();
  if (!activity) return fail("Add the activity after the time.");
  if (activity.length > MAX_ACTIVITY_LENGTH) {
    return fail(`Keep the activity under ${MAX_ACTIVITY_LENGTH} characters.`);
  }

  return { ok: true, entry: { date, start, end, activity } };
}
