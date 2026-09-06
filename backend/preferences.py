"""Per-account settings.

One row per user in `user_preferences`, created on first read. Everything here
is a preference the app actually acts on: which camera to open, whether the
preview is mirrored, how sure the recogniser has to be, where the video
overlay starts. Nothing is stored that nothing reads.

The wire shape is camelCase to match the rest of the API; the column names
stay snake_case, and this module is the only place the two meet.
"""

from __future__ import annotations

from . import db
from .errors import Invalid

THEMES = ("light", "dark", "system")
PACES = ("careful", "speed")

# Every setting, with its column, default, and how to clean a value coming in
# from a client. Adding one here is all it takes for the API to accept it -
# the column has to exist in both schema files and in db.COLUMN_MIGRATIONS.
DEFAULTS: dict = {
    "theme": "system",
    "camera_device_id": "",
    "mirror_preview": True,
    "show_skeleton": True,
    "min_confidence": 0.55,
    "pace": "careful",
    "capture_countdown": 3,
    "reduce_motion": False,
    "overlay_x": 0.68,
    "overlay_y": 0.06,
    "overlay_width": 0.26,
    "overlay_opacity": 0.95,
    "overlay_caption": True,
}

MIN_CONFIDENCE_RANGE = (0.30, 0.90)
COUNTDOWN_RANGE = (0, 10)


def _clean(column: str, value):
    """Validate one setting. Raises ValueError with a message a person can read."""
    if column == "theme":
        theme = str(value or "system").strip().lower()
        if theme not in THEMES:
            raise Invalid(f"Theme must be one of: {', '.join(THEMES)}.")
        return theme

    if column == "pace":
        pace = str(value or "careful").strip().lower()
        if pace not in PACES:
            raise Invalid(f"Recognition pace must be one of: {', '.join(PACES)}.")
        return pace

    if column == "camera_device_id":
        device = str(value or "").strip()
        if len(device) > 200:
            raise Invalid("That camera id is too long.")
        return device

    if column in ("mirror_preview", "show_skeleton", "reduce_motion", "overlay_caption"):
        return bool(value)

    if column == "min_confidence":
        confidence = _number(value, "Minimum confidence")
        low, high = MIN_CONFIDENCE_RANGE
        if not low <= confidence <= high:
            raise Invalid(f"Minimum confidence must be between {low} and {high}.")
        return round(confidence, 3)

    if column == "capture_countdown":
        try:
            seconds = int(value)
        except (TypeError, ValueError):
            raise Invalid("The countdown must be a whole number of seconds.") from None
        low, high = COUNTDOWN_RANGE
        if not low <= seconds <= high:
            raise Invalid(f"The countdown must be between {low} and {high} seconds.")
        return seconds

    if column.startswith("overlay_"):
        # Fractions of the video's own box, so the overlay keeps its place at
        # any size. Opacity has a floor: an invisible overlay reads as a bug.
        value = _number(value, "That overlay setting")
        if column == "overlay_opacity":
            return round(min(1.0, max(0.3, value)), 3)
        if column == "overlay_width":
            return round(min(0.6, max(0.1, value)), 4)
        return round(min(1.0, max(0.0, value)), 4)

    raise Invalid(f"Unknown setting: {column}")


def _number(value, what: str) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        raise Invalid(f"{what} must be a number.") from None


def _row_to_payload(row) -> dict:
    """Database row -> the JSON the frontend uses."""
    get = (lambda key: row[key] if row is not None and row.get(key) is not None
           else DEFAULTS[key])
    return {
        "theme": get("theme"),
        "cameraDeviceId": get("camera_device_id"),
        "mirrorPreview": bool(get("mirror_preview")),
        "showSkeleton": bool(get("show_skeleton")),
        "minConfidence": float(get("min_confidence")),
        "pace": get("pace"),
        "captureCountdown": int(get("capture_countdown")),
        "reduceMotion": bool(get("reduce_motion")),
        "overlay": {
            "x": float(get("overlay_x")),
            "y": float(get("overlay_y")),
            "width": float(get("overlay_width")),
            "opacity": float(get("overlay_opacity")),
            "caption": bool(get("overlay_caption")),
        },
    }


# camelCase field -> column. Nested overlay fields are flattened.
FIELDS = {
    "theme": "theme",
    "cameraDeviceId": "camera_device_id",
    "mirrorPreview": "mirror_preview",
    "showSkeleton": "show_skeleton",
    "minConfidence": "min_confidence",
    "pace": "pace",
    "captureCountdown": "capture_countdown",
    "reduceMotion": "reduce_motion",
}

OVERLAY_FIELDS = {
    "x": "overlay_x",
    "y": "overlay_y",
    "width": "overlay_width",
    "opacity": "overlay_opacity",
    "caption": "overlay_caption",
}


def get(user_id) -> dict:
    """This account's settings, defaults where it has never set one."""
    row = db.fetch_one("SELECT * FROM user_preferences WHERE user_id = %s", (user_id,))
    return _row_to_payload(row)


def update(user_id, changes: dict) -> dict:
    """Apply the settings present in `changes`; leave the rest alone."""
    columns: dict = {}
    for field, column in FIELDS.items():
        if field in changes and changes[field] is not None:
            columns[column] = _clean(column, changes[field])

    overlay = changes.get("overlay") or {}
    for field, column in OVERLAY_FIELDS.items():
        if field in overlay and overlay[field] is not None:
            columns[column] = _clean(column, overlay[field])

    if not columns:
        return get(user_id)

    # One upsert: the row may not exist yet, and two clients saving at once
    # must not race a read-then-write.
    names = ", ".join(columns)
    placeholders = ", ".join(["%s"] * len(columns))
    assignments = ", ".join(f"{name} = EXCLUDED.{name}" for name in columns)
    db.execute(
        f"""
        INSERT INTO user_preferences (user_id, {names})
        VALUES (%s, {placeholders})
        ON CONFLICT (user_id) DO UPDATE
           SET {assignments}, updated_at = now()
        """,
        (user_id, *columns.values()),
    )
    return get(user_id)


def reset(user_id) -> dict:
    """Back to the defaults for everything."""
    db.execute("DELETE FROM user_preferences WHERE user_id = %s", (user_id,))
    return get(user_id)
