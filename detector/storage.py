"""JSON-backed library of languages -> signs -> symbols -> views -> samples.

The shape is deliberately plain so the backend/db can adopt it later:

    {
      "version": 2,
      "languages": {
        "<language>": {
          "name": ..., "created": ..., "source": "user" | "asl_dataset",
          "signs": {
            "<sign>": {
              "name": ..., "language": ..., "has_phrases": bool,
              "phrases": [...], "created": ...,
              "symbols": {
                "<symbol>": {
                  "name": ..., "updated": ...,
                  "views": {
                    "<view>": {"samples": [[...]], "updated": ...,
                               "feature_version": 2}
                  }
                }
              }
            }
          }
        }
      }
    }

A *view* is an optional angle the same gesture was recorded from - front,
left, right, top, bottom. Each is just another bucket of samples under the
same label, so training extra views only ever widens what the classifier will
match; it never splits the label.
"""

from __future__ import annotations

import json
import os
import time
from pathlib import Path

import numpy as np

from .features import FEATURE_VERSION, VECTOR_SIZE

DATA_DIR = Path(__file__).resolve().parent / "data"
LIBRARY_PATH = DATA_DIR / "library.json"

VERSION = 2

DEFAULT_VIEW = "front"

# Offered in the training menu. Any other string is accepted too.
STANDARD_VIEWS = ("front", "left", "right", "top", "bottom")

VIEW_HINTS = {
    "front": "face the camera straight on",
    "left": "turn the gesture to show its left side",
    "right": "turn the gesture to show its right side",
    "top": "tilt so the camera sees it from above",
    "bottom": "tilt so the camera sees it from below",
    "varied": "mixed angles",
}


def _now() -> str:
    return time.strftime("%Y-%m-%d %H:%M:%S")


def _empty() -> dict:
    return {"version": VERSION, "languages": {}}


