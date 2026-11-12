# The Sheet kept refusing the service account — Mistake Note

**Date:** 2026-11-12 (setup started 2026-11-10)
**Symptom:** every attempt to open the Google Sheet from code came back as HTTP 403, with a different message each time I fixed something
**Time lost:** about 45 minutes, spread over two days
**Root cause:** three setup slips stacked on top of each other, each one hidden behind the previous: the service account was created in the wrong Google Cloud project, the Sheets API wasn't enabled in the right one, and the Sheet I shared was a duplicate
**In plain words:** the app gets its own Google identity, a "robot account". Three things have to line up: the robot lives in the right project, that project has the Google Sheets service switched on, and the Sheet invites that exact robot. All three were wrong at first, and each one only showed up once the previous one was fixed.

## 1. What happened

Step 1 of the rebuild moves storage from a local `activities.csv` to a Google
Sheet. The app talks to the Sheet as a **service account**, a non-human Google
account with a downloadable key file, because the app runs unattended on a
server and can't do a "Sign in with Google" click.

1. **Wrong project.** I created the service account while the Google Cloud
   console had another project selected (`vernal-day-480009-q1`), and saved
   its key on my iPhone. I noticed the next day and created a fresh one,
   `tracker-writer@activity-tracker-514412`, in the right project, with its
   key downloaded straight to the laptop.
2. **API off.** Claude ran a read-only check: log in as the service account,
   open the Sheet by its ID, list the tabs. Google answered 403: *"Google
   Sheets API has not been used in project 1058629180031 before or it is
   disabled."* The API was not switched on in the new project. I enabled it
   from the link in the error message, which includes the project number,
   so it can't land in the wrong project.
3. **Not shared.** Next check: still 403, but now *"The caller does not have
   permission."* The API was on; the Sheet just didn't let this account in.
   I shared it. Still 403.
4. **Not a delay.** Claude retried every 20 seconds for two minutes
   (11:58–12:00, 7 attempts): refused every time, so it wasn't Google taking
   time to apply the share.
5. **Wrong Sheet.** The clue was that the error was 403, not 404. A 404
   means "no file with this ID"; a 403 means "the file exists, but this
   account can't see it". So the ID was right and the sharing was on the
   wrong file. Looking at the Share dialog, I realised I had two Sheets:
   `sheets.new` creates a **brand-new** spreadsheet every time you open it,
   and I had opened it once on my phone (where I copied the ID) and once on
   the laptop (where I did the sharing). Sharing the Sheet from the exact
   ID's URL fixed it: the check opened `Activity-tracker` and listed its tabs.

## 2. Before / After

| # | Topic | Before (what I thought ✗) | After (correct ✓) |
| --- | --- | --- | --- |
| 1 | Google Cloud projects | A service account or an enabled API belongs to my Google account | Service accounts, their keys and enabled APIs all belong to **one project**; the project picker in the top bar decides which |
| 2 | Reading a 403 | 403 means "not shared" | 403 covers several problems; read Google's **message**: "has not been used … or it is disabled" = API off for that project; "caller does not have permission" = this account can't access the file |
| 3 | 403 vs 404 | Both mean "something is wrong with the Sheet" | 404 = no file with that ID (check the ID); 403 = the file exists but this account can't see it (check the sharing) |
| 4 | `sheets.new` | A shortcut to "my new Sheet" | It creates a new, empty spreadsheet on **every** visit; two visits = two Sheets with similar names |
| 5 | Waiting it out | Maybe Google just needs time | Sharing applies within seconds; a timed retry (2 minutes here) rules propagation out instead of guessing |
| 6 | Moving the key | Copy the key file from the phone to the PC | A key is a password: create a new key on the machine that needs it and delete the old one, rather than moving the secret around |

## 3. The fix

- New service account in the right project:
  `tracker-writer@activity-tracker-514412.iam.gserviceaccount.com`.
- Sheets API enabled in that project.
- The Sheet whose ID is in `SHEET_ID` shared with that address as Editor.
- `.streamlit/secrets.toml` generated from the key by a script that never
  prints the key and checks the result parses back identically (the
  `private_key` line breaks are the usual way this file gets broken by hand).
  The file is git-ignored.
- The app itself now turns each of these failures into a sentence saying
  what to fix, instead of a stack trace: see `get_store()` in
  [`tracker/sheets.py`](../tracker/sheets.py). gspread raises the same
  `PermissionError` for "API off" and "not shared", so the code reads
  Google's original message (kept on `error.__cause__`) to tell them apart.

Still to do: delete the first service account in `vernal-day-480009-q1`
(that makes the key on the iPhone useless), delete the key file from the
phone and from Downloads, and delete the duplicate Sheet.

## 4. How I'd catch this faster next time

- **Check the project picker before creating anything** in Google Cloud.
- **Open fixes from the error's own link** when it contains a project number.
- **Read the error message, not just the status code.** Three different 403
  messages pointed at three different problems.
- **Use 403 vs 404 to split the search in half**: ID problem or access problem.
- **Open the Sheet from its ID's URL** (`/spreadsheets/d/<SHEET_ID>/edit`)
  before sharing, so I share the file the app uses.
- **Test the connection on its own, read-only, before running the app**: a
  ~15-line script that opens the Sheet and prints Google's raw message. It
  separates setup problems from app bugs, and changes nothing.

## 5. One-line summaries to memorize

- Service accounts, keys and APIs live in a project; check the picker first.
- Same status code, different message, different fix: read the message.
- 404 = wrong ID; 403 = right file, no access.
- `sheets.new` makes a new Sheet every time.
- Don't move secrets around; regenerate them where they're needed.
