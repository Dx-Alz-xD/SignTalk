"""Turn a tracked frame into a fixed-length feature vector.

Per hand (94 floats):
    [0:63]   21 landmarks x (x, y, z), wrist-centred, scaled by palm length,
             and rotated so the palm axis lies along +x
    [63:65]  cos/sin of the rotation that was removed
    [65:93]  28 pairwise distances between 8 key points, over palm length
    [93]     hand present (1.0 / 0.0)

Then 2 more floats for the offset between the two hand centres, over palm
length. Total 190.

Why it's shaped this way:

*Rotation is removed from the coordinates but kept as an explicit feature.*
Removing it makes the shape robust to how far you tilt your wrist, which is
the single biggest source of jitter when the same gesture is held twice. But
some signs differ *only* by orientation - ASL 'p' is 'k' rotated down - so
throwing rotation away entirely would make them inseparable. Keeping it as its
own two floats lets the classifier use it without letting a small tilt corrupt
the whole vector.

*Scaling is by palm length* (wrist to middle-finger knuckle) rather than the
largest landmark distance, because the palm is rigid: extending a finger
changes the max distance and would rescale everything else with it.

*The pairwise distances are redundant on purpose.* They're invariant to both
rotation and scale, and fingertip-to-fingertip distance is exactly what
separates most handshapes, so stating it directly gives the classifier a
strong, low-noise signal instead of making it infer it from coordinates.
"""

from __future__ import annotations

import itertools

import numpy as np

# Bump when the layout changes - stored samples of another version are unusable.
FEATURE_VERSION = 2

WRIST = 0
MIDDLE_MCP = 9

# Points whose mutual distances describe a handshape well.
KEY_POINTS = (0, 4, 8, 12, 16, 20, 5, 17)
KEY_PAIRS = tuple(itertools.combinations(range(len(KEY_POINTS)), 2))  # 28

COORDS = 63
ORIENT = 2
PAIRS = len(KEY_PAIRS)
PER_HAND = COORDS + ORIENT + PAIRS + 1        # 94
VECTOR_SIZE = PER_HAND * 2 + 2                # 190

LEFT_SLOT = 0
RIGHT_SLOT = 1

PRESENCE_INDEX = (LEFT_SLOT * PER_HAND + PER_HAND - 1,
                  RIGHT_SLOT * PER_HAND + PER_HAND - 1)


# MediaPipe's z is a rough relative depth and is by far the noisiest channel:
# dividing it by the palm length amplifies the jitter, and left at full weight
# it alone accounts for most of the frame-to-frame movement of a hand that is
# actually being held still. Halving it measured best on a 70/30 split of the
# ASL dataset (96.4% vs 96.0% at full weight) while cutting the distance that
# pure depth noise contributes from 1.21 to 0.60.
Z_WEIGHT = 0.5


def _build_weights() -> np.ndarray:
    """Per-dimension weights used by every distance computation."""
    w = np.ones(VECTOR_SIZE, dtype=np.float32)
    for slot in (LEFT_SLOT, RIGHT_SLOT):
        base = slot * PER_HAND
        w[base:base + COORDS] = 1.0                       # shape
        w[base + 2:base + COORDS:3] = Z_WEIGHT            # ...but damp z
        w[base + COORDS:base + COORDS + ORIENT] = 2.0     # orientation
        w[base + COORDS + ORIENT:base + PER_HAND - 1] = 2.0   # pairwise dists
        w[base + PER_HAND - 1] = 8.0                      # presence flag
    w[-2:] = 1.0                                          # inter-hand offset
    return w


WEIGHTS = _build_weights()


def _encode_hand(landmarks):
    """Returns (94-float block, centre in image coords, palm length)."""
    pts = np.asarray(landmarks, dtype=np.float32)          # (21, 3)
    centre = pts[:, :2].mean(axis=0).copy()

    local = pts - pts[WRIST]
    axis = local[MIDDLE_MCP, :2]
    palm = float(np.linalg.norm(axis))
    if palm < 1e-6:
        palm = 1e-6
    local /= palm

    # Rotate so the palm axis lies along +x, and remember the angle we removed.
    axis = local[MIDDLE_MCP, :2]
    norm = float(np.linalg.norm(axis))
    if norm < 1e-6:
        cos_t, sin_t = 1.0, 0.0
    else:
        cos_t, sin_t = float(axis[0] / norm), float(axis[1] / norm)
    rot = np.array([[cos_t, sin_t], [-sin_t, cos_t]], dtype=np.float32)
    local[:, :2] = local[:, :2] @ rot.T

    key = local[list(KEY_POINTS)]
    dists = np.array([np.linalg.norm(key[i] - key[j]) for i, j in KEY_PAIRS],
                     dtype=np.float32)

    block = np.empty(PER_HAND, dtype=np.float32)
    block[:COORDS] = local.reshape(-1)
    block[COORDS] = cos_t
    block[COORDS + 1] = sin_t
    block[COORDS + ORIENT:PER_HAND - 1] = dists
    block[PER_HAND - 1] = 1.0
    return block, centre, palm


def encode(frame) -> np.ndarray | None:
    """Encode a `TrackedFrame`. Returns None when no hand is visible."""
    if frame is None or not frame.hands:
        return None

    vec = np.zeros(VECTOR_SIZE, dtype=np.float32)
    centres, palms = {}, {}

    # MediaPipe occasionally labels both hands the same; keep the more
    # confident one in its slot and put the other in the free slot.
    used = set()
    for hand in sorted(frame.hands, key=lambda h: -h.score):
        slot = LEFT_SLOT if hand.label == "Left" else RIGHT_SLOT
        if slot in used:
            slot = RIGHT_SLOT if slot == LEFT_SLOT else LEFT_SLOT
            if slot in used:
                continue
        used.add(slot)

        block, centre, palm = _encode_hand(hand.landmarks)
        base = slot * PER_HAND
        vec[base:base + PER_HAND] = block
        centres[slot] = centre
        palms[slot] = palm

    if LEFT_SLOT in centres and RIGHT_SLOT in centres:
        scale = (palms[LEFT_SLOT] + palms[RIGHT_SLOT]) / 2.0 or 1e-6
        vec[-2:] = (centres[RIGHT_SLOT] - centres[LEFT_SLOT]) / scale

    return vec


def distance(a: np.ndarray, b: np.ndarray) -> float:
    """Weighted Euclidean distance between two feature vectors."""
    return float(np.linalg.norm((np.asarray(a) - np.asarray(b)) * WEIGHTS))


def similarity(a: np.ndarray, b: np.ndarray) -> float:
    """Distance mapped into a 0..1 score (1.0 == identical)."""
    return 1.0 / (1.0 + distance(a, b))


def hand_count(vector) -> int:
    """How many hands a stored vector was encoded from."""
    if vector is None:
        return 0
    return int(sum(1 for i in PRESENCE_INDEX if vector[i] > 0.5))
