// The shape of one row of the `Activities` tab, shared by the Sheet code and
// the period rules. Every value is a string, because the Sheet stores text.

export const ACTIVITY_COLUMNS = [
  "id",
  "date",
  "start",
  "end",
  "planned_end",
  "activity",
  "category",
  "status",
  "comments",
  "raw_input",
  "logged_at",
  // Added in v2 (v1's Python code accepts extra trailing columns).
  "end_type",
] as const;

export type ActivityColumn = (typeof ACTIVITY_COLUMNS)[number];
export type Activity = Record<ActivityColumn, string>;

/** The columns the app may change on an existing row (never id or logged_at). */
export type ActivityUpdate = Partial<Omit<Activity, "id" | "logged_at">>;

export type Status = "in_progress" | "done" | "abandoned";

/**
 * `stated`: I gave this end, so the app never moves it.
 * `inferred`: set by "an activity ends when the next one starts", so a later
 * entry may cut it shorter. v1 rows have an empty end_type; every end v1 wrote
 * was inferred, so empty is treated as inferred.
 */
export type EndType = "stated" | "inferred" | "";
