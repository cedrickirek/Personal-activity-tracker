# A filled-in-later entry overlapped the one before it — Mistake Note

**Date:** 2026-11-12
**Symptom:** after logging `7h40 Reveil`, `12h00 Angelus`, then `8h50 somnolence`, the Sheet showed Reveil 07:40–12:00 *and* somnolence 08:50–12:00: two activities at the same time
**Time lost:** ~10 minutes (caught on my first manual test), but it would have silently corrupted the durations the Step 4 daily brief adds up
**Root cause:** `log_entry()` in `tracker/legacy.py` only closed the activity still *running*; an activity already closed with an inferred end later than the new entry's start was never shortened
**In plain words:** the rule is "an activity ends when the next one starts". When I added a morning activity after the fact, the app gave it the right end, but forgot to cut short the activity it landed in the middle of.

## 1. What happened

Step 1 kept the original "9h30 activity" text input, and applied the old app's
`infer_periods()` rule as each entry arrives: an activity with no stated end
ends when the next activity starts. Claude wrote that logic with two cases:

1. A new entry closes the activity that is still `in_progress`.
2. An entry filled in after the fact (earlier than something already logged)
   ends where the next activity starts.

43 automated tests passed, including one for each case. Then I used the app
for real and filled in my morning out of order:

| Entry typed | Result |
| --- | --- |
| `12h00 Angelus` | Angelus 12:00, running |
| `12h03 Claude code` | Angelus closed at 12:03 ✓ |
| `7h40 Reveil` | Reveil 07:40–12:00 ✓ (next start is 12:00) |
| `8h50 somnolence` | somnolence 08:50–12:00 ✓, **but Reveil still 07:40–12:00** ✗ |

Reveil was already `done`, so case 1 skipped it, and nothing else touched it.
Its end, 12:00, had only been *inferred*, and it should have moved to 08:50.

(I also typed ranges like `7h40 à 8h50 somnolence`, which became an activity
called "a 8h50 somnolence". That's not this bug: the temporary regex input
only understands one time. Ranges are a job for the Step 2 logger agent.)

## 2. Before / After

| # | Topic | Before (what I thought ✗) | After (correct ✓) |
| --- | --- | --- | --- |
| 1 | The infer rule | Only the running activity needs closing when a new one starts | Any activity whose period **contains** the new start must be cut there, running or not |
| 2 | Green tests | 43 passing tests mean the logic is right | Tests only cover the cases someone imagined; real use found a third case nobody wrote down |
| 3 | Regression tests | Write the test, see it pass, done | First check the new test **fails on the old code**; otherwise it might not be testing the bug at all |
| 4 | Moving an end | An end time is always safe to move | Only an *inferred* end is. The temporary input can't state an end, so every end it wrote is inferred. In Step 2 the agent can record ends I state ("lunch until 13:15"), and those must not be moved automatically |

## 3. The fix

In [`tracker/legacy.py`](../tracker/legacy.py), `log_entry()` now also closes
an activity that is `done` but whose period runs past the new start:

```python
running = row["status"] == "in_progress" and row["start"] <= start
interrupted = row["status"] == "done" and row["start"] < start < row["end"]
if running or interrupted:
    store.update_activity(row["id"], {"end": start, "status": "done"})
```

Regression test: `test_back_filled_entry_shortens_the_activity_it_interrupts`
in [`tests/test_legacy.py`](../tests/test_legacy.py) replays my exact
sequence. It was run against the old code first and failed with exactly what
I saw (`('07:40', '12:00') != ('07:40', '08:50')`), then passed with the fix.
44 tests pass. Commit `11f51a9`.

Rows already in the Sheet weren't corrected: the fix applies to new entries.
They were test rows, to be deleted by hand.

## 4. How I'd catch this faster next time

- **For any "fill the gaps" rule, test the insert in the middle**, not just
  at the end and at the start: before, after, between, same time.
- **Do a real manual run before calling a step done.** The plan's "done when"
  check is a manual test for a reason; it caught what the tests didn't.
- **Look at the data, not just the UI message.** "Started somnolence at
  08:50" was true; the overlap was only visible in the Sheet's rows.
- **Red, then green:** make a new regression test fail on the old code
  before trusting it.

## 5. One-line summaries to memorize

- An activity ends where the next one starts, including when the "next" one is inserted in the middle.
- Passing tests prove the cases you wrote, not the cases you forgot.
- A regression test must fail on the old code first.
- Inferred values can be recalculated; values the user stated can't.
