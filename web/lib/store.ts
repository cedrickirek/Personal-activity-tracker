// Reading and writing activities as rows of the `Activities` tab.
//
// The Google-specific part is behind the small `SheetGrid` interface, so this
// file can be tested against an in-memory grid (tests/fakes.ts), the same idea
// as v1's FakeWorksheet.

import { randomUUID } from "node:crypto";
import { ACTIVITY_COLUMNS, type Activity, type ActivityUpdate } from "./activity";

/** The four operations the store needs from a spreadsheet tab. */
export interface SheetGrid {
  /** Every row of the tab, header included. Rows may be shorter than the header. */
  readAll(): Promise<string[][]>;
  /** Adds a row after the last one. Values are stored as plain text. */
  appendRow(values: string[]): Promise<void>;
  /** Replaces row `rowNumber` (1-based, as in the Sheet). */
  writeRow(rowNumber: number, values: string[]): Promise<void>;
}

export class SheetSchemaError extends Error {}

const V1_COLUMNS = ACTIVITY_COLUMNS.slice(0, ACTIVITY_COLUMNS.indexOf("end_type"));

export class ActivityStore {
  private headerChecked = false;

  constructor(private readonly grid: SheetGrid) {}

  /** All activities, in Sheet order. Blank rows are skipped. */
  async list(): Promise<Activity[]> {
    const { rows } = await this.read();
    return rows.map((r) => r.activity);
  }

  async add(fields: Omit<Activity, "id" | "logged_at">, loggedAt: string): Promise<Activity> {
    await this.read(); // makes sure the header is right before the first write
    // 8 hex characters, like v1's ids: short enough to read in the Sheet.
    const activity: Activity = { ...fields, id: randomUUID().replace(/-/g, "").slice(0, 8), logged_at: loggedAt };
    await this.grid.appendRow(ACTIVITY_COLUMNS.map((column) => activity[column]));
    return activity;
  }

  /**
   * Changes some columns of one activity. The Sheet is re-read first and the
   * row is found by its id, not by a remembered row number: if I sorted or
   * deleted rows by hand in the meantime, a row number would point at the
   * wrong activity.
   */
  async update(id: string, fields: ActivityUpdate): Promise<void> {
    const { rows } = await this.read();
    const found = rows.find((r) => r.activity.id === id);
    if (!found) throw new Error(`No activity with id ${id} in the Sheet.`);
    const updated: Activity = { ...found.activity, ...fields };
    await this.grid.writeRow(found.rowNumber, ACTIVITY_COLUMNS.map((column) => updated[column]));
  }

  private async read(): Promise<{ rows: { rowNumber: number; activity: Activity }[] }> {
    const grid = await this.grid.readAll();
    await this.checkHeader(grid[0] ?? []);
    const rows: { rowNumber: number; activity: Activity }[] = [];
    grid.slice(1).forEach((cells, index) => {
      if (cells.every((cell) => !cell?.trim())) return; // blank row
      const activity = {} as Activity;
      ACTIVITY_COLUMNS.forEach((column, i) => {
        activity[column] = (cells[i] ?? "").trim();
      });
      rows.push({ rowNumber: index + 2, activity }); // +1 for the header, +1 for 1-based
    });
    return { rows };
  }

  /**
   * An empty tab gets the header. A v1 header (11 columns) gets `end_type`
   * added at the end. Anything else is an error rather than a guess, because
   * writing columns in the wrong order would corrupt the data.
   */
  private async checkHeader(header: string[]): Promise<void> {
    if (this.headerChecked) return;
    const cells = header.map((cell) => cell.trim());
    const isEmpty = cells.every((cell) => !cell);
    const matches = (expected: readonly string[]) => expected.every((column, i) => cells[i] === column);

    if (isEmpty) {
      await this.grid.writeRow(1, [...ACTIVITY_COLUMNS]);
    } else if (matches(ACTIVITY_COLUMNS)) {
      // already right
    } else if (matches(V1_COLUMNS) && !cells[V1_COLUMNS.length]) {
      await this.grid.writeRow(1, [...ACTIVITY_COLUMNS]);
    } else {
      throw new SheetSchemaError(
        `The Activities tab's header row isn't the expected one. Expected: ${ACTIVITY_COLUMNS.join(", ")}. Found: ${cells.join(", ")}.`,
      );
    }
    this.headerChecked = true;
  }
}
