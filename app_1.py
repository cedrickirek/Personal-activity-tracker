import streamlit as st
import pandas as pd
import re
import os
import speech_recognition as sr
from datetime import datetime

# -------------------------------
# Utility functions
# -------------------------------

def parse_entry(text):
    """
    Parse an entry like '9h30 - lunch' into ('09:30', 'lunch')
    """
    pattern_1 = r"(\d{1,2}h\d{0,2})\s*(.*)"  # eg: 9h30 lunch
    pattern_2 = r"(\d{1,2}:\d{0,2})\s*(.*)"  # eg: 09:30 lunch

    match = re.match(pattern_1, text.strip().lower()) # 1st pattern
    if match: 
        time_str, activity = match.groups()
        time_str = time_str.replace("h", ":")
        try:
            t = datetime.strptime(time_str, "%H:%M").strftime("%H:%M")
        except:
            t = None

    match = re.match(pattern_2, text.strip().lower()) # 2nd pattern
    if match:
        time_str, activity = match.groups()
        try:
            t = datetime.strptime(time_str, "%H:%M").strftime("%H:%M")
        except:
            t = None

    return t, activity.strip()
    
def infer_periods(entries):
    """
    Given a list of (time, activity, logged_at) tuples,
    return a DataFrame inferring start-end times.
    """
    data = []
    for i in range(len(entries)):
        start_time, activity, logged_at = entries[i]
        if i + 1 < len(entries):
            end_time = entries[i + 1][0]
        else:
            end_time = ""
        data.append([start_time, activity, "", logged_at])
    df = pd.DataFrame(data, columns=["Start", "Activity", "Comments", "Logged at"])
    return df

def recognize_speech():
    """
    Capture voice input and convert to text using Google Speech Recognition.
    """
    r = sr.Recognizer()
    with sr.Microphone() as source:
        st.info("🎤 Listening... speak now!")
        audio = r.listen(source)
    try:
        text = r.recognize_google(audio, language="en-US")
        st.success(f"You said: {text}")
        return text
    except sr.UnknownValueError:
        st.error("Could not understand audio.")
    except sr.RequestError:
        st.error("Speech recognition service error.")
    return None

# -------------------------------
# Streamlit UI
# -------------------------------

st.set_page_config(page_title="Voice Activity Tracker", page_icon="🎧")
st.title("🎯 Daily Productivity Tracker")
st.markdown("Log your activities by **speaking** or **typing** below. Example: `9h30 - studied statistics`")

# Load or initialize data
if os.path.exists("activities.csv"):
    df_existing = pd.read_csv("activities.csv")
else:
    df_existing = pd.DataFrame(columns=["Start","Activity", "Comments", "Logged at"])

# Store new entries temporarily
if "entries" not in st.session_state:
    st.session_state.entries = []

# --- Input Options ---
st.subheader("➕ Add New Entry")

col1, col2 = st.columns(2)

with col1:
    if st.button("🎙️ Voice Input"):
        text = recognize_speech()
        if text:
            time_str, activity = parse_entry(text)
            if time_str:
                logged_at = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                st.session_state.entries.append((time_str, activity, logged_at))  ### why do I not need to put something for the 3rd column?
            else:
                st.warning("Could not parse time/activity from your speech.")

with col2:
    manual_entry = st.text_input("✍️ Or type here:")
    if st.button("Add Entry"):
        if manual_entry:
            time_str, activity = parse_entry(manual_entry)
            if time_str:
                logged_at = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                st.session_state.entries.append((time_str, activity, logged_at)) ### why do I not need to put something for the 3rd column?
            else:
                st.warning("Could not parse time/activity from text.")

# --- Display current entries ---
if st.session_state.entries:
    st.subheader("📋 Current Day Entries")
    st.dataframe(pd.DataFrame(st.session_state.entries, columns=["Time", "Activity", "Logged at"]).sort_values(by="Time"))

    if st.button("✅ Save Day's Table"):
        df_new = infer_periods(st.session_state.entries)
        df_final = pd.concat([df_existing, df_new], ignore_index=True)
        df_final.to_csv("activities.csv", index=False)
        st.success("Saved successfully to 'activities.csv'!")
        st.session_state.entries = []
else:
    st.info("No entries yet. Add one by speaking or typing.")

# --- Display existing log ---
if not df_existing.empty:
    st.subheader("🗓️ Previous Activities")
    st.dataframe(df_existing)