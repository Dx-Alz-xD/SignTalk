"""The sign library, backed by SQL (PostgreSQL or SQLite - see db.py).

Same tree the detector keeps in library.json - languages -> signs -> symbols
-> views -> samples - except every query is scoped by owner. That scoping is
the whole security story for this module: a valid session proves who you are,
not what you may open, so nothing here takes an id without also checking it
belongs to the caller.
"""

from __future__ import annotations

import json
import re

import numpy as np

from . import db, landmarks
from .errors import Invalid
from detector import features as F
from detector.classifier import KNNClassifier

DEFAULT_VIEW = "front"
STANDARD_VIEWS = ("front", "left", "right", "top", "bottom")

HAND_CONTROLS = ("left", "right", "both")
DEFAULT_HAND_CONTROL = "both"

# Matches DEFAULT_SAMPLES in detector/trainer.py. The bounds are the ones
# schema.sql enforces; checking here just gives a better message.
DEFAULT_SAMPLE_TARGET = 40
MIN_SAMPLE_TARGET = 5
MAX_SAMPLE_TARGET = 500

OUTPUT_KINDS = ("text", "space", "key", "combo")

# Milliseconds each picture stays up in sign-to-sign playback.
DEFAULT_GESTURE_INTERVAL_MS = 1200
MIN_GESTURE_INTERVAL_MS = 200
MAX_GESTURE_INTERVAL_MS = 10000

# The spoken language a sign language spells out, as a BCP-47 code.
DEFAULT_SPOKEN_LANGUAGE = "en"

IMAGE_MIMES = ("image/jpeg", "image/png", "image/webp")
MAX_IMAGE_BYTES = 400_000


class NotFound(Exception):
    """No such row, or it is not the caller's to touch. Same answer either way,
    so the API cannot be used to probe for other people's ids."""


class Conflict(Exception):
    """A name that has to be unique already exists."""


# --------------------------------------------------------------- languages --

def list_languages(user_id) -> list:
    return db.fetch_all(
        """
        SELECT l.id, l.name, l.description, l.source, l.visibility,
               l.hand_control, l.sample_target, l.published_at,
               l.gesture_translation, l.gesture_interval_ms, l.spoken_language, l.tag,
               l.created_at, l.updated_at,
               (SELECT count(*) FROM signs s WHERE s.language_id = l.id) AS sign_count,
               (SELECT count(*) FROM symbols y
                  JOIN signs s2 ON s2.id = y.sign_id
                 WHERE s2.language_id = l.id) AS symbol_count,
               COALESCE((SELECT sum(v.sample_count) FROM symbol_views v
                  JOIN symbols y2 ON y2.id = v.symbol_id
                  JOIN signs s3 ON s3.id = y2.sign_id
                 WHERE s3.language_id = l.id), 0) AS sample_count
          FROM languages l
         WHERE l.owner_id = %s
         ORDER BY l.updated_at DESC
        """,
        (user_id,),
    )


def get_language(user_id, language_id) -> dict:
    row = db.fetch_one(
        "SELECT * FROM languages WHERE id = %s AND owner_id = %s",
        (language_id, user_id),
    )
    if row is None:
        raise NotFound("No such language.")
    return row


def _clean_hand_control(value) -> str:
    control = (value or DEFAULT_HAND_CONTROL).strip().lower()
    if control not in HAND_CONTROLS:
        raise Invalid("Hand control must be 'left', 'right' or 'both'.")
    return control


def _clean_sample_target(value) -> int:
    if value is None:
        return DEFAULT_SAMPLE_TARGET
    try:
        target = int(value)
    except (TypeError, ValueError):
        raise Invalid("Sample size must be a whole number.") from None
    if not MIN_SAMPLE_TARGET <= target <= MAX_SAMPLE_TARGET:
        raise Invalid(
            f"Sample size must be between {MIN_SAMPLE_TARGET} and {MAX_SAMPLE_TARGET}."
        )
    return target


def create_language(user_id, name: str, description: str = "",
                    source: str = "user", hand_control: str = DEFAULT_HAND_CONTROL,
                    sample_target: int = DEFAULT_SAMPLE_TARGET) -> dict:
    name = (name or "").strip()
    if not name:
        raise Invalid("A language needs a name.")
    if len(name) > 80:
        raise Invalid("That name is too long (80 characters max).")

    existing = db.fetch_one(
        "SELECT id FROM languages WHERE owner_id = %s AND lower(name) = lower(%s)",
        (user_id, name),
    )
    if existing is not None:
        raise Conflict(f"You already have a language called '{name}'.")

    return db.fetch_one(
        """
        INSERT INTO languages (owner_id, name, description, source,
                               hand_control, sample_target)
        VALUES (%s, %s, NULLIF(%s, ''), %s, %s, %s)
        RETURNING *
        """,
        (user_id, name, (description or "").strip(), source,
         _clean_hand_control(hand_control), _clean_sample_target(sample_target)),
    )


def _clean_tag(value) -> str:
    tag = " ".join((value or "").split())
    if len(tag) > 60:
        raise Invalid("The tag is too long (60 characters max).")
    return tag


def _clean_spoken_language(value) -> str:
    code = (value or DEFAULT_SPOKEN_LANGUAGE).strip().lower().replace("_", "-")
    if not re.fullmatch(r"[a-z]{2,3}(-[a-z0-9]{2,8})?", code):
        raise Invalid("Spoken language must be a language code such as en, hi or pt-br.")
    return code


