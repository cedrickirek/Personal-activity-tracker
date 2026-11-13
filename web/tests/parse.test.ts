import { describe, expect, it } from "vitest";
import { parseEntry } from "@/lib/parse";

const TODAY = "2026-11-13";
const t = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

function ok(text: string) {
  const result = parseEntry(text, TODAY);
  if (!result.ok) throw new Error(`"${text}" was rejected: ${result.error}`);
  return result.entry;
}

function rejected(text: string): string {
  const result = parseEntry(text, TODAY);
  if (result.ok) throw new Error(`"${text}" was accepted: ${JSON.stringify(result.entry)}`);
  return result.error;
}

describe("no time: starts now", () => {
  it.each(["QRT prep", "  QRT prep  ", "2 emails", "Done"])("%s", (text) => {
    expect(ok(text)).toEqual({ date: null, start: null, end: null, activity: text.trim() });
  });
});

describe("one time", () => {
  it.each(["9h30 QRT prep", "9:30 QRT prep", "09h30 QRT prep", "09:30 QRT prep", "9H30 QRT prep", "09h30 - QRT prep", "9h30: QRT prep"])(
    "%s",
    (text) => {
      expect(ok(text)).toEqual({ date: null, start: t("09:30"), end: null, activity: "QRT prep" });
    },
  );

  it("whole hours", () => {
    expect(ok("9h QRT prep").start).toBe(t("09:00"));
  });

  it("keeps the activity as typed", () => {
    expect(ok("9h30 Emails to Marc").activity).toBe("Emails to Marc");
  });

  it("doesn't mistake words for a range", () => {
    expect(ok("9h30 a meeting")).toMatchObject({ start: t("09:30"), end: null, activity: "a meeting" });
    expect(ok("9h30 to do list")).toMatchObject({ end: null, activity: "to do list" });
  });
});

describe("a range", () => {
  it.each([
    "9h30-10h15 QRT prep",
    "9h30 - 10h15 QRT prep",
    "9h30–10h15 QRT prep",
    "9h30 à 10h15 QRT prep",
    "9h30 a 10h15 QRT prep",
    "9h30 to 10h15 QRT prep",
    "9h30 10h15 QRT prep",
    "9:30-10:15 QRT prep",
  ])("%s", (text) => {
    expect(ok(text)).toEqual({ date: null, start: t("09:30"), end: t("10:15"), activity: "QRT prep" });
  });

  it("can end earlier than it starts (the next day)", () => {
    expect(ok("1h30 7h45 sleep")).toMatchObject({ start: t("01:30"), end: t("07:45") });
    expect(ok("23h30 7h45 sleep")).toMatchObject({ start: t("23:30"), end: t("07:45") });
  });
});

describe("a date", () => {
  it.each([
    "yesterday 21h gym",
    "hier 21h gym",
    "Yesterday 21h gym",
    "12/11 21h gym",
    "12-11 21h gym",
    "12 nov 21h gym",
    "12 Nov. 21h gym",
    "12 november 21h gym",
    "12th november 21h gym",
    "november 12 21h gym",
    "november 12th 21h gym",
    "Nov 12 21h gym",
  ])("%s", (text) => {
    expect(ok(text)).toEqual({ date: "2026-11-12", start: t("21:00"), end: null, activity: "gym" });
  });

  it("with a range", () => {
    expect(ok("12 nov 21h-22h gym")).toEqual({ date: "2026-11-12", start: t("21:00"), end: t("22:00"), activity: "gym" });
  });

  it("other months", () => {
    expect(ok("3rd march 8h run").date).toBe("2026-03-03");
    expect(ok("1/2 8h run").date).toBe("2026-02-01");
  });
});

describe("the time and date at the end", () => {
  it.each([
    ["test 9h30", { date: null, start: t("09:30"), end: null, activity: "test" }],
    ["QRT prep 9:30", { date: null, start: t("09:30"), end: null, activity: "QRT prep" }],
    ["QRT prep 9h30-10h15", { date: null, start: t("09:30"), end: t("10:15"), activity: "QRT prep" }],
    ["QRT prep 9h30 10h15", { date: null, start: t("09:30"), end: t("10:15"), activity: "QRT prep" }],
    ["manger yesterday 21h00 22h15", { date: "2026-11-12", start: t("21:00"), end: t("22:15"), activity: "manger" }],
    ["gym 12 nov 21h", { date: "2026-11-12", start: t("21:00"), end: null, activity: "gym" }],
    ["sleep 23h30 7h45", { date: null, start: t("23:30"), end: t("07:45"), activity: "sleep" }],
  ])("%s", (text, expected) => {
    expect(ok(text)).toEqual(expected);
  });

  it("drops the little word before the time", () => {
    expect(ok("lunch at 12h").activity).toBe("lunch");
    expect(ok("manger à 12h").activity).toBe("manger");
    expect(ok("manger de 12h à 13h")).toMatchObject({ start: t("12:00"), end: t("13:00"), activity: "manger" });
    expect(ok("QRT prep - 9h30").activity).toBe("QRT prep");
  });

  it("keeps words that only look similar", () => {
    expect(ok("chat 9h").activity).toBe("chat");
    expect(ok("manger").start).toBeNull();
    expect(ok("call Marc about 2 slides")).toMatchObject({ start: null, activity: "call Marc about 2 slides" });
  });

  it.each([
    ["gym yesterday", "needs a time"],
    ["gym 25h", "isn't a valid time"],
    ["gym 9h3", "couldn't read that time"],
    ["gym 9h30 25h", "isn't a valid time"],
  ])("rejects %j", (text, message) => {
    expect(rejected(text)).toContain(message);
  });
});

describe("rejected", () => {
  it.each([
    ["", "Type an activity"],
    ["   ", "Type an activity"],
    ["9h30", "Add the activity"],
    ["9h30 10h15", "Add the activity"],
    ["25h gym", "isn't a valid time"],
    ["9h75 gym", "isn't a valid time"],
    ["9h3 gym", "couldn't read that time"],
    ["9h30QRT", "couldn't read that time"],
    ["9:5 gym", "couldn't read that time"],
    ["yesterday gym", "needs a time"],
    ["yesterday", "needs a time"],
    ["12 nov gym", "needs a time"],
    ["31/02 21h gym", "doesn't exist"],
    ["9h30 25h gym", "isn't a valid time"],
  ])("%j", (text, message) => {
    expect(rejected(text)).toContain(message);
  });

  it("very long activities", () => {
    expect(rejected(`9h ${"x".repeat(201)}`)).toContain("under 200");
  });
});
