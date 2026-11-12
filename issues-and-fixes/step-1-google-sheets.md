# Step 1: Google Sheets storage

**Pull request:** [#1](https://github.com/cedrickirek/Personal-activity-tracker/pull/1), merged 2026-11-12
**In one line:** my activities now live in a Google Sheet instead of a file on the server, so they survive page refreshes, restarts and redeploys.

This file tells the story of the step: what was wrong, what changed and why,
what went wrong along the way, and what is still wrong. The debugging detail
is in [`mistakes/`](../mistakes/), linked where it applies.

## 1. Where it started

The first version (October 2025) was a single Streamlit file. I typed or said
an entry like "9h30 lunch", a regular expression pulled out the time and the
activity, and the entries waited in the page's memory until I clicked "Save
Day's Table", which wrote them to `activities.csv`.

### The two problems that made this step necessary

**My data didn't survive.**

- *In plain words:* entries vanished if I refreshed the page before saving.
  Once the app was online, even saved entries would vanish whenever the
  server restarted.
- *Technically:* unsaved entries lived in `st.session_state`, which belongs
  to one browser tab and is reset by a refresh. Saved entries went to
  `activities.csv` on the server's disk, and hosting platforms such as
  Streamlit Community Cloud wipe that disk on every restart or redeploy.

**Voice input could never work online.**

- *In plain words:* the microphone button would have tried to use the
  server's microphone, not my phone's.
- *Technically:* `sr.Microphone()` opens the microphone of the machine
  running Python. The language was also hard-coded to `en-US`, and I log in
  French too.

Both come from the same wrong belief: that the Python code runs on the device
I'm using. On my laptop it does, which hid both problems while I only ran it
there. → [It worked on my laptop because my laptop was the server](../mistakes/2026-11-12-my-laptop-was-the-server.md)

### Smaller problems fixed along the way

| Problem | In plain words | Technical cause | Fix |
| --- | --- | --- | --- |
| Crash on unrecognised text | Typing "Starting emails now" crashed the page | `parse_entry()` only assigned `t` and `activity` inside `if match:`, so text without a time raised `UnboundLocalError` | It returns `None` and the page shows a hint |
| Crash on the "today" table | The table crashed as soon as it had a row | `.sort_values(by="Start")` on a table whose column was called `"Time"` raised `KeyError` | The table is built from the Sheet's rows and sorted by `start` |
| Lowercased activities | "Emails to Marc" was saved as "emails to marc" | The regex ran on `text.lower()` | Case-insensitive matching (`re.IGNORECASE`), so the text is stored as typed |
| Two copies of the app | `app.py` and `app_1.py` were almost identical | A fix made in one copy never reached the other: `app_1.py` sorted by the right column, `app.py` didn't | `app_1.py` deleted; the notebook moved to `notebooks/` |

## 2. What Step 1 changed, and why

**The Google Sheet is now the only copy of my data.** Every entry is written
to the Sheet the moment I log it, and the tables on the page are read back
from it. The "Save Day's Table" button is gone. The Sheet lives outside the
server, costs nothing, and I can read or fix rows by hand from my phone.

How one entry travels:

```
Browser
  → app.py ............ the page only: form, messages, tables
  → tracker/legacy.py . reads "9h30 lunch", closes the previous activity (temporary)
  → tracker/sheets.py . checks the row, writes it
  → Google Sheets API → the "Activities" tab
```

Decisions worth explaining (the full table is in section 4 of the
[handoff note](../notes/2026-11-12-step-1-handoff.md)):

- **Values are written as plain text (`RAW`).** Otherwise Sheets turns
  "09:30" into a time and "2026-11-12" into a date, and runs anything that
  starts with `=` as a formula.
- **Reads are cached for 15 seconds, and every write clears the cache.**
  Streamlit re-runs the whole script on every click, and Google allows about
  60 reads a minute.
- **Before updating a row, the app re-reads the Sheet and finds the row by
  its `id`.** If I sorted or deleted rows by hand, a remembered row number
  would overwrite the wrong row.
- **The app has its own Google account (a service account)** that can only
  use Sheets, not the rest of my Google Drive, and only the Sheets shared
  with it.
- **Times are stored as zero-padded "HH:MM" text,** so comparing the text
  gives time order. The time zone is set to Europe/Paris explicitly, because
  hosted servers usually run on UTC.
- **Setup errors become sentences.** A missing key, a wrong Sheet ID, a Sheet
  that isn't shared, or a switched-off API each shows what to fix instead of
  a stack trace.

**Code structure.** `app.py` only draws the page. The logic is in `tracker/`:
`config.py`, `timeutils.py`, `sheets.py`, and the temporary `legacy.py`. 44
automated tests run the real Sheet code against an in-memory fake Sheet, with
no network and no credentials.

**Temporary, on purpose.** The old "9h30 activity" text input stays in
`tracker/legacy.py`, so the app keeps working until Step 2 replaces it. The
microphone button is removed; Step 3 records in the browser instead
(`st.audio_input`) and sends the audio to a speech-to-text service.

## 3. What went wrong during the step

**An entry filled in later overlapped the one before it.** The rule from the
first version is "an activity ends when the next one starts". The first
version of Step 1's logic applied it only to the activity still running, and
all 43 tests passed.

Then I used the app for real and filled in my morning out of order:
`12h00 Angelus`, then `7h40 Reveil`, then `8h50 somnolence`. The app ended
"somnolence" correctly at 12:00 but left "Reveil" at 07:40–12:00, so two
activities overlapped. The Step 4 daily brief adds up durations, so this
would have quietly inflated my day.

**The fix:** any activity whose period contains the new start time is cut
there, running or not. A regression test replays my exact sequence, and I
checked it failed on the old code before trusting the fix. 44 tests pass.

**What I took from it:** passing tests only prove the cases someone thought
of. The manual "done when" check found the case nobody had written down.
→ [A filled-in-later entry overlapped the one before it](../mistakes/2026-11-12-backfilled-entry-overlapped.md)

## 4. What's still wrong, and why Step 2 adds an agent

The temporary input understands one shape only: a time, then an activity.
Real entries don't fit it:

- **A time range.** `7h40 à 8h50 somnolence` was stored as one activity
  starting at 07:40, with "8h50" left inside its name.
- **A planned end** ("lunch until 13:15"), **a correction** ("actually I
  started at 9"), or **free text in French or English** with no time at the
  start.

Covering each shape with another regular expression would never end. Step 2
replaces the regex with a **logger agent**: a Mistral model reads my message
and proposes actions, such as starting or ending an activity, and my code
checks each one before anything is written to the Sheet. The model suggests;
the code decides.

One rule carries over from section 3. Today every end time is inferred, so
the app may move it. Once the agent records end times I state myself, those
must not be moved automatically.

## Where to look

- [Pull request #1](https://github.com/cedrickirek/Personal-activity-tracker/pull/1): every change in this step
- [Handoff note](../notes/2026-11-12-step-1-handoff.md): how the app works end to end, design decisions, how to run it
- [`mistakes/`](../mistakes/): the debugging post-mortems from this step
