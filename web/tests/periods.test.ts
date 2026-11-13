import { describe, expect, it } from "vitest";
import type { Activity } from "@/lib/activity";
import { parseEntry } from "@/lib/parse";
import { planEntry, planStop, todayView } from "@/lib/periods";
import { at, replay, row, summary } from "./fakes";

const TODAY = "2026-11-13";
const YESTERDAY = "2026-11-12";
const afternoon = at(TODAY, "14:05");

function planError(rows: Activity[], text: string, now = afternoon): string {
  const parsed = parseEntry(text, now.date);
  if (!parsed.ok) throw new Error(parsed.error);
  const plan = planEntry(rows, parsed.entry, text, now);
  if (plan.ok) throw new Error(`"${text}" was accepted`);
  return plan.error;
}

function play(texts: string[], now = afternoon, rows: Activity[] = []): Activity[] {
  return texts.reduce((acc, text) => replay(acc, text, now), rows);
}

describe("an activity ends when the next one starts", () => {
  it("a new entry closes the running one", () => {
    const rows = play(["9h QRT prep", "10h emails"]);
    expect(summary(rows)).toEqual(["QRT prep 09:00-10:00", "emails 10:00-"]);
    expect(rows[0]).toMatchObject({ status: "done", end_type: "inferred" });
    expect(rows[1]).toMatchObject({ status: "in_progress", end_type: "" });
  });

  it("no time means now", () => {
    const rows = play(["9h QRT prep", "emails"]);
    expect(summary(rows)).toEqual(["QRT prep 09:00-14:05", "emails 14:05-"]);
  });

  it("an entry filled in later ends at the next start", () => {
    const rows = play(["12h Angelus", "9h breakfast"]);
    expect(summary(rows)).toEqual(["breakfast 09:00-12:00", "Angelus 12:00-"]);
  });

  it("an entry filled in later shortens the one it lands in (the v1 Step 1 bug)", () => {
    // The exact sequence from mistakes/2026-11-12-backfilled-entry-overlapped.md
    const rows = play(["12h00 Angelus", "12h03 Claude code", "7h40 Reveil", "8h50 somnolence"]);
    expect(summary(rows)).toEqual([
      "Reveil 07:40-08:50",
      "somnolence 08:50-12:00",
      "Angelus 12:00-12:03",
      "Claude code 12:03-",
    ]);
  });

  it("treats v1 rows (empty end_type) as inferred", () => {
    const v1 = [row({ activity: "Reveil", start: "07:40", end: "12:00", status: "done", end_type: "" })];
    expect(summary(play(["8h50 somnolence"], afternoon, v1))).toContain("Reveil 07:40-08:50");
  });
});

describe("stated ends", () => {
  it("a range is stated and done", () => {
    const rows = play(["9h30-10h15 QRT prep"]);
    expect(rows[0]).toMatchObject({ start: "09:30", end: "10:15", status: "done", end_type: "stated" });
  });

  it("are never moved by a later entry", () => {
    const rows = play(["9h-11h meeting", "10h call"]);
    expect(summary(rows)).toContain("meeting 09:00-11:00");
  });
});

describe("midnight", () => {
  it("a range ending earlier than it starts began yesterday", () => {
    const rows = play(["23h30 7h45 sleep"], at(TODAY, "08:00"));
    expect(rows[0]).toMatchObject({ date: YESTERDAY, start: "23:30", end: "07:45", end_type: "stated" });
  });

  it("a sleep logged in the morning after midnight stays today", () => {
    const rows = play(["1h30 7h45 sleep"], at(TODAY, "08:00"));
    expect(rows[0]).toMatchObject({ date: TODAY, start: "01:30", end: "07:45" });
  });

  it("closes last night's running activity at the morning's first entry", () => {
    const evening = play(["22h reading"], at(YESTERDAY, "22:00"));
    const rows = play(["1h30 7h45 sleep"], at(TODAY, "08:00"), evening);
    expect(rows[0]).toMatchObject({ date: YESTERDAY, start: "22:00", end: "01:30", status: "done", end_type: "inferred" });
  });

  it("in the night, a time later than now means last night", () => {
    const rows = play(["23h50 brushing teeth"], at(TODAY, "00:20"));
    expect(rows[0]).toMatchObject({ date: YESTERDAY, start: "23:50" });
  });

  it("leaves an activity running for over 24 hours alone", () => {
    const old = [row({ date: "2026-11-11", start: "08:00", activity: "forgotten" })];
    const rows = play(["10h emails"], afternoon, old);
    expect(rows[0]).toMatchObject({ end: "", status: "in_progress" });
  });
});

describe("dates", () => {
  it("logs on the typed day, and fits between that day's entries", () => {
    const yesterday = play(["20h dinner", "22h reading"], at(YESTERDAY, "22:30"));
    const rows = play(["yesterday 21h gym"], afternoon, yesterday);
    expect(summary(rows)).toEqual(["dinner 20:00-21:00", "gym 21:00-22:00", "reading 22:00-"]);
  });
});

describe("rejected", () => {
  it("a start later than now, during the day", () => {
    expect(planError([], "15h gym")).toContain("in the future");
  });
  it("an end later than now", () => {
    expect(planError([], "14h 15h meeting")).toContain("end time is in the future");
  });
  it("a date after today", () => {
    expect(planError([], "november 20 21h gym")).toContain("date is in the future");
  });
});

describe("Stop current", () => {
  it("ends the running activity now, as a stated end", () => {
    const rows = play(["9h QRT prep"]);
    const plan = planStop(rows, afternoon);
    expect(plan.updates).toEqual([{ id: rows[0].id, fields: { end: "14:05", status: "done", end_type: "stated" } }]);
    expect(plan.message).toContain("Stopped “QRT prep” at 14:05");
  });

  it("says when nothing is running", () => {
    const plan = planStop(play(["9h-10h QRT prep"]), afternoon);
    expect(plan.updates).toEqual([]);
    expect(plan.message).toBe("Nothing is running.");
  });

  it("doesn't stop something that has run for over 24 hours", () => {
    const plan = planStop([row({ date: "2026-11-11", start: "08:00", activity: "forgotten" })], afternoon);
    expect(plan.updates).toEqual([]);
    expect(plan.message).toContain("over 24 hours");
  });
});

describe("today's list", () => {
  it("shows today in time order, plus last night's sleep, not yesterday's day", () => {
    const rows = [
      row({ date: YESTERDAY, start: "18:00", end: "19:00", activity: "yesterday's gym", status: "done" }),
      row({ date: YESTERDAY, start: "23:30", end: "07:45", activity: "sleep", status: "done" }),
      row({ date: TODAY, start: "10:00", activity: "emails" }),
      row({ date: TODAY, start: "08:00", end: "10:00", activity: "breakfast", status: "done" }),
    ];
    const view = todayView(rows, afternoon);
    expect(view.map((item) => item.activity)).toEqual(["sleep", "breakfast", "emails"]);
    expect(view[0]).toMatchObject({ startedYesterday: true, start: "23:30", end: "07:45" });
    expect(view[2]).toMatchObject({ running: true, end: "" });
  });

  it("ignores rows a hand edit broke", () => {
    const rows = [row({ start: "not a time" }), row({ date: "13/11/2026" }), row({ start: "9:30", activity: "ok" })];
    expect(todayView(rows, afternoon).map((item) => item.activity)).toEqual(["ok"]);
  });
});