def _clean_gesture_interval(value) -> int:
    if value is None:
        return DEFAULT_GESTURE_INTERVAL_MS
    try:
        interval = int(value)
    except (TypeError, ValueError):
        raise Invalid("Gesture interval must be a whole number of milliseconds.") from None
    if not MIN_GESTURE_INTERVAL_MS <= interval <= MAX_GESTURE_INTERVAL_MS:
        raise Invalid(
            f"Gesture interval must be between {MIN_GESTURE_INTERVAL_MS} and "
            f"{MAX_GESTURE_INTERVAL_MS} ms."
        )
    return interval


def update_language(user_id, language_id, *, name=None, description=None,
                    hand_control=None, sample_target=None,
                    gesture_translation=None, gesture_interval_ms=None,
                    spoken_language=None, tag=None) -> dict:
    """Edit a language in place. Only the fields passed are touched."""
    current = get_language(user_id, language_id)

    if name is not None:
        name = name.strip()
        if not name:
            raise Invalid("A language needs a name.")
        if len(name) > 80:
            raise Invalid("That name is too long (80 characters max).")
        clash = db.fetch_one(
            """
            SELECT id FROM languages
             WHERE owner_id = %s AND lower(name) = lower(%s) AND id <> %s
            """,
            (user_id, name, language_id),
        )
        if clash is not None:
            raise Conflict(f"You already have a language called '{name}'.")
    else:
        name = current["name"]

    return db.fetch_one(
        """
        UPDATE languages
           SET name = %s,
               description = COALESCE(NULLIF(%s, ''), description),
               hand_control = %s,
               sample_target = %s,
               gesture_translation = %s,
               gesture_interval_ms = %s,
               spoken_language = %s,
               tag = %s
         WHERE id = %s AND owner_id = %s
        RETURNING *
        """,
        (name,
         (description or "").strip() if description is not None else "",
         _clean_hand_control(hand_control if hand_control is not None
                             else current["hand_control"]),
         _clean_sample_target(sample_target if sample_target is not None
                              else current["sample_target"]),
         bool(gesture_translation if gesture_translation is not None
              else current["gesture_translation"]),
         _clean_gesture_interval(gesture_interval_ms if gesture_interval_ms is not None
                                 else current["gesture_interval_ms"]),
         _clean_spoken_language(spoken_language if spoken_language is not None
                                else current.get("spoken_language")),
         _clean_tag(tag if tag is not None else current.get("tag")),
         language_id, user_id),
    )


def find_or_create_language(user_id, name: str) -> dict:
    row = db.fetch_one(
        "SELECT * FROM languages WHERE owner_id = %s AND lower(name) = lower(%s)",
        (user_id, (name or "").strip()),
    )
    return row if row is not None else create_language(user_id, name)


def delete_language(user_id, language_id) -> None:
    if db.execute("DELETE FROM languages WHERE id = %s AND owner_id = %s",
                  (language_id, user_id)) == 0:
        raise NotFound("No such language.")


# ------------------------------------------------------------------- signs --

def list_signs(user_id, language_id) -> list:
    get_language(user_id, language_id)          # ownership check
    return db.fetch_all(
        """
        SELECT s.id, s.name, s.has_phrases, s.phrases, s.created_at, s.updated_at,
               (SELECT count(*) FROM symbols y WHERE y.sign_id = s.id) AS symbol_count
          FROM signs s
         WHERE s.language_id = %s
         ORDER BY s.created_at
        """,
        (language_id,),
    )


def create_sign(user_id, language_id, name: str, has_phrases: bool,
                phrases=None) -> dict:
    get_language(user_id, language_id)
    name = (name or "").strip()
    if not name:
        raise Invalid("A sign needs a name.")

    phrases = [p.strip() for p in (phrases or []) if p and p.strip()]
    # schema.sql enforces this too; catching it here gives a better message.
    if not has_phrases:
        phrases = []

    if db.fetch_one(
        "SELECT id FROM signs WHERE language_id = %s AND lower(name) = lower(%s)",
        (language_id, name),
    ) is not None:
        raise Conflict(f"'{name}' already exists in this language.")

    return db.fetch_one(
        """
        INSERT INTO signs (language_id, name, has_phrases, phrases)
        VALUES (%s, %s, %s, %s)
        RETURNING *
        """,
        (language_id, name, bool(has_phrases), phrases),
    )


def get_sign(user_id, sign_id) -> dict:
    row = db.fetch_one(
        """
        SELECT s.* FROM signs s
          JOIN languages l ON l.id = s.language_id
         WHERE s.id = %s AND l.owner_id = %s
        """,
        (sign_id, user_id),
    )
    if row is None:
        raise NotFound("No such sign.")
    return row


def delete_sign(user_id, sign_id) -> dict:
    """Delete a sign (a vocabulary). When it was the language's last one, the
    now-empty language goes too, so no hollow row lingers in every list.
    Returns {"languageDeleted": bool, "languageId": id}."""
    sign = get_sign(user_id, sign_id)
    db.execute("DELETE FROM signs WHERE id = %s", (sign_id,))
    remaining = db.fetch_one("SELECT count(*) AS n FROM signs WHERE language_id = %s",
                             (sign["language_id"],))
    if remaining and int(remaining["n"]) == 0:
        delete_language(user_id, sign["language_id"])
        return {"languageDeleted": True, "languageId": sign["language_id"]}
    return {"languageDeleted": False, "languageId": sign["language_id"]}


