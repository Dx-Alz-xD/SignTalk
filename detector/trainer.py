"""Train one symbol by holding the gesture in front of the camera.

The capture is gated on stillness: frames only count while the pose is holding
steady, so a sample set never ends up full of half-formed transitions between
one gesture and the next.
"""

from __future__ import annotations

import time

import numpy as np

from . import features
from .ui_input import msvcrt

DEFAULT_SAMPLES = 40
COUNTDOWN = 3.0
CAPTURE_TIMEOUT = 45.0

# Max feature distance between consecutive frames for one to count as "still".
# Calibrated against the ASL dataset: two different photos of the same letter
# from the same angle sit at a median distance of 0.29 (p90 0.73), and
# consecutive frames of one person holding a pose are far closer than that.
# 0.7 therefore absorbs natural micro-jitter while still rejecting real motion.
STILL_THRESHOLD = 0.7


class CaptureResult:
    __slots__ = ("vectors", "cancelled", "reason", "spread")

    def __init__(self, vectors, cancelled=False, reason="", spread=0.0):
        self.vectors = vectors
        self.cancelled = cancelled
        self.reason = reason
        self.spread = spread

    def __bool__(self):
        return bool(self.vectors) and not self.cancelled


def _abort_requested(feed) -> bool:
    key = feed.take_key()
    if key in (27, ord("q"), ord("Q")):
        return True
    if msvcrt is not None and msvcrt.kbhit():
        ch = msvcrt.getwch()
        if ch in ("\x00", "\xe0"):
            msvcrt.getwch()
            return False
        if ch == "\x03":
            raise KeyboardInterrupt
        return True
    return False


def _spread(vectors) -> float:
    """Mean distance from the centroid - how consistent the hold was."""
    if len(vectors) < 2:
        return 0.0
    matrix = np.asarray(vectors, dtype=np.float32)
    centroid = matrix.mean(axis=0)
    return float(np.mean([features.distance(v, centroid) for v in matrix]))


def capture_symbol(feed, title: str, target: int = DEFAULT_SAMPLES,
                   countdown: float = COUNTDOWN, view: str = "",
                   view_hint: str = "") -> CaptureResult:
    """Count down, then collect `target` steady frames of the held gesture.

    `view`/`view_hint` only affect what the window says - the samples are
    identical either way; it's the caller that files them under a view.
    """
    feed.drain_keys()
    feed.set_progress(0.0)

    shown = f"{title} [{view}]" if view else title
    ready = view_hint or "hold the gesture"

    start = time.time()
    while True:
        left = countdown - (time.time() - start)
        if left <= 0:
            break
        feed.set_banner(
            title=f"GET READY - {shown}",
            subtitle=f"{ready}... starting in {left:.1f}s",
            hint="ESC or any key cancels",
            tone="warn",
        )
        if _abort_requested(feed):
            feed.clear_overlay()
            return CaptureResult([], cancelled=True, reason="cancelled during countdown")
        time.sleep(0.05)

    vectors = []
    previous = None
    last_stamp = 0.0
    began = time.time()

    while len(vectors) < target:
        if time.time() - began > CAPTURE_TIMEOUT:
            feed.clear_overlay()
            return CaptureResult(vectors, cancelled=True,
                                 reason="timed out waiting for a steady hold")
        if _abort_requested(feed):
            feed.clear_overlay()
            return CaptureResult(vectors, cancelled=True, reason="cancelled")

        vector, hands, stamp = feed.latest()
        if stamp == last_stamp:
            time.sleep(0.01)          # no new frame yet
            continue
        last_stamp = stamp

        progress = len(vectors) / target
        feed.set_progress(progress)

        if vector is None:
            previous = None
            feed.set_banner(title=f"RECORDING - {shown}",
                            subtitle="no hand detected - bring it into frame",
                            hint=f"{len(vectors)}/{target} samples", tone="bad")
            continue

        if previous is not None and features.distance(vector, previous) > STILL_THRESHOLD:
            previous = vector
            feed.set_banner(title=f"RECORDING - {shown}",
                            subtitle="hold still - moving frames are skipped",
                            hint=f"{len(vectors)}/{target} samples", tone="warn")
            continue

        previous = vector
        vectors.append(vector.copy())
        feed.set_banner(
            title=f"RECORDING - {shown}",
            subtitle=f"keep holding ({hands} hand{'s' if hands != 1 else ''})",
            hint=f"{len(vectors)}/{target} samples",
            tone="ok",
        )

    feed.set_progress(1.0)
    feed.set_banner(title=f"CAPTURED - {shown}",
                    subtitle=f"{len(vectors)} samples", tone="ok")
    time.sleep(0.6)
    feed.clear_overlay()

    return CaptureResult(vectors, spread=_spread(vectors))


def describe_quality(result: CaptureResult) -> str:
    """Plain-language read on how clean the captured hold was."""
    if not result.vectors:
        return "no samples"
    if result.spread < 0.35:
        return f"very consistent (spread {result.spread:.2f})"
    if result.spread < 0.8:
        return f"good (spread {result.spread:.2f})"
    return (f"shaky (spread {result.spread:.2f}) - consider retraining with a "
            f"steadier hold")