class Library:
    """Load / mutate / save the sign library."""

    def __init__(self, path: Path = LIBRARY_PATH):
        self.path = Path(path)
        self.data = _empty()
        self.load()

    # ---------------------------------------------------------------- io ---
    def load(self) -> None:
        if not self.path.exists():
            self.data = _empty()
            return
        try:
            with self.path.open("r", encoding="utf-8") as fh:
                loaded = json.load(fh)
        except (json.JSONDecodeError, OSError) as exc:
            backup = self.path.with_suffix(".corrupt.json")
            print(f"  ! could not read {self.path.name}: {exc}")
            try:
                os.replace(self.path, backup)
                print(f"  ! moved the unreadable file to {backup.name}, starting fresh")
            except OSError:
                pass
            self.data = _empty()
            return
        if not isinstance(loaded, dict) or "languages" not in loaded:
            self.data = _empty()
            return
        self.data = loaded
        self._migrate()

    def _migrate(self) -> None:
        """Fold pre-views symbols (`samples` as a flat list) into views.front."""
        changed = False
        for lang in self.languages.values():
            for sign in self.signs(lang).values():
                for symbol in self.symbols(sign).values():
                    legacy = symbol.pop("samples", None)
                    if legacy is None:
                        continue
                    changed = True
                    views = symbol.setdefault("views", {})
                    bucket = views.setdefault(DEFAULT_VIEW, {})
                    bucket.setdefault("samples", []).extend(legacy)
                    bucket.setdefault("updated", symbol.get("updated"))
                    # Pre-views data used the v1 feature layout.
                    bucket.setdefault("feature_version", 1)
        self.data["version"] = VERSION
        if changed:
            print("  (migrated older symbols into the 'front' view)")

    def save(self) -> None:
        """Atomic write so a crash mid-save cannot lose the library."""
        self.path.parent.mkdir(parents=True, exist_ok=True)
        tmp = self.path.with_suffix(".tmp")
        with tmp.open("w", encoding="utf-8") as fh:
            json.dump(self.data, fh, separators=(",", ":"))
        os.replace(tmp, self.path)

    # --------------------------------------------------------- languages ---
    @property
    def languages(self) -> dict:
        return self.data.setdefault("languages", {})

    def language_names(self) -> list:
        return sorted(self.languages.keys(), key=str.lower)

    def ensure_language(self, name: str, source: str = "user") -> dict:
        name = name.strip()
        existing = self.find_language(name)
        if existing is not None:
            return existing
        lang = {"name": name, "created": _now(), "source": source, "signs": {}}
        self.languages[name] = lang
        return lang

    def find_language(self, name: str):
        """Case-insensitive lookup."""
        if not name:
            return None
        target = name.strip().lower()
        for key, lang in self.languages.items():
            if key.lower() == target:
                return lang
        return None

    def delete_language(self, name: str) -> bool:
        for key in list(self.languages):
            if key.lower() == name.strip().lower():
                del self.languages[key]
                return True
        return False

    # ------------------------------------------------------------- signs ---
    @staticmethod
    def signs(language: dict) -> dict:
        return language.setdefault("signs", {})

    def find_sign(self, language: dict, name: str):
        target = name.strip().lower()
        for key, sign in self.signs(language).items():
            if key.lower() == target:
                return sign
        return None

    def add_sign(self, language: dict, name: str, has_phrases: bool,
                 phrases=None) -> dict:
        name = name.strip()
        sign = {
            "name": name,
            "language": language["name"],
            "has_phrases": bool(has_phrases),
            "phrases": list(phrases or []),
            "created": _now(),
            "symbols": {},
        }
        self.signs(language)[name] = sign
        return sign

    def delete_sign(self, language: dict, name: str) -> bool:
        signs = self.signs(language)
        for key in list(signs):
            if key.lower() == name.strip().lower():
                del signs[key]
                return True
        return False

    # ----------------------------------------------------------- symbols ---
    @staticmethod
    def symbols(sign: dict) -> dict:
        return sign.setdefault("symbols", {})

    def find_symbol(self, sign: dict, name: str):
        target = name.strip().lower()
        for key, sym in self.symbols(sign).items():
            if key.lower() == target:
                return sym
        return None

    def add_symbol(self, sign: dict, name: str) -> dict:
        name = name.strip()
        existing = self.find_symbol(sign, name)
        if existing is not None:
            return existing
        symbol = {"name": name, "views": {}, "updated": None}
        self.symbols(sign)[name] = symbol
        return symbol

    def delete_symbol(self, sign: dict, name: str) -> bool:
        symbols = self.symbols(sign)
        for key in list(symbols):
            if key.lower() == name.strip().lower():
                del symbols[key]
                return True
        return False

    # ------------------------------------------------------------- views ---
    @staticmethod
    def views(symbol: dict) -> dict:
        return symbol.setdefault("views", {})

    @classmethod
    def view_names(cls, symbol: dict) -> list:
        return list(cls.views(symbol).keys())

    @classmethod
    def sample_count(cls, symbol: dict, view: str | None = None) -> int:
        views = cls.views(symbol)
        if view is not None:
            return len((views.get(view) or {}).get("samples") or [])
        return sum(len(v.get("samples") or []) for v in views.values())

    @classmethod
    def trained_views(cls, symbol: dict) -> list:
        """(view, count) for every view that actually holds samples."""
        return [(name, len(v.get("samples") or []))
                for name, v in cls.views(symbol).items()
                if v.get("samples")]

    @classmethod
    def stale_views(cls, symbol: dict) -> list:
        """(view, count) for views stored under a superseded feature layout.

        These are unusable by the classifier and need recapturing - surfaced
        rather than silently dropped.
        """
        return [(name, len(v.get("samples") or []))
                for name, v in cls.views(symbol).items()
                if v.get("samples") and v.get("feature_version") != FEATURE_VERSION]

    @classmethod
    def delete_view(cls, symbol: dict, view: str) -> bool:
        views = cls.views(symbol)
        for key in list(views):
            if key.lower() == view.strip().lower():
                del views[key]
                return True
        return False

    @classmethod
    def store_samples(cls, symbol: dict, vectors, view: str = DEFAULT_VIEW,
                      replace: bool = False) -> int:
        """Append (or replace) training vectors in one view of a symbol.

        Returns the symbol's new total across all views.
        """
        rows = [[round(float(v), 3) for v in vec] for vec in vectors]
        bucket = cls.views(symbol).setdefault(view, {"samples": []})
        if replace or bucket.get("feature_version") != FEATURE_VERSION:
            bucket["samples"] = rows
        else:
            bucket.setdefault("samples", []).extend(rows)
        bucket["feature_version"] = FEATURE_VERSION
        bucket["updated"] = _now()
        symbol["updated"] = bucket["updated"]
        return cls.sample_count(symbol)

    # --------------------------------------------------------- traversal ---
    def iter_symbols(self, language_names=None):
        """Yield (language, sign, symbol) for every symbol in scope."""
        for lang_name in (language_names or self.language_names()):
            lang = self.find_language(lang_name)
            if lang is None:
                continue
            for sign in self.signs(lang).values():
                for symbol in self.symbols(sign).values():
                    yield lang, sign, symbol

    def training_set(self, language_names=None):
        """Build (labels, views, matrix, meta, stale) for the classifier.

        `stale` counts samples skipped because they were stored under an older
        feature layout - the caller surfaces that so the user knows to retrain
        rather than silently getting a weaker model.
        """
        labels, views, rows, meta = [], [], [], {}
        stale = 0

        for lang, sign, symbol in self.iter_symbols(language_names):
            label = f"{sign['name']} / {symbol['name']}"
            seen_any = False

            for view_name, bucket in self.views(symbol).items():
                samples = bucket.get("samples") or []
                if not samples:
                    continue
                if bucket.get("feature_version") != FEATURE_VERSION:
                    stale += len(samples)
                    continue
                good = [s for s in samples if len(s) == VECTOR_SIZE]
                stale += len(samples) - len(good)
                if not good:
                    continue
                seen_any = True
                for sample in good:
                    labels.append(label)
                    views.append(view_name)
                    rows.append(sample)

            if seen_any:
                meta[label] = {
                    "language": lang["name"],
                    "sign": sign["name"],
                    "symbol": symbol["name"],
                    "has_phrases": sign.get("has_phrases", False),
                    "phrases": sign.get("phrases", []),
                }

        matrix = (np.asarray(rows, dtype=np.float32)
                  if rows else np.zeros((0, VECTOR_SIZE), dtype=np.float32))
        return labels, views, matrix, meta, stale

    # ------------------------------------------------------------- stats ---
    def stats(self) -> dict:
        signs = symbols = samples = views = 0
        for _lang, _sign, symbol in self.iter_symbols():
            symbols += 1
            samples += self.sample_count(symbol)
            views += len(self.trained_views(symbol))
        for lang in self.languages.values():
            signs += len(self.signs(lang))
        return {
            "languages": len(self.languages),
            "signs": signs,
            "symbols": symbols,
            "views": views,
            "samples": samples,
        }