# ----------------------------------------------------------------- symbols --

def list_symbols(user_id, sign_id) -> list:
    get_sign(user_id, sign_id)
    rows = db.fetch_all(
        """
        SELECT y.id, y.name, y.output_kind, y.output_value,
               y.created_at, y.updated_at,
               EXISTS (SELECT 1 FROM symbol_images i WHERE i.symbol_id = y.id) AS has_image,
               {views} AS views,
               COALESCE(sum(v.sample_count), 0) AS sample_count
          FROM symbols y
          LEFT JOIN symbol_views v ON v.symbol_id = y.id
         WHERE y.sign_id = %s
         GROUP BY y.id
         ORDER BY y.created_at
        """.replace("{views}", db.dialect.views_json),
        (sign_id,),
    )
    for row in rows:
        # SQLite hands the aggregate back as JSON text; Postgres as a list.
        if isinstance(row["views"], str):
            row["views"] = json.loads(row["views"])
        row["has_image"] = bool(row["has_image"])
    return rows


def get_symbol(user_id, symbol_id) -> dict:
    row = db.fetch_one(
        """
        SELECT y.*, s.name AS sign_name, s.language_id, l.name AS language_name
          FROM symbols y
          JOIN signs s ON s.id = y.sign_id
          JOIN languages l ON l.id = s.language_id
         WHERE y.id = %s AND l.owner_id = %s
        """,
        (symbol_id, user_id),
    )
    if row is None:
        raise NotFound("No such symbol.")
    return row


def create_symbol(user_id, sign_id, name: str) -> dict:
    get_sign(user_id, sign_id)
    name = (name or "").strip()
    if not name:
        raise Invalid("A symbol needs a name.")

    existing = db.fetch_one(
        "SELECT * FROM symbols WHERE sign_id = %s AND lower(name) = lower(%s)",
        (sign_id, name),
    )
    if existing is not None:
        return existing          # idempotent: adding the same symbol twice is fine

    return db.fetch_one(
        "INSERT INTO symbols (sign_id, name) VALUES (%s, %s) RETURNING *",
        (sign_id, name),
    )


def update_symbol(user_id, symbol_id, *, name=None, output_kind=None,
                  output_value=None) -> dict:
    """Rename a symbol, or change what recognising it emits."""
    current = get_symbol(user_id, symbol_id)

    if name is not None:
        name = name.strip()
        if not name:
            raise Invalid("A symbol needs a name.")
        clash = db.fetch_one(
            """
            SELECT id FROM symbols
             WHERE sign_id = %s AND lower(name) = lower(%s) AND id <> %s
            """,
            (current["sign_id"], name, symbol_id),
        )
        if clash is not None:
            raise Conflict(f"'{name}' already exists in this vocabulary.")
    else:
        name = current["name"]

    kind = (output_kind if output_kind is not None else current["output_kind"]).strip().lower()
    if kind not in OUTPUT_KINDS:
        raise Invalid(f"Output kind must be one of: {', '.join(OUTPUT_KINDS)}.")

    value = (output_value if output_value is not None else current["output_value"]) or ""
    value = value.strip() if kind != "text" else value
    # 'space' emits a space and nothing else, so it carries no value of its own.
    if kind == "space":
        value = ""
    if kind in ("key", "combo") and not value:
        raise Invalid(f"A '{kind}' output needs to say which key it sends.")

    return db.fetch_one(
        """
        UPDATE symbols SET name = %s, output_kind = %s, output_value = %s
         WHERE id = %s
        RETURNING *
        """,
        (name, kind, value, symbol_id),
    )


def delete_symbol(user_id, symbol_id) -> None:
    get_symbol(user_id, symbol_id)
    db.execute("DELETE FROM symbols WHERE id = %s", (symbol_id,))


# ----------------------------------------------------------------- sharing --

def publish_language(user_id, language_id, public: bool = True) -> dict:
    """Put a language in the community database, or take it back out.

    Publishing runs the security review first and is refused while anything
    blocking is found - a language other people will install must not carry
    keystrokes that could hurt them or text that is not text. An untrained
    language may be published (it shows its sample count on the shelf and
    fills in as its owner trains it), so sharing can be switched on the moment
    a language is created.
    """
    get_language(user_id, language_id)

    if public:
        review = review_language(user_id, language_id)
        if not review["ok"]:
            raise Invalid(
                "This language cannot be published yet: "
                + " ".join(issue["message"] for issue in review["issues"]
                           if issue["level"] == "block")
            )

    return db.fetch_one(
        """
        UPDATE languages
           SET visibility = %s,
               -- The schema requires a timestamp on anything not private, and
               -- keeping the original one means re-publishing does not look
               -- like a brand new upload.
               published_at = CASE WHEN %s THEN COALESCE(published_at, now()) ELSE NULL END
         WHERE id = %s AND owner_id = %s
        RETURNING *
        """,
        ("public" if public else "private", public, language_id, user_id),
    )


