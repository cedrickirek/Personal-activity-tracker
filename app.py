"""Streamlit page for the personal activity tracker.

This file only draws the page and reacts to clicks. Storage is in
tracker/sheets.py. Turning text into an activity is in tracker/legacy.py
for now; the logger agent replaces that in step 2.
"""

import pandas as pd
import streamlit as st
from gspread.exceptions import APIError

from tracker import legacy, timeutils
from tracker.config import ConfigError
from tracker.sheets import SheetSchemaError, get_store

TABLE_COLUMNS = ["start", "end", "activity", "category", "status", "planned_end", "comments"]

st.set_page_config(page_title="Activity Tracker", page_icon="🎯")
st.title("🎯 Daily Activity Tracker")

try:
    store = get_store()
except (ConfigError, SheetSchemaError) as error:
    st.error(str(error))
    st.stop()

# --- Input ---------------------------------------------------------------
st.subheader("➕ Log an activity")
with st.form("new_entry", clear_on_submit=True):
    text = st.text_input("What are you starting?", placeholder="9h30 - studied statistics")
    submitted = st.form_submit_button("Add entry")

if submitted and text.strip():
    parsed = legacy.parse_entry(text)
    if parsed is None:
        st.warning(
            "I couldn't find a time and an activity. "
            "Start with the time, like `9h30 lunch` or `14:05 emails`."
        )
    else:
        start, activity = parsed
        try:
            row = legacy.log_entry(store, start, activity, raw_input=text)
        except APIError as error:
            st.error(f"Google Sheets refused the write: {error}")
        else:
            st.success(f"Started **{row['activity']}** at {row['start']}.")

# --- Tables ----------------------------------------------------------------
try:
    activities = store.list_activities()
except APIError as error:
    st.error(f"Couldn't read the Google Sheet: {error}")
    st.stop()

today = timeutils.today_str()
todays = [row for row in activities if row["date"] == today]
history = [row for row in activities if row["date"] != today]

st.subheader(f"📋 Today ({today})")
if todays:
    st.dataframe(pd.DataFrame(todays, columns=TABLE_COLUMNS), hide_index=True)
else:
    st.info("Nothing logged today yet.")

st.subheader("🗓️ Previous days")
if history:
    previous = pd.DataFrame(history, columns=["date", *TABLE_COLUMNS])
    previous = previous.sort_values(["date", "start"], ascending=[False, True])
    st.dataframe(previous, hide_index=True)
else:
    st.info("No earlier days yet.")
