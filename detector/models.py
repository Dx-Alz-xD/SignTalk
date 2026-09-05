"""Fetches the MediaPipe hand-landmark model on first run.

MediaPipe 1.x ships no bundled model, so the .task bundle has to come from
Google's public model store once and is then cached under detector/models/.
"""

from __future__ import annotations

import urllib.error
import urllib.request
from pathlib import Path

MODEL_DIR = Path(__file__).resolve().parent / "models"
HAND_LANDMARKER = MODEL_DIR / "hand_landmarker.task"

HAND_LANDMARKER_URL = (
    "https://storage.googleapis.com/mediapipe-models/hand_landmarker/"
    "hand_landmarker/float16/latest/hand_landmarker.task"
)

MIN_BYTES = 100_000  # a truncated download should not be cached


def ensure_hand_landmarker(quiet: bool = False):
    """Return the local model path, downloading it if needed. None on failure."""
    if HAND_LANDMARKER.exists() and HAND_LANDMARKER.stat().st_size > MIN_BYTES:
        return HAND_LANDMARKER

    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    if not quiet:
        print("  Downloading hand-tracking model (~7 MB, one time)...")

    tmp = HAND_LANDMARKER.with_suffix(".part")
    try:
        with urllib.request.urlopen(HAND_LANDMARKER_URL, timeout=60) as response:
            data = response.read()
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        if not quiet:
            print(f"  ! Model download failed: {exc}")
            print(f"    Download it manually from:\n      {HAND_LANDMARKER_URL}")
            print(f"    and save it as:\n      {HAND_LANDMARKER}")
        return None

    if len(data) < MIN_BYTES:
        if not quiet:
            print("  ! Model download looks truncated; not caching it.")
        return None

    tmp.write_bytes(data)
    tmp.replace(HAND_LANDMARKER)
    if not quiet:
        print(f"  Saved model to {HAND_LANDMARKER}")
    return HAND_LANDMARKER