def list_published(user_id=None, query: str = "") -> list:
    """Everything in the community database, newest first.

    `installed` and `mine` are computed for the caller so the browse table can
    show what they already have without a second round trip.
    """
    search = (query or "").strip()
    term = f"%{search}%"
    rows = db.fetch_all(
        """
        SELECT l.id, l.name, l.description, l.hand_control, l.published_at,
               l.gesture_translation, l.source, l.spoken_language, l.tag,
               u.username AS author,
               (l.owner_id = %s) AS mine,
               EXISTS (SELECT 1 FROM language_installs i
                        WHERE i.language_id = l.id AND i.user_id = %s) AS installed,
               (SELECT count(*) FROM signs s WHERE s.language_id = l.id) AS sign_count,
               (SELECT count(*) FROM symbols y
                  JOIN signs s2 ON s2.id = y.sign_id
                 WHERE s2.language_id = l.id) AS symbol_count,
               COALESCE((SELECT sum(v.sample_count) FROM symbol_views v
                  JOIN symbols y2 ON y2.id = v.symbol_id
                  JOIN signs s3 ON s3.id = y2.sign_id
                 WHERE s3.language_id = l.id), 0) AS sample_count,
               (SELECT count(*) FROM language_installs i2
                 WHERE i2.language_id = l.id) AS install_count
          FROM languages l
          LEFT JOIN users u ON u.id = l.owner_id
         WHERE l.visibility = 'public'
           AND (%s = '' OR l.name {like} %s OR COALESCE(u.username, '') {like} %s)
         ORDER BY l.published_at DESC
        """.replace("{like}", db.dialect.ilike),
        (user_id, user_id, search, term, term),
    )
    for row in rows:
        row["mine"] = bool(row["mine"])
        row["installed"] = bool(row["installed"])
        row["gesture_translation"] = bool(row["gesture_translation"])
    return rows


def install_language(user_id, language_id) -> dict:
    """Copy a published language into the caller's own library.

    A full copy, samples and all - the point of the community database is that
    what you download actually recognises the signs. The copy is independent
    afterwards: the publisher editing theirs does not reach into yours.
    """
    source = db.fetch_one(
        "SELECT * FROM languages WHERE id = %s AND visibility = 'public'",
        (language_id,),
    )
    if source is None:
        raise NotFound("That language is not published.")
    if source["owner_id"] == user_id:
        raise Conflict("That language is already yours.")

    # Names are unique per owner, so a second copy needs a distinct one.
    name = source["name"]
    if db.fetch_one(
        "SELECT id FROM languages WHERE owner_id = %s AND lower(name) = lower(%s)",
        (user_id, name),
    ) is not None:
        for suffix in range(2, 100):
            candidate = f"{name} ({suffix})"
            if db.fetch_one(
                "SELECT id FROM languages WHERE owner_id = %s AND lower(name) = lower(%s)",
                (user_id, candidate),
            ) is None:
                name = candidate
                break

    with db.transaction() as tx:
        copy = tx.fetch_one(
            """
            INSERT INTO languages (owner_id, name, description, source,
                                   hand_control, sample_target, forked_from_id,
                                   gesture_translation, gesture_interval_ms,
                                   spoken_language, tag)
            VALUES (%s, %s, %s, 'imported', %s, %s, %s, %s, %s, %s, %s)
            RETURNING *
            """,
            (user_id, name, source["description"], source["hand_control"],
             source["sample_target"], source["id"],
             bool(source["gesture_translation"]), source["gesture_interval_ms"],
             source.get("spoken_language") or DEFAULT_SPOKEN_LANGUAGE,
             source.get("tag") or ""),
        )
        with_images = bool(source["gesture_translation"])

        # Walk the tree level by level, carrying the old->new id mapping down.
        # Plain statements rather than a Postgres-only INSERT ... CTE, so the
        # same code runs on SQLite; a language is small enough that the extra
        # round trips do not matter.
        for sign in tx.fetch_all(
            "SELECT * FROM signs WHERE language_id = %s ORDER BY created_at",
            (source["id"],),
        ):
            new_sign = tx.fetch_one(
                """
                INSERT INTO signs (language_id, name, has_phrases, phrases)
                VALUES (%s, %s, %s, %s)
                RETURNING id
                """,
                (copy["id"], sign["name"], bool(sign["has_phrases"]),
                 list(sign["phrases"] or [])),
            )
            for symbol in tx.fetch_all(
                "SELECT * FROM symbols WHERE sign_id = %s ORDER BY created_at",
                (sign["id"],),
            ):
                new_symbol = tx.fetch_one(
                    """
                    INSERT INTO symbols (sign_id, name, output_kind, output_value)
                    VALUES (%s, %s, %s, %s)
                    RETURNING id
                    """,
                    (new_sign["id"], symbol["name"], symbol["output_kind"],
                     symbol["output_value"]),
                )
                tx.execute(
                    """
                    INSERT INTO symbol_views (symbol_id, view, sample_count, landmarks,
                                              features, feature_version, quality_spread)
                    SELECT %s, view, sample_count, landmarks,
                           features, feature_version, quality_spread
                      FROM symbol_views WHERE symbol_id = %s
                    """,
                    (new_symbol["id"], symbol["id"]),
                )
                # The reference pictures travel only when the publisher opted
                # into gesture translation - that is what the flag means.
                if with_images:
                    tx.execute(
                        """
                        INSERT INTO symbol_images (symbol_id, mime, image, width, height)
                        SELECT %s, mime, image, width, height
                          FROM symbol_images WHERE symbol_id = %s
                        """,
                        (new_symbol["id"], symbol["id"]),
                    )

        tx.execute(
            """
            INSERT INTO language_installs (user_id, language_id)
            VALUES (%s, %s) ON CONFLICT DO NOTHING
            """,
            (user_id, source["id"]),
        )

    return dict(copy)


