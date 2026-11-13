# It worked on my laptop because my laptop was the server — Mistake Note

**Date:** 2026-11-12 (the original app dates from October 2025)
**Symptom:** none seen in use. Reading the original code while planning the rebuild showed that voice input and saving to `activities.csv` only work while the app runs on my own laptop
**Time lost:** no debugging time; the cost was a redesign. Storage was rebuilt in Step 1, and voice input is rebuilt in Step 3
**Root cause:** the original app treated the computer running the Python code as the device I use the app on. On my laptop they are the same machine; once the app is hosted, they aren't
**In plain words:** a Streamlit app has two halves: the page in my browser, and the Python program behind it. On my laptop both halves are on the same computer, so the program could use my microphone and save a file on my disk. Online, the program runs on a computer somewhere else. That computer has no microphone, and its disk is wiped every time it restarts.

## 1. What happened

The original `app.py` (still on `main`) did three things that depend on which
computer runs the Python code:

1. **Voice input.** The 🎙️ button called `recognize_speech()`, which opens
   `sr.Microphone()` from the `speech_recognition` library. That is the
   microphone of the machine running Python. On my laptop, that's my laptop's
   microphone. On a hosted server, there is no microphone, and if there were
   one it wouldn't be mine: the button could never hear my phone. The
   language was also hard-coded to `en-US`, and I log in French too.
2. **Saving.** New entries waited in `st.session_state.entries` until I
   pressed "✅ Save Day's Table", which wrote them, with the earlier rows, to
   `activities.csv`. That's a relative path, so the file goes in the server's
   working folder. On my laptop it stays there. On a hosting platform such as
   Streamlit Community Cloud, the app's disk is temporary: a restart, a
   redeploy or waking up after a period of inactivity starts again from the
   code in the repo, and the CSV is gone.
3. **The clock.** `logged_at` came from `datetime.now()`, the server's local
   time. On my laptop that's Paris time. Hosted servers usually run on UTC,
   so every timestamp would have been one or two hours off.

Separately, unsaved entries in `st.session_state` disappeared on a page
refresh, even on my laptop: session state lives in the server's memory, one
copy per browser tab, and a refresh starts a new one.

On my laptop, none of the first three shows, because the browser and the
server are the same computer. They were flagged in the rebuild plan (now `REBUILD_PLAN_v1.md`) and
account for two of its five steps.

## 2. Before / After

| # | Topic | Before (what I thought ✗) | After (correct ✓) |
| --- | --- | --- | --- |
| 1 | Where the Python code runs | On the device I'm using the app from | On the server. On my laptop, the server *is* my laptop; hosted, it's a remote machine I never touch |
| 2 | `sr.Microphone()` | Records the user's microphone | Records the microphone of the machine running Python. The browser has to record (`st.audio_input`) and send the audio to the server |
| 3 | `to_csv("activities.csv")` | Saves my data | Saves to the server's disk, which hosting platforms wipe on restart or redeploy. Data has to go to storage outside the server: a database, or here a Google Sheet |
| 4 | `st.session_state` | Holds my entries until I save them | Lives in the server's memory, one copy per browser tab, and a refresh loses it. Fine for what the page is showing; never the only copy of data |
| 5 | `datetime.now()` | Gives the time where I am | Gives the server's time, usually UTC once hosted. Ask for the timezone explicitly (`Europe/Paris`) |
| 6 | Testing on my laptop | If it works on my laptop, it works online | My laptop hides the difference between the browser and the server. Anything touching hardware, files or the clock has to be tested hosted, or at least thought through |

## 3. The fix

- **Storage (Step 1, done):** every entry is written to a Google Sheet as
  soon as it's logged, and the tables on the page are read back from it
  ([`tracker/sheets.py`](../tracker/sheets.py)). Nothing important lives on
  the server's disk or only in `st.session_state`. The "Save Day's Table"
  button is gone.
- **Clock (Step 1, done):** [`tracker/config.py`](../tracker/config.py)
  defines `TIMEZONE = ZoneInfo("Europe/Paris")`, and
  [`tracker/timeutils.py`](../tracker/timeutils.py) asks for Paris time
  explicitly, whatever the server's own clock says.
- **Voice (Step 3, to do):** the `sr.Microphone()` button was removed in
  Step 1. Step 3 records in the browser with `st.audio_input`, which sends the
  audio to the server, and transcribes it with a speech-to-text service that
  handles French and English.

## 4. How I'd catch this faster next time

- **Ask "which computer runs this line?"** for anything that touches a
  microphone, camera, file, or the clock.
- **Deploy early.** A throwaway deploy on day one, with one saved entry,
  would have shown the voice and storage problems in minutes.
- **Restart test:** save something, reboot the hosted app (Streamlit
  Community Cloud has a "Reboot app" button), and check the data is still
  there.
- **Refresh test:** refresh the page halfway through entering data.
- **Read where a library runs.** `speech_recognition`'s `Microphone` uses
  PyAudio on the local machine; the docs say so.

## 5. One-line summaries to memorize

- Streamlit's Python runs on the server, not in my browser.
- My laptop hides the difference between the server and my device.
- A hosted server's disk is temporary: keep data in outside storage.
- `st.session_state` is per tab and dies on refresh: never the only copy.
- The browser records the audio; the server only receives it.
- The server's clock isn't in Paris: always set the timezone.
