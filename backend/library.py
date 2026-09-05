"""The sign library, backed by Postgres.

Same tree the detector keeps in library.json - languages -> signs -> symbols
-> views -> samples - except every query is scoped by owner. That scoping is
the whole security story for this module: a valid session proves who you are,
not what you may open, so nothing here takes an id without also checking it
belongs to the caller.
"""

from __future__ import annotations

import numpy as np

from . import db, landmarks
from detector import features as F
from detector.classifier import KNNClassifier

DEFAULT_VIEW = "front"
STANDARD_VIEWS = ("front", "left", "right", "top", "bottom")


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


def create_language(user_id, name: str, description: str = "",
                    source: str = "user") -> dict:
    name = (name or "").strip()
    if not name:
        raise ValueError("A language needs a name.")
    if len(name) > 80:
        raise ValueError("That name is too long (80 characters max).")

    existing = db.fetch_one(
        "SELECT id FROM languages WHERE owner_id = %s AND lower(name) = lower(%s)",
        (user_id, name),
    )
    if existing is not None:
        raise Conflict(f"You already have a language called '{name}'.")

    return db.fetch_one(
        """
        INSERT INTO languages (owner_id, name, description, source)
        VALUES (%s, %s, NULLIF(%s, ''), %s)
        RETURNING *
        """,
        (user_id, name, (description or "").strip(), source),
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
        raise ValueError("A sign needs a name.")

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


def delete_sign(user_id, sign_id) -> None:
    get_sign(user_id, sign_id)
    db.execute("DELETE FROM signs WHERE id = %s", (sign_id,))


# ----------------------------------------------------------------- symbols --

def list_symbols(user_id, sign_id) -> list:
    get_sign(user_id, sign_id)
    rows = db.fetch_all(
        """
        SELECT y.id, y.name, y.created_at, y.updated_at,
               COALESCE(json_agg(
                   json_build_object('view', v.view, 'samples', v.sample_count,
                                     'spread', v.quality_spread,
                                     'feature_version', v.feature_version)
                   ORDER BY v.view
               ) FILTER (WHERE v.id IS NOT NULL), '[]') AS views,
               COALESCE(sum(v.sample_count), 0) AS sample_count
          FROM symbols y
          LEFT JOIN symbol_views v ON v.symbol_id = y.id
         WHERE y.sign_id = %s
         GROUP BY y.id
         ORDER BY y.created_at
        """,
        (sign_id,),
    )
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
        raise ValueError("A symbol needs a name.")

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


def delete_symbol(user_id, symbol_id) -> None:
    get_symbol(user_id, symbol_id)
    db.execute("DELETE FROM symbols WHERE id = %s", (symbol_id,))


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

def training_set(user_id, language_id=None):
    """(labels, views, matrix, meta, stale) for everything in scope."""
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
           AND (%s::uuid IS NULL OR l.id = %s::uuid)
        """,
        (user_id, language_id, language_id),
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


def build_classifier(user_id, language_id=None) -> KNNClassifier:
    labels, views, matrix, meta, stale = training_set(user_id, language_id)
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
           AND (v.feature_version IS DISTINCT FROM %s OR v.features IS NULL)
        """,
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