# ------------------------------------------------------------------- views --

def store_samples(user_id, symbol_id, view: str, raw_samples,
                  replace: bool = False) -> dict:
    """Encode captured samples and file them under one view of a symbol."""
    get_symbol(user_id, symbol_id)
    view = (view or DEFAULT_VIEW).strip().lower() or DEFAULT_VIEW

    landmark_matrix, feature_matrix = landmarks.encode_samples(raw_samples)

    if not replace:
        existing = db.fetch_one(
            """
            SELECT sample_count, landmarks, features, feature_version
              FROM symbol_views WHERE symbol_id = %s AND lower(view) = %s
            """,
            (symbol_id, view),
        )
        # Only append to a cache built by the current encoder; otherwise the
        # old rows are the wrong width and the blob would be nonsense.
        if existing and existing["feature_version"] == F.FEATURE_VERSION:
            old_landmarks = landmarks.from_blob(
                existing["landmarks"], existing["sample_count"], landmarks.LANDMARK_SIZE)
            old_features = landmarks.from_blob(
                existing["features"], existing["sample_count"], F.VECTOR_SIZE)
            landmark_matrix = np.vstack([old_landmarks, landmark_matrix])
            feature_matrix = np.vstack([old_features, feature_matrix])

    count = int(landmark_matrix.shape[0])
    spread = _spread(feature_matrix)

    row = db.fetch_one(
        """
        INSERT INTO symbol_views
            (symbol_id, view, sample_count, landmarks, features,
             feature_version, quality_spread)
        VALUES (%s, %s, %s, %s, %s, %s, %s)
        ON CONFLICT (symbol_id, lower(view)) DO UPDATE
            SET sample_count    = EXCLUDED.sample_count,
                landmarks       = EXCLUDED.landmarks,
                features        = EXCLUDED.features,
                feature_version = EXCLUDED.feature_version,
                quality_spread  = EXCLUDED.quality_spread,
                updated_at      = now()
        RETURNING id, view, sample_count, quality_spread
        """,
        (symbol_id, view, count, landmarks.to_blob(landmark_matrix),
         landmarks.to_blob(feature_matrix), F.FEATURE_VERSION, spread),
    )
    return dict(row) | {"quality": describe_quality(spread)}


def delete_view(user_id, symbol_id, view: str) -> None:
    get_symbol(user_id, symbol_id)
    if db.execute(
        "DELETE FROM symbol_views WHERE symbol_id = %s AND lower(view) = lower(%s)",
        (symbol_id, view),
    ) == 0:
        raise NotFound("No such view.")


def _spread(feature_matrix) -> float:
    """Mean distance from the centroid - how consistent the hold was.
    Mirrors detector/trainer.py so desktop and web report the same number."""
    if len(feature_matrix) < 2:
        return 0.0
    centroid = feature_matrix.mean(axis=0)
    return float(np.mean([F.distance(v, centroid) for v in feature_matrix]))


def describe_quality(spread: float) -> str:
    if spread <= 0:
        return "single sample"
    if spread < 0.35:
        return "very consistent"
    if spread < 0.8:
        return "good"
    return "shaky - consider re-recording with a steadier hold"


# ---------------------------------------------------------------- training --

def training_set(user_id, language_id=None, sign_id=None):
    """(labels, views, matrix, meta, stale) for everything in scope.

    Scope is the whole library, one language, or one sign (a vocabulary) -
    the translator offers all three.
    """
    rows = db.fetch_all(
        """
        SELECT v.sample_count, v.features, v.feature_version, v.view,
               y.name AS symbol, s.name AS sign, l.name AS language,
               s.has_phrases, s.phrases
          FROM symbol_views v
          JOIN symbols y   ON y.id = v.symbol_id
          JOIN signs s     ON s.id = y.sign_id
          JOIN languages l ON l.id = s.language_id
         WHERE l.owner_id = %s
           AND ({uuid} IS NULL OR l.id = {uuid})
           AND ({uuid} IS NULL OR s.id = {uuid})
        """.replace("{uuid}", db.dialect.uuid_param),
        (user_id, language_id, language_id, sign_id, sign_id),
    )

    labels, views, blocks, meta = [], [], [], {}
    stale = 0
    for row in rows:
        if row["feature_version"] != F.FEATURE_VERSION or not row["features"]:
            # Recoverable - the landmarks are still there - but not usable as-is.
            stale += row["sample_count"]
            continue
        matrix = landmarks.from_blob(
            row["features"], row["sample_count"], F.VECTOR_SIZE)
        label = f"{row['sign']} / {row['symbol']}"
        meta[label] = {
            "language": row["language"],
            "sign": row["sign"],
            "symbol": row["symbol"],
            "has_phrases": row["has_phrases"],
            "phrases": row["phrases"] or [],
        }
        labels.extend([label] * row["sample_count"])
        views.extend([row["view"]] * row["sample_count"])
        blocks.append(matrix)

    stacked = (np.vstack(blocks) if blocks
               else np.zeros((0, F.VECTOR_SIZE), dtype=np.float32))
    return labels, views, stacked, meta, stale


