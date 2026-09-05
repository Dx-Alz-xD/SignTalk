"""The camera window.

Everything else in this package is CLI. This module owns the one graphical
piece: a live preview window with the hand skeleton drawn on it, a status
banner the CLI can write to, a progress bar for training, and a clickable
"TEST INTERPRETER" button.

The window runs on its own thread and that thread is the *only* one that
touches OpenCV's GUI or MediaPipe. The CLI talks to it through the small
locked API below (`set_banner`, `latest`, `take_button_press`, ...).
"""

from __future__ import annotations

import queue
import sys
import threading
import time

import cv2
import numpy as np

from . import features
from .tracker import HAND_CONNECTIONS, HandTracker

WINDOW = "SignTalk Detector - Camera"

BAR_H = 64
BUTTON_LABEL = "TEST INTERPRETER"

# BGR, not RGB - OpenCV's channel order.
COL_BG = (24, 22, 20)
COL_TEXT = (240, 240, 240)
COL_MUTED = (160, 158, 155)
COL_ACCENT = (60, 180, 250)    # amber
COL_OK = (110, 220, 130)       # green
COL_WARN = (250, 190, 80)      # blue
COL_BAD = (90, 90, 235)        # red


class CameraFeed(threading.Thread):
    def __init__(self, index: int = 0, width: int = 960, height: int = 540,
                 mirror: bool = True):
        super().__init__(name="camera", daemon=True)
        self.index = index
        self.width = width
        self.height = height
        self.mirror = mirror

        self.ready = threading.Event()      # set once the first frame is up
        self.failed = threading.Event()     # set if the camera never opened
        self.error = ""
        self.tracker_note = ""

        self._stop = threading.Event()
        self._lock = threading.Lock()
        self._vector = None
        self._hand_count = 0
        self._stamp = 0.0
        self._fps = 0.0

        self._banner = {"title": "", "subtitle": "", "hint": "", "tone": "muted"}
        self._progress = None
        self._readout = ""

        self._buttons = queue.Queue()
        self._keys = queue.Queue()
        self._button_rect = (0, 0, 0, 0)

    # ------------------------------------------------------ CLI-side API ---
    def latest(self):
        """(vector, hand_count, frame_timestamp) for the most recent frame.

        Callers compare the timestamp against the last one they saw so a
        stalled camera can't be sampled twice.
        """
        with self._lock:
            return self._vector, self._hand_count, self._stamp

    def set_banner(self, title: str = "", subtitle: str = "", hint: str = "",
                   tone: str = "muted") -> None:
        with self._lock:
            self._banner = {"title": title, "subtitle": subtitle,
                            "hint": hint, "tone": tone}

    def set_progress(self, value) -> None:
        """0.0-1.0 to show the training bar, or None to hide it."""
        with self._lock:
            self._progress = value

    def set_readout(self, text: str) -> None:
        """Big centred text - used for the live interpreter result."""
        with self._lock:
            self._readout = text

    def clear_overlay(self) -> None:
        self.set_banner()
        self.set_progress(None)
        self.set_readout("")

    def take_button_press(self) -> bool:
        pressed = False
        while True:
            try:
                self._buttons.get_nowait()
            except queue.Empty:
                break
            pressed = True
        return pressed

    def take_key(self):
        try:
            return self._keys.get_nowait()
        except queue.Empty:
            return None

    def drain_keys(self) -> None:
        while self.take_key() is not None:
            pass

    def stop(self) -> None:
        self._stop.set()

    # ---------------------------------------------------------- internals --
    def _on_mouse(self, event, x, y, _flags, _param):
        if event != cv2.EVENT_LBUTTONDOWN:
            return
        bx, by, bw, bh = self._button_rect
        if bx <= x <= bx + bw and by <= y <= by + bh:
            self._buttons.put(time.time())

    def _open_capture(self):
        backends = [cv2.CAP_DSHOW, cv2.CAP_ANY] if sys.platform == "win32" else [cv2.CAP_ANY]
        for backend in backends:
            cap = cv2.VideoCapture(self.index, backend)
            if cap.isOpened():
                cap.set(cv2.CAP_PROP_FRAME_WIDTH, self.width)
                cap.set(cv2.CAP_PROP_FRAME_HEIGHT, self.height)
                cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
                return cap
            cap.release()
        return None

    def run(self):  # noqa: C901 - a render loop is linear, not complex
        cap = self._open_capture()
        if cap is None:
            self.error = (f"could not open camera {self.index} - it may be in use "
                          f"by another app, or blocked by Windows camera privacy "
                          f"settings")
            self.failed.set()
            self.ready.set()
            return

        tracker = HandTracker()
        if not tracker.available:
            self.tracker_note = tracker.reason

        cv2.namedWindow(WINDOW, cv2.WINDOW_AUTOSIZE)
        cv2.setMouseCallback(WINDOW, self._on_mouse)

        last = time.time()
        misses = 0
        try:
            while not self._stop.is_set():
                ok, frame = cap.read()
                if not ok:
                    misses += 1
                    if misses > 60:
                        self.error = "camera stopped returning frames"
                        self.failed.set()
                        break
                    time.sleep(0.02)
                    continue
                misses = 0

                # Drivers often ignore the requested capture size, so pin the
                # preview width here - it keeps the window a predictable size
                # and keeps per-frame tracking cost down.
                if frame.shape[1] != self.width:
                    scale = self.width / frame.shape[1]
                    frame = cv2.resize(frame, (self.width,
                                               int(frame.shape[0] * scale)),
                                       interpolation=cv2.INTER_AREA)
                if self.mirror:
                    frame = cv2.flip(frame, 1)

                # MediaPipe's Image wrapper needs a contiguous RGB buffer.
                rgb = np.ascontiguousarray(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))
                tracked = tracker.process(rgb)
                vector = features.encode(tracked)

                now = time.time()
                dt = now - last
                last = now
                with self._lock:
                    self._vector = vector
                    self._hand_count = tracked.count
                    self._stamp = now
                    if dt > 0:
                        self._fps = 0.9 * self._fps + 0.1 * (1.0 / dt)

                canvas = self._render(frame, tracked)
                cv2.imshow(WINDOW, canvas)
                self.ready.set()

                key = cv2.waitKey(1) & 0xFF
                if key != 255:
                    self._keys.put(key)

                # User closed the window with the X - reopen it, since the CLI
                # still expects a camera to exist.
                if cv2.getWindowProperty(WINDOW, cv2.WND_PROP_VISIBLE) < 1:
                    cv2.namedWindow(WINDOW, cv2.WINDOW_AUTOSIZE)
                    cv2.setMouseCallback(WINDOW, self._on_mouse)
        finally:
            tracker.close()
            cap.release()
            try:
                cv2.destroyWindow(WINDOW)
                cv2.waitKey(1)
            except cv2.error:
                pass

    # ------------------------------------------------------------ drawing --
    def _render(self, frame, tracked):
        h, w = frame.shape[:2]
        self._draw_hands(frame, tracked, w, h)

        canvas = np.full((h + BAR_H, w, 3), COL_BG, dtype=np.uint8)
        canvas[:h] = frame

        with self._lock:
            banner = dict(self._banner)
            progress = self._progress
            readout = self._readout
            fps = self._fps
            hands = self._hand_count

        self._draw_status(canvas, w, hands, fps)
        self._draw_banner(canvas, w, banner)
        if readout:
            self._draw_readout(canvas, w, h, readout)
        if progress is not None:
            self._draw_progress(canvas, w, h, progress)
        self._draw_bar(canvas, w, h, banner.get("hint", ""))
        return canvas

    @staticmethod
    def _draw_hands(frame, tracked, w, h):
        for hand in tracked.hands:
            pts = [(int(x * w), int(y * h)) for x, y, _z in hand.landmarks]
            colour = COL_ACCENT if hand.label == "Right" else COL_WARN
            for a, b in HAND_CONNECTIONS:
                cv2.line(frame, pts[a], pts[b], colour, 2, cv2.LINE_AA)
            for i, pt in enumerate(pts):
                radius = 5 if i in (4, 8, 12, 16, 20) else 3
                cv2.circle(frame, pt, radius, (255, 255, 255), -1, cv2.LINE_AA)
            cv2.putText(frame, hand.label, (pts[0][0] - 20, pts[0][1] + 28),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.5, colour, 1, cv2.LINE_AA)

    def _draw_status(self, canvas, w, hands, fps):
        text = f"{hands} hand{'s' if hands != 1 else ''}  |  {fps:4.1f} fps"
        if self.tracker_note:
            text = "NO HAND TRACKING  |  " + self.tracker_note
        colour = COL_BAD if self.tracker_note else (COL_OK if hands else COL_MUTED)
        cv2.rectangle(canvas, (0, 0), (w, 28), (0, 0, 0), -1)
        cv2.putText(canvas, text, (12, 19), cv2.FONT_HERSHEY_SIMPLEX, 0.5,
                    colour, 1, cv2.LINE_AA)

    @staticmethod
    def _draw_banner(canvas, w, banner):
        title = banner.get("title") or ""
        subtitle = banner.get("subtitle") or ""
        if not title and not subtitle:
            return
        tone = {"ok": COL_OK, "warn": COL_WARN, "bad": COL_BAD,
                "accent": COL_ACCENT}.get(banner.get("tone"), COL_TEXT)

        height = 40 + (26 if subtitle else 0)
        overlay = canvas.copy()
        cv2.rectangle(overlay, (0, 28), (w, 28 + height), (0, 0, 0), -1)
        cv2.addWeighted(overlay, 0.55, canvas, 0.45, 0, canvas)

        if title:
            cv2.putText(canvas, title, (12, 60), cv2.FONT_HERSHEY_SIMPLEX,
                        0.78, tone, 2, cv2.LINE_AA)
        if subtitle:
            cv2.putText(canvas, subtitle, (12, 60 + 24), cv2.FONT_HERSHEY_SIMPLEX,
                        0.5, COL_MUTED, 1, cv2.LINE_AA)

    @staticmethod
    def _draw_readout(canvas, w, h, text):
        scale = 1.4 if len(text) < 22 else 0.9
        (tw, th), _ = cv2.getTextSize(text, cv2.FONT_HERSHEY_SIMPLEX, scale, 3)
        x = max(10, (w - tw) // 2)
        y = h - 40
        overlay = canvas.copy()
        cv2.rectangle(overlay, (x - 16, y - th - 16), (x + tw + 16, y + 16),
                      (0, 0, 0), -1)
        cv2.addWeighted(overlay, 0.6, canvas, 0.4, 0, canvas)
        cv2.putText(canvas, text, (x, y), cv2.FONT_HERSHEY_SIMPLEX, scale,
                    COL_OK, 3, cv2.LINE_AA)

    @staticmethod
    def _draw_progress(canvas, w, h, value):
        value = max(0.0, min(1.0, float(value)))
        x0, x1 = 40, w - 40
        y = h - 96
        cv2.rectangle(canvas, (x0, y), (x1, y + 20), (60, 58, 56), -1)
        filled = int(x0 + (x1 - x0) * value)
        if filled > x0:
            cv2.rectangle(canvas, (x0, y), (filled, y + 20), COL_ACCENT, -1)
        cv2.rectangle(canvas, (x0, y), (x1, y + 20), (110, 108, 106), 1)
        cv2.putText(canvas, f"{int(value * 100)}%", (x1 - 54, y - 8),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.55, COL_TEXT, 1, cv2.LINE_AA)

    def _draw_bar(self, canvas, w, h, hint):
        bw, bh = 240, 40
        bx, by = 12, h + (BAR_H - bh) // 2
        self._button_rect = (bx, by, bw, bh)

        cv2.rectangle(canvas, (bx, by), (bx + bw, by + bh), COL_ACCENT, -1)
        cv2.rectangle(canvas, (bx, by), (bx + bw, by + bh), (255, 255, 255), 1)
        (tw, _), _ = cv2.getTextSize(BUTTON_LABEL, cv2.FONT_HERSHEY_SIMPLEX, 0.6, 2)
        cv2.putText(canvas, BUTTON_LABEL, (bx + (bw - tw) // 2, by + 26),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.6, (20, 20, 20), 2, cv2.LINE_AA)

        hint = hint or "keep this window in view - the CLI drives everything else"
        cv2.putText(canvas, hint, (bx + bw + 18, by + 25),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.48, COL_MUTED, 1, cv2.LINE_AA)
