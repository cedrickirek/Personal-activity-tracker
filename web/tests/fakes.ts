// Test helpers: an in-memory spreadsheet tab, and a way to replay entries
// through the real parser and rules, the way the server action does.

import type { Activity } from "@/lib/activity";
import { parseEntry } from "@/lib/parse";
import { planEntry } from "@/lib/periods";
import type { SheetGrid } from "@/lib/store";
import type { ParisNow } from "@/lib/time";

/** A spreadsheet tab as a grid of strings. Like Google, it trims trailing empty cells. */
export class FakeGrid implements SheetGrid {
  constructor(public rows: string[][] = []) {}

  async readAll(): Promise<string[][]> {
    return this.rows.map((row) => [...row]);
  }

  async appendRow(values: string[]): Promise<void> {
    this.rows.push(trimEnd(values));
  }

  async writeRow(rowNumber: number, values: string[]): Promise<void> {
    while (this.rows.length < rowNumber) this.rows.push([]);
    this.rows[rowNumber - 1] = trimEnd(values);
  }
}

function trimEnd(values: string[]): string[] {
  const copy = [...values];
  while (copy.length && copy[copy.length - 1] === "") copy.pop();
  return copy;
}

export function at(date: string, hhmm: string): ParisNow {
  const [h, m] = hhmm.split(":").map(Number);
  return { date, minutes: h * 60 + m, iso: `${date}T${hhmm}:00+01:00` };
}

let nextId = 0;

/** Parses and plans `text` at `now`, then applies the result to `rows`. */
export function replay(rows: Activity[], text: string, now: ParisNow): Activity[] {
  const parsed = parseEntry(text, now.date);
  if (!parsed.ok) throw new Error(`parse failed for "${text}": ${parsed.error}`);
  const plan = planEntry(rows, parsed.entry, text, now);
  if (!plan.ok) throw new Error(`plan failed for "${text}": ${plan.error}`);
  const updated = rows.map((row) => {
    const update = plan.updates.find((u) => u.id === row.id);
    return update ? { ...row, ...update.fields } : row;
  });
  updated.push({ ...plan.newRow, id: `id${++nextId}`, logged_at: now.iso });
  return updated;
}

/** "activity start-end" for each row, in time order: easy to compare in a test. */
export function summary(rows: Activity[]): string[] {
  return [...rows]
    .sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start))
    .map((row) => `${row.activity} ${row.start}-${row.end}`);
}

export function row(fields: Partial<Activity>): Activity {
  return {
    id: `r${++nextId}`,
    date: "2026-11-13",
    start: "09:00",
    end: "",
    planned_end: "",
    activity: "something",
    category: "",
    status: "in_progress",
    comments: "",
    raw_input: "",
    logged_at: "",
    end_type: "",
    ...fields,
  };
}
