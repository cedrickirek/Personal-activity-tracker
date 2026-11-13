import { describe, expect, it } from "vitest";
import { ACTIVITY_COLUMNS, type Activity } from "@/lib/activity";
import { ActivityStore, SheetSchemaError } from "@/lib/store";
import { FakeGrid, row } from "./fakes";

const HEADER = [...ACTIVITY_COLUMNS];
const V1_HEADER = HEADER.slice(0, 11);

/** A row's fields, minus the two the store fills in itself. */
function newFields(): Omit<Activity, "id" | "logged_at"> {
  const full: Partial<Activity> = row({ activity: "QRT prep", start: "09:30" });
  delete full.id;
  delete full.logged_at;
  return full as Omit<Activity, "id" | "logged_at">;
}

describe("header", () => {
  it("writes the header on an empty tab", async () => {
    const grid = new FakeGrid();
    expect(await new ActivityStore(grid).list()).toEqual([]);
    expect(grid.rows[0]).toEqual(HEADER);
  });

  it("adds end_type to a v1 header, keeping v1's rows", async () => {
    const v1Row = ["abc12345", "2026-11-12", "07:40", "12:00", "", "Reveil", "", "done", "", "7h40 Reveil", "2026-11-12T12:05:00+01:00"];
    const grid = new FakeGrid([V1_HEADER, v1Row]);
    const [activity] = await new ActivityStore(grid).list();
    expect(grid.rows[0]).toEqual(HEADER);
    expect(activity).toMatchObject({ id: "abc12345", activity: "Reveil", end_type: "" });
  });

  it("refuses a header it doesn't recognise instead of guessing", async () => {
    const grid = new FakeGrid([["date", "id", "start"]]);
    await expect(new ActivityStore(grid).list()).rejects.toThrow(SheetSchemaError);
  });
});

describe("rows", () => {
  it("adds a row in column order, with an id and logged_at", async () => {
    const grid = new FakeGrid([HEADER]);
    const added = await new ActivityStore(grid).add(newFields(), "2026-11-13T09:31:00+01:00");
    expect(added.id).toMatch(/^[0-9a-f]{8}$/);
    expect(grid.rows[1][ACTIVITY_COLUMNS.indexOf("id")]).toBe(added.id);
    expect(grid.rows[1][ACTIVITY_COLUMNS.indexOf("activity")]).toBe("QRT prep");
    expect(grid.rows[1][ACTIVITY_COLUMNS.indexOf("logged_at")]).toBe("2026-11-13T09:31:00+01:00");
  });

  it("skips blank rows and reads short rows", async () => {
    const grid = new FakeGrid([HEADER, [], ["", " "], ["id1", "2026-11-13", "09:00"]]);
    const rows = await new ActivityStore(grid).list();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: "id1", end: "", activity: "" });
  });

  it("updates the right row even after rows were moved by hand", async () => {
    const grid = new FakeGrid([HEADER]);
    const store = new ActivityStore(grid);
    const first = await store.add(newFields(), "t1");
    const second = await store.add({ ...newFields(), activity: "emails" }, "t2");
    // I sort the Sheet by hand: the second row is now first.
    grid.rows = [HEADER, grid.rows[2], grid.rows[1]];

    await store.update(first.id, { end: "10:00", status: "done" });

    const rows = await store.list();
    expect(rows.find((r) => r.id === first.id)).toMatchObject({ activity: "QRT prep", end: "10:00", status: "done" });
    expect(rows.find((r) => r.id === second.id)).toMatchObject({ activity: "emails", end: "" });
  });

  it("fails clearly when the id isn't in the Sheet", async () => {
    const store = new ActivityStore(new FakeGrid([HEADER]));
    await expect(store.update("nope", { end: "10:00" })).rejects.toThrow("No activity with id nope");
  });
});
