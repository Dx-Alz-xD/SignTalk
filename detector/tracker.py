"""Hand tracking.

Wraps MediaPipe behind a tiny dataclass API so nothing else in the package
touches MediaPipe types. Two backends are supported:

  * the Tasks API (`mediapipe.tasks.vision.HandLandmarker`) - required from
    MediaPipe 1.0, which dropped `mp.solutions`; needs a .task model bundle,
    fetched once by `models.ensure_hand_landmarker()`
  * the legacy `mp.solutions.hands` graph, for older 0.10.x installs

If neither is usable the tracker degrades to a no-op that reports *why*, so
the camera and CLI still run.

Note on handedness: the preview is mirrored, so a "Left"/"Right" label is the
mirror of the real hand. That's harmless - training and inference both see the
same mirrored view - but it's why the labels can look backwards on screen.
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field

# 21-point hand skeleton, used for drawing.
HAND_CONNECTIONS = (
    (0, 1), (1, 2), (2, 3), (3, 4),            # thumb
    (0, 5), (5, 6), (6, 7), (7, 8),            # index
    (5, 9), (9, 10), (10, 11), (11, 12),       # middle
    (9, 13), (13, 14), (14, 15), (15, 16),     # ring
    (13, 17), (17, 18), (18, 19), (19, 20),    # pinky
    (0, 17),                                    # palm base
)


@dataclass
class Hand:
    """One detected hand. Landmarks are normalised image coords in [0, 1]."""

    label: str  # "Left" or "Right"
    score: float
    landmarks: list = field(default_factory=list)  # [(x, y, z), ...] len 21


@dataclass
class TrackedFrame:
    hands: list = field(default_factory=list)

    @property
    def count(self) -> int:
        return len(self.hands)


class HandTracker:
    """Must be constructed and used on a single thread - MediaPipe graphs are
    not thread safe. The camera thread owns the only instance."""

    def __init__(self, max_hands: int = 2, detection_conf: float = 0.6,
                 tracking_conf: float = 0.5, quiet: bool = False):
        self.available = False
        self.reason = ""
        self.backend = ""
        self._impl = None
        self._mp = None
        self._start = time.time()

        try:
            import mediapipe as mp
        except Exception as exc:
            self.reason = f"mediapipe not installed ({exc.__class__.__name__})"
            return
        self._mp = mp

        if hasattr(mp, "tasks") and hasattr(mp.tasks, "vision"):
            if self._init_tasks(mp, max_hands, detection_conf, tracking_conf, quiet):
                return
        if hasattr(mp, "solutions"):
            if self._init_solutions(mp, max_hands, detection_conf, tracking_conf):
                return
        if not self.reason:
            self.reason = "no usable MediaPipe hand backend found"

    # ----------------------------------------------------------- backends --
    def _init_tasks(self, mp, max_hands, detection_conf, tracking_conf, quiet):
        from .models import ensure_hand_landmarker

        model_path = ensure_hand_landmarker(quiet=quiet)
        if model_path is None:
            self.reason = "hand_landmarker.task model is missing (download failed)"
            return False
        try:
            vision = mp.tasks.vision
            options = vision.HandLandmarkerOptions(
                base_options=mp.tasks.BaseOptions(model_asset_path=str(model_path)),
                running_mode=vision.RunningMode.VIDEO,
                num_hands=max_hands,
                min_hand_detection_confidence=detection_conf,
                min_hand_presence_confidence=detection_conf,
                min_tracking_confidence=tracking_conf,
            )
            self._impl = vision.HandLandmarker.create_from_options(options)
        except Exception as exc:
            self.reason = f"could not start HandLandmarker: {exc}"
            return False
        self.backend = "tasks"
        self.available = True
        return True

    def _init_solutions(self, mp, max_hands, detection_conf, tracking_conf):
        try:
            self._impl = mp.solutions.hands.Hands(
                static_image_mode=False,
                max_num_hands=max_hands,
                model_complexity=0,
                min_detection_confidence=detection_conf,
                min_tracking_confidence=tracking_conf,
            )
        except Exception as exc:
            self.reason = f"could not start MediaPipe Hands: {exc}"
            return False
        self.backend = "solutions"
        self.available = True
        return True

    # ------------------------------------------------------------ process --
    def process(self, rgb_frame) -> TrackedFrame:
        """Run detection on an RGB frame. Empty frame if unavailable."""
        if not self.available or self._impl is None:
            return TrackedFrame()
        try:
            if self.backend == "tasks":
                return self._process_tasks(rgb_frame)
            return self._process_solutions(rgb_frame)
        except Exception:
            # A single bad frame must never take the camera thread down.
            return TrackedFrame()

    def _process_tasks(self, rgb_frame) -> TrackedFrame:
        mp = self._mp
        image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb_frame)
        # VIDEO mode requires strictly increasing timestamps.
        stamp = int((time.time() - self._start) * 1000)
        result = self._impl.detect_for_video(image, stamp)
        if not result or not result.hand_landmarks:
            return TrackedFrame()

        handedness = result.handedness or []
        hands = []
        for i, landmarks in enumerate(result.hand_landmarks):
            label, score = "Right", 1.0
            if i < len(handedness) and handedness[i]:
                cat = handedness[i][0]
                label = cat.category_name or label
                score = float(cat.score)
            hands.append(Hand(label=label, score=score,
                              landmarks=[(p.x, p.y, p.z) for p in landmarks]))
        return TrackedFrame(hands=hands)

    def _process_solutions(self, rgb_frame) -> TrackedFrame:
        result = self._impl.process(rgb_frame)
        if not result.multi_hand_landmarks:
            return TrackedFrame()

        handedness = result.multi_handedness or []
        hands = []
        for i, lm in enumerate(result.multi_hand_landmarks):
            label, score = "Right", 1.0
            if i < len(handedness) and handedness[i].classification:
                cls = handedness[i].classification[0]
                label, score = cls.label, float(cls.score)
            hands.append(Hand(label=label, score=score,
                              landmarks=[(p.x, p.y, p.z) for p in lm.landmark]))
        return TrackedFrame(hands=hands)

    def close(self) -> None:
        if self._impl is not None:
            try:
                self._impl.close()
            except Exception:
                pass
            self._impl = None
        self.available = False