def build_classifier(user_id, language_id=None, sign_id=None) -> KNNClassifier:
    labels, views, matrix, meta, stale = training_set(user_id, language_id, sign_id)
    model = KNNClassifier(labels, matrix, meta, views)
    model.stale = stale
    return model


def refresh_stale_features(user_id) -> int:
    """Re-encode any view whose cached vectors predate the current layout.

    This is why the landmarks are the source of truth: a feature change costs
    one pass over the blobs, not a retraining session for every user.
    """
    rows = db.fetch_all(
        """
        SELECT v.id, v.sample_count, v.landmarks
          FROM symbol_views v
          JOIN symbols y   ON y.id = v.symbol_id
          JOIN signs s     ON s.id = y.sign_id
          JOIN languages l ON l.id = s.language_id
         WHERE l.owner_id = %s
           AND (v.feature_version {distinct} %s OR v.features IS NULL)
        """.replace("{distinct}", db.dialect.is_distinct_from),
        (user_id, F.FEATURE_VERSION),
    )

    fixed = 0
    for row in rows:
        matrix = landmarks.re_encode(row["landmarks"], row["sample_count"])
        if matrix.shape[0] != row["sample_count"]:
            continue          # a landmark row that no longer encodes; leave it flagged
        db.execute(
            """
            UPDATE symbol_views
               SET features = %s, feature_version = %s, quality_spread = %s
             WHERE id = %s
            """,
            (landmarks.to_blob(matrix), F.FEATURE_VERSION, _spread(matrix), row["id"]),
        )
        fixed += 1
    return fixed


# ----------------------------------------------------------------- images --
# One reference picture per symbol, for sign-to-sign translation. The only
# place SignTalk keeps pixels, so: opt-in per language, thumbnail-sized, and
# the bytes are checked to actually be an image before they are stored.

_MAGIC = (
    ("image/jpeg", b"\xff\xd8\xff"),
    ("image/png", b"\x89PNG\r\n\x1a\n"),
    ("image/webp", b"RIFF"),
)


def sniff_image(data: bytes) -> str | None:
    for mime, magic in _MAGIC:
        if data.startswith(magic):
            if mime == "image/webp" and data[8:12] != b"WEBP":
                continue
            return mime
    return None


def set_symbol_image(user_id, symbol_id, data: bytes, mime: str | None = None,
                     width=None, height=None) -> dict:
    symbol = get_symbol(user_id, symbol_id)
    language = get_language(user_id, symbol["language_id"])
    if not language["gesture_translation"]:
        raise Invalid("Enable gesture translation on this language before storing pictures.")
    if not data:
        raise Invalid("The picture is empty.")
    if len(data) > MAX_IMAGE_BYTES:
        raise Invalid(f"The picture is too large ({len(data)} bytes; max {MAX_IMAGE_BYTES}).")
    detected = sniff_image(data)
    if detected is None or (mime and mime != detected):
        raise Invalid("That is not a JPEG, PNG or WebP image.")
    row = db.fetch_one(
        """
        INSERT INTO symbol_images (symbol_id, mime, image, width, height)
        VALUES (%s, %s, %s, %s, %s)
        ON CONFLICT (symbol_id) DO UPDATE
            SET mime = EXCLUDED.mime, image = EXCLUDED.image,
                width = EXCLUDED.width, height = EXCLUDED.height,
                updated_at = now()
        RETURNING symbol_id, mime, width, height, updated_at
        """,
        (symbol_id, detected, data, width, height),
    )
    return dict(row)


