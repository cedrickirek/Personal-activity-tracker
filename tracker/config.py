"""Settings, read from Streamlit secrets with environment variables as a fallback.

Locally, Streamlit reads `.streamlit/secrets.toml`. On Streamlit Cloud the
same content is pasted into the app's Secrets settings, so the code is
identical in both places. Environment variables help when running code
outside Streamlit (scripts, a notebook).
"""

from __future__ import annotations

import json
import os
from typing import Any
from zoneinfo import ZoneInfo

import streamlit as st

# Every date and time in the app is Paris time. Never rely on the server's
# own clock: Streamlit Cloud servers run on UTC.
TIMEZONE = ZoneInfo("Europe/Paris")


class ConfigError(RuntimeError):
    """A setting is missing or wrong. The message says what to fix, for the UI to show."""


def get(name: str, default: Any = None) -> Any:
    """Return a setting from st.secrets, else from the environment, else `default`."""
    try:
        if name in st.secrets:
            return st.secrets[name]
    except FileNotFoundError:
        # No secrets.toml anywhere. Streamlit raises a FileNotFoundError
        # subclass for that; fall through to environment variables.
        pass
    return os.environ.get(name, default)


def require(name: str) -> Any:
    """Like get(), but a missing or empty setting is an error."""
    value = get(name)
    if value is None or value == "":
        raise ConfigError(
            f"The setting `{name}` is missing. Add it to `.streamlit/secrets.toml` "
            "(see `.streamlit/secrets.toml.example`)."
        )
    return value


def sheet_id() -> str:
    return str(require("SHEET_ID")).strip()


def service_account_info() -> dict[str, Any]:
    """The Google service-account key, as the dict google-auth expects."""
    info = get("gcp_service_account")
    if isinstance(info, str):
        # As an environment variable, the key arrives as one JSON string.
        info = json.loads(info)
    if not info or not info.get("private_key") or not info.get("client_email"):
        raise ConfigError(
            "The Google service-account key is missing. Fill in the "
            "`[gcp_service_account]` section of `.streamlit/secrets.toml`."
        )
    # st.secrets hands back a read-only mapping; google-auth wants a plain dict.
    return dict(info)
