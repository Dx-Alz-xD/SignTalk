"""Bridge between the browser's MediaPipe output and the detector's encoder.

The browser sends, per captured sample, the hands it saw:

    [{"label": "Right", "score": 0.98, "landmarks": [[x, y, z], ... x21]}, ...]

Two things come out of that and both get stored:

*Landmarks* - packed to a fixed 126 floats (2 slots x 21 points x 3 coords,
left slot first, zeros for an absent hand). This is the source of truth. A
future change to the feature layout re-encodes from these; it never asks
anyone to retrain.

*Features* - the 190-float vector produced by detector/features.py, cached so
the classifier does not re-encode thousands of samples on every request.

Reusing detector.features here is the point: the vector a browser sample
produces is bit-identical to one the desktop CLI would produce from the same
hand, so models trained either way are interchangeable.
"""

from __future__ import annotations

import numpy as np

from detector import features as F
from detector.tracker import Hand, TrackedFrame

POINTS = 21
COORDS = 3
PER_HAND = POINTS * COORDS          # 63
LANDMARK_SIZE = PER_HAND * 2        # 126
SLOTS = ("Left", "Right")


class LandmarkError(ValueError):
    """The client sent something that is not a usable hand sample."""


def _clean_hand(raw) -> Hand | None:
    """Validate one hand from the wire. Returns None if it is unusable."""
    if not isinstance(raw, dict):
        return None
    points = raw.get("landmarks")
    if not isinstance(points, (list, tuple)) or len(points) != POINTS:
        return None

    cleaned = []
    for point in points:
        if isinstance(point, dict):
            values = (point.get("x"), point.get("y"), point.get("z", 0.0))
        elif isinstance(point, (list, tuple)) and len(point) >= 2:
            values = (point[0], point[1], point[2] if len(point) > 2 else 0.0)
        else:
            return None
        try:
            x, y, z = (float(v) for v in values)
        except (TypeError, ValueError):
            return None
        if not all(np.isfinite(v) for v in (x, y, z)):
            return None
        cleaned.append((x, y, z))

    label = str(raw.get("label") or "Right").capitalize()
    if label not in SLOTS:
        label = "Right"
    try:
        score = float(raw.get("score", 1.0))
    except (TypeError, ValueError):
        score = 1.0
    return Hand(label=label, score=score, landmarks=cleaned)


def to_frame(raw_hands) -> TrackedFrame:
    """Wire format -> TrackedFrame. Empty frame if nothing usable came through."""
    if not isinstance(raw_hands, (list, tuple)):
        return TrackedFrame()
    hands = [h for h in (_clean_hand(r) for r in raw_hands[:2]) if h is not None]
    return TrackedFrame(hands=hands)


def pack_landmarks(frame: TrackedFrame) -> np.ndarray:
    """TrackedFrame -> fixed 126-float row. Absent hands are left as zeros.

    All-zero is an unambiguous "no hand": real landmarks are normalised image
    coordinates and never land on exactly (0, 0, 0) across all 21 points.
    """
    row = np.zeros(LANDMARK_SIZE, dtype=np.float32)
    used = set()
    for hand in sorted(frame.hands, key=lambda h: -h.score):
        slot = SLOTS.index(hand.label)
        if slot in used:
            slot = 1 - slot
            if slot in used:
                continue
        used.add(slot)
        row[slot * PER_HAND:(slot + 1) * PER_HAND] = np.asarray(
            hand.landmarks, dtype=np.float32).reshape(-1)
    return row


def unpack_landmarks(row) -> TrackedFrame:
    """126-float row -> TrackedFrame, so stored samples can be re-encoded."""
    row = np.asarray(row, dtype=np.float32).reshape(-1)
    hands = []
    for slot, label in enumerate(SLOTS):
        block = row[slot * PER_HAND:(slot + 1) * PER_HAND]
        if not np.any(block):
            continue
        points = block.reshape(POINTS, COORDS)
        hands.append(Hand(label=label, score=1.0,
                          landmarks=[tuple(float(v) for v in p) for p in points]))
    return TrackedFrame(hands=hands)


def encode_samples(raw_samples):
    """Wire samples -> (landmark_matrix, feature_matrix).

    Samples with no detectable hand are dropped rather than stored as noise.
    Raises LandmarkError if nothing usable survives.
    """
    if not isinstance(raw_samples, (list, tuple)) or not raw_samples:
        raise LandmarkError("No samples were sent.")

    landmark_rows, feature_rows = [], []
    for raw in raw_samples:
        # Accept either {"hands": [...]} or a bare list of hands.
        hands = raw.get("hands") if isinstance(raw, dict) else raw
        frame = to_frame(hands)
        if not frame.hands:
            continue
        vector = F.encode(frame)
        if vector is None:
            continue
        landmark_rows.append(pack_landmarks(frame))
        feature_rows.append(vector)

    if not landmark_rows:
        raise LandmarkError("None of those samples contained a detectable hand.")

    return (np.asarray(landmark_rows, dtype=np.float32),
            np.asarray(feature_rows, dtype=np.float32))


def re_encode(landmark_blob: bytes, count: int) -> np.ndarray:
    """Rebuild feature vectors from stored landmarks after a layout change."""
    matrix = np.frombuffer(landmark_blob, dtype="<f4").reshape(count, LANDMARK_SIZE)
    rows = []
    for row in matrix:
        vector = F.encode(unpack_landmarks(row))
        if vector is not None:
            rows.append(vector)
    return (np.asarray(rows, dtype=np.float32) if rows
            else np.zeros((0, F.VECTOR_SIZE), dtype=np.float32))


def to_blob(matrix) -> bytes:
    """float32 little-endian, row-major - the format schema.sql expects."""
    return np.ascontiguousarray(matrix, dtype="<f4").tobytes()


def from_blob(blob: bytes, count: int, width: int) -> np.ndarray:
    return np.frombuffer(blob, dtype="<f4").reshape(count, width)