def get_symbol_image(user_id, symbol_id) -> dict | None:
    """The picture, or None when there is nothing to show at all.

    A stored photo wins. Without one, the symbol's hand skeleton is drawn from
    a stored sample - every trained symbol has landmarks, and a skeleton is
    not a picture of anyone, so it needs no opt-in. That covers symbols
    trained before pictures existed, imported datasets, and installed copies
    whose publisher kept gesture translation off.
    """
    get_symbol(user_id, symbol_id)
    row = db.fetch_one(
        "SELECT mime, image, width, height, updated_at FROM symbol_images WHERE symbol_id = %s",
        (symbol_id,),
    )
    if row is not None:
        row["image"] = bytes(row["image"])
        row["generated"] = False
        return row

    view = db.fetch_one(
        """
        SELECT sample_count, landmarks FROM symbol_views
         WHERE symbol_id = %s
         ORDER BY CASE WHEN lower(view) = 'front' THEN 0 ELSE 1 END, sample_count DESC
         LIMIT 1
        """,
        (symbol_id,),
    )
    if view is None or not view["sample_count"]:
        return None
    matrix = landmarks.from_blob(bytes(view["landmarks"]), view["sample_count"],
                                 landmarks.LANDMARK_SIZE)
    # The middle sample of a steady hold is as typical as any.
    png = render_skeleton(matrix[len(matrix) // 2])
    if png is None:
        return None
    return {"mime": "image/png", "image": png, "width": SKELETON_PX, "height": SKELETON_PX,
            "updated_at": None, "generated": True}


SKELETON_PX = 320


def render_skeleton(row) -> bytes | None:
    """One landmark row (126 floats) -> PNG of the hand skeleton.

    Same bones and colouring as the live preview, fitted into a square with
    some margin. Both hands are drawn when both were recorded.
    """
    import io

    try:
        from PIL import Image, ImageDraw
    except ImportError:
        # Pillow is in requirements, but a partial install must degrade to
        # "no picture" rather than failing the request.
        return None

    from detector.tracker import HAND_CONNECTIONS

    frame = landmarks.unpack_landmarks(row)
    points = [(x, y) for hand in frame.hands for (x, y, _z) in hand.landmarks]
    if not points:
        return None

    xs, ys = zip(*points)
    span = max(max(xs) - min(xs), max(ys) - min(ys), 1e-3)
    margin = SKELETON_PX * 0.14
    scale = (SKELETON_PX - 2 * margin) / span
    # Centre the drawing along the shorter axis.
    offset_x = margin + ((span - (max(xs) - min(xs))) * scale) / 2
    offset_y = margin + ((span - (max(ys) - min(ys))) * scale) / 2

    def place(x, y):
        return (offset_x + (x - min(xs)) * scale, offset_y + (y - min(ys)) * scale)

    image = Image.new("RGB", (SKELETON_PX, SKELETON_PX), (26, 22, 23))
    draw = ImageDraw.Draw(image)
    for hand in frame.hands:
        pts = [place(x, y) for (x, y, _z) in hand.landmarks]
        for a, b in HAND_CONNECTIONS:
            draw.line([pts[a], pts[b]], fill=(238, 236, 236), width=4)
        dot = (226, 70, 70) if hand.label == "Right" else (245, 190, 84)
        for index, (px, py) in enumerate(pts):
            radius = 6 if index in (4, 8, 12, 16, 20) else 4
            draw.ellipse([px - radius, py - radius, px + radius, py + radius], fill=dot)

    buffer = io.BytesIO()
    image.save(buffer, "PNG", optimize=True)
    return buffer.getvalue()


def delete_symbol_image(user_id, symbol_id) -> None:
    get_symbol(user_id, symbol_id)
    db.execute("DELETE FROM symbol_images WHERE symbol_id = %s", (symbol_id,))


# --------------------------------------------------------------- security --
# What gets checked before a language reaches the community shelf. Installing
# a language copies its symbols' *outputs* into someone else's Direct Paste,
# so a key or shortcut that could do damage on their machine is the thing to
# stop; the rest is hygiene for text other people will read.

# Keys a symbol may press. Editing keys and navigation only - nothing that
# switches windows, opens menus or reaches the OS.
SAFE_KEYS = frozenset({
    "enter", "return", "backspace", "tab", "space", "delete", "del",
    "escape", "esc", "home", "end", "pageup", "pagedown", "page up", "page down",
    "up", "down", "left", "right", "arrowup", "arrowdown", "arrowleft", "arrowright",
    "shift", "capslock", "caps lock",
})

# Shortcuts a symbol may send. Clipboard and undo, and line breaks.
SAFE_COMBOS = frozenset({
    "ctrl+c", "ctrl+v", "ctrl+x", "ctrl+z", "ctrl+y", "ctrl+a",
    "cmd+c", "cmd+v", "cmd+x", "cmd+z", "cmd+a",
    "shift+enter", "ctrl+enter", "ctrl+backspace", "ctrl+shift+z",
})

MAX_TEXT_OUTPUT = 200
_URL_RE = re.compile(r"(https?://|www\.)", re.IGNORECASE)
_HTML_RE = re.compile(r"<[^>]+>")
_CONTROL_RE = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")


def _text_issues(where: str, value: str | None, *, allow_urls: bool) -> list:
    issues = []
    if not value:
        return issues
    if _CONTROL_RE.search(value):
        issues.append(_issue("block", "control_chars",
                             f"{where} contains control characters."))
    if _HTML_RE.search(value):
        issues.append(_issue("block", "markup", f"{where} contains HTML-like markup."))
    if not allow_urls and _URL_RE.search(value):
        issues.append(_issue("warn", "link", f"{where} contains a link."))
    return issues


def _issue(level: str, code: str, message: str) -> dict:
    return {"level": level, "code": code, "message": message}


def review_language(user_id, language_id) -> dict:
    """Security and quality review of a language, as it would be installed.

    Returns {"ok", "issues": [{level, code, message}], "summary": {...}}.
    `ok` is False when anything is level "block"; warnings never stop a
    publish, they are shown to the owner.
    """
    language = get_language(user_id, language_id)
    issues: list = []

    issues += _text_issues("The language name", language["name"], allow_urls=False)
    issues += _text_issues("The description", language.get("description"), allow_urls=True)

    signs = db.fetch_all(
        "SELECT id, name, phrases FROM signs WHERE language_id = %s", (language_id,))
    symbols = db.fetch_all(
        """
        SELECT y.id, y.name, y.output_kind, y.output_value, s.name AS sign_name
          FROM symbols y JOIN signs s ON s.id = y.sign_id
         WHERE s.language_id = %s
        """,
        (language_id,),
    )
    views = db.fetch_all(
        """
        SELECT v.id, v.view, v.sample_count, v.landmarks, y.name AS symbol_name
          FROM symbol_views v
          JOIN symbols y ON y.id = v.symbol_id
          JOIN signs s   ON s.id = y.sign_id
         WHERE s.language_id = %s
        """,
        (language_id,),
    )

    for sign in signs:
        issues += _text_issues(f"The sign name '{sign['name']}'", sign["name"], allow_urls=False)
        for phrase in sign["phrases"] or []:
            issues += _text_issues(f"A phrase in '{sign['name']}'", phrase, allow_urls=False)

    for symbol in symbols:
        label = f"'{symbol['sign_name']} / {symbol['name']}'"
        issues += _text_issues(f"The symbol name {label}", symbol["name"], allow_urls=False)
        kind = symbol["output_kind"]
        value = (symbol["output_value"] or "").strip()
        if kind == "text":
            issues += _text_issues(f"The text {label} types", value, allow_urls=False)
            if len(value) > MAX_TEXT_OUTPUT:
                issues.append(_issue("block", "output_length",
                                     f"The text {label} types is longer than {MAX_TEXT_OUTPUT} characters."))
        elif kind == "key":
            if value.lower() not in SAFE_KEYS:
                issues.append(_issue(
                    "block", "unsafe_key",
                    f"{label} presses '{value}', which is not an editing key. Only editing "
                    f"and navigation keys can be shared, so an installed language cannot "
                    f"reach another person's system."))
        elif kind == "combo":
            if value.lower().replace(" ", "") not in SAFE_COMBOS:
                issues.append(_issue(
                    "block", "unsafe_combo",
                    f"{label} sends the shortcut '{value}'. Only clipboard, undo and "
                    f"line-break shortcuts can be shared."))

    total_samples = 0
    for view in views:
        total_samples += view["sample_count"]
        blob = bytes(view["landmarks"])
        expected = view["sample_count"] * landmarks.LANDMARK_SIZE * 4
        if len(blob) != expected:
            issues.append(_issue("block", "blob_size",
                                 f"Samples for '{view['symbol_name']}' ({view['view']}) are corrupt."))
            continue
        matrix = landmarks.from_blob(blob, view["sample_count"], landmarks.LANDMARK_SIZE)
        if not np.all(np.isfinite(matrix)):
            issues.append(_issue("block", "blob_values",
                                 f"Samples for '{view['symbol_name']}' ({view['view']}) contain invalid numbers."))
        elif matrix.min() < -1.0 or matrix.max() > 2.0:
            # Normalised image coordinates; anything far outside is not a hand.
            issues.append(_issue("block", "blob_range",
                                 f"Samples for '{view['symbol_name']}' ({view['view']}) are not hand landmarks."))
        if view["sample_count"] > 5000:
            issues.append(_issue("warn", "view_size",
                                 f"'{view['symbol_name']}' ({view['view']}) holds a very large sample set."))

    if not symbols:
        issues.append(_issue("warn", "empty", "This language has no symbols yet."))
    elif total_samples == 0:
        issues.append(_issue("warn", "untrained",
                             "Nothing is trained yet - it will appear on the shelf with 0 samples "
                             "until you record some."))

    return {
        "ok": not any(issue["level"] == "block" for issue in issues),
        "issues": issues,
        "summary": {
            "signs": len(signs),
            "symbols": len(symbols),
            "samples": int(total_samples),
            "gesture_translation": bool(language["gesture_translation"]),
        },
    }


# --------------------------------------------------------------- profiles --

def published_by(owner_id) -> list:
    """Every public language one account has put on the shelf."""
    return db.fetch_all(
        "SELECT id, name FROM languages WHERE owner_id = %s AND visibility = 'public' "
        "ORDER BY published_at",
        (owner_id,),
    )


def public_profile(username: str, viewer_id=None) -> dict:
    """What anyone signed in may see about an account: name, when it joined,
    and what it has published. Email and phone are never part of this."""
    user = db.fetch_one(
        f"""
        SELECT id, {db.dialect.text('username')} AS username, created_at
          FROM users WHERE username = %s AND deleted_at IS NULL
        """,
        (username.strip(),),
    )
    if user is None:
        raise NotFound("No such user.")

    languages = db.fetch_all(
        """
        SELECT l.id, l.name, l.description, l.hand_control, l.published_at,
               l.gesture_translation, l.source, l.spoken_language, l.tag,
               (l.owner_id = %s) AS mine,
               EXISTS (SELECT 1 FROM language_installs i
                        WHERE i.language_id = l.id AND i.user_id = %s) AS installed,
               (SELECT count(*) FROM signs s WHERE s.language_id = l.id) AS sign_count,
               (SELECT count(*) FROM symbols y
                  JOIN signs s2 ON s2.id = y.sign_id
                 WHERE s2.language_id = l.id) AS symbol_count,
               COALESCE((SELECT sum(v.sample_count) FROM symbol_views v
                  JOIN symbols y2 ON y2.id = v.symbol_id
                  JOIN signs s3 ON s3.id = y2.sign_id
                 WHERE s3.language_id = l.id), 0) AS sample_count,
               (SELECT count(*) FROM language_installs i2
                 WHERE i2.language_id = l.id) AS install_count
          FROM languages l
         WHERE l.owner_id = %s AND l.visibility = 'public'
         ORDER BY l.published_at DESC
        """,
        (viewer_id, viewer_id, user["id"]),
    )
    for row in languages:
        row["mine"] = bool(row["mine"])
        row["installed"] = bool(row["installed"])
        row["gesture_translation"] = bool(row["gesture_translation"])

    return {
        "username": user["username"],
        "joined_at": user["created_at"],
        "languages": languages,
        "published_count": len(languages),
        "install_count": int(sum(row["install_count"] for row in languages)),
    }
