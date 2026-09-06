"""Import a folder of images as a sign language.

    python -m backend.import_dataset D:\\dataset_ISL --name ISL --system --publish
    python -m backend.import_dataset ./my_signs --name "Home signs" --owner you@x.com

Layout expected: one folder per symbol, images inside -

    dataset/
      a/  A1.jpg  A2.jpg ...
      b/  ...
      hello/ ...

Folder names become symbol names (single letters are upper-cased). Letters go
into an "Alphabet" sign, digits into "Digits", anything else into "Words". If
a filename carries an angle token (bot/top/left/right/dif, as the bundled ASL
dataset does) the sample is filed under that view; otherwise under "front".

What is stored is what the trainer stores from a camera: the hand landmarks
MediaPipe finds in each image, encoded through the same detector/features.py,
so an imported language is interchangeable with a trained one. If the
language has gesture translation on, the first usable image of each symbol is
kept as a thumbnail so sign-to-sign translation can show it.

Hand detection runs here, on the server, so this needs the detector's extra
dependencies:  pip install mediapipe opencv-python
"""

from __future__ import annotations

import argparse
import string
import sys
import time
from pathlib import Path

from . import library
from .landmarks import to_frame

ALPHABET_SIGN = "Alphabet"
DIGITS_SIGN = "Digits"
WORDS_SIGN = "Words"

THUMB_MAX_PX = 320
THUMB_QUALITY = 82

# Imported photos are finished stills, so the detector can be more permissive
# than the live tracker: a missed hand here is a lost sample, not a false read.
DETECT_CONFIDENCE = 0.3


class ImportReport:
    def __init__(self) -> None:
        self.images = 0
        self.detected = 0
        self.missed = 0
        self.symbols = 0
        self.per_view: dict = {}
        self.failed_symbols: list = []
        self.started = time.time()

    @property
    def rate(self) -> float:
        return self.detected / self.images if self.images else 0.0

    def summary(self) -> str:
        views = ", ".join(f"{v}:{n}" for v, n in sorted(self.per_view.items()))
        return (f"{self.detected}/{self.images} images used ({self.rate * 100:.1f}%), "
                f"{self.symbols} symbols, views -> {views or 'none'}, "
                f"{time.time() - self.started:.0f}s")


def available() -> tuple[bool, str]:
    """Can this machine run the importer? (mediapipe + opencv present)."""
    try:
        import cv2  # noqa: F401
        import mediapipe  # noqa: F401
    except Exception as exc:  # pragma: no cover - depends on the machine
        return False, f"{exc.__class__.__name__}: {exc}"
    return True, ""


class _ImageDetector:
    """Single-image hand landmarker with a padding cascade.

    Tight crops (the bundled datasets are 100-400px squares around the hand)
    starve MediaPipe's palm detector of context; padding the image out first
    lifts detection from roughly three quarters of images to nearly all.
    """

    def __init__(self, max_hands: int = 2) -> None:
        import cv2
        import mediapipe as mp

        from detector.models import ensure_hand_landmarker

        self._cv2 = cv2
        self._mp = mp
        model = ensure_hand_landmarker(quiet=True)
        if model is None:
            raise RuntimeError("hand_landmarker.task could not be downloaded")
        vision = mp.tasks.vision
        self._impl = vision.HandLandmarker.create_from_options(
            vision.HandLandmarkerOptions(
                base_options=mp.tasks.BaseOptions(model_asset_path=str(model)),
                running_mode=vision.RunningMode.IMAGE,
                num_hands=max_hands,
                min_hand_detection_confidence=DETECT_CONFIDENCE,
                min_hand_presence_confidence=DETECT_CONFIDENCE,
            )
        )

    def _pad(self, image, fraction: float):
        cv2 = self._cv2
        margin = int(max(image.shape[:2]) * fraction)
        return cv2.copyMakeBorder(image, margin, margin, margin, margin, cv2.BORDER_REPLICATE)

    def _detect(self, bgr) -> list:
        cv2, mp = self._cv2, self._mp
        import numpy as np

        rgb = np.ascontiguousarray(cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB))
        result = self._impl.detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb))
        if not result or not result.hand_landmarks:
            return []
        hands = []
        for i, points in enumerate(result.hand_landmarks):
            label, score = "Right", 1.0
            if result.handedness and i < len(result.handedness) and result.handedness[i]:
                cat = result.handedness[i][0]
                label, score = cat.category_name or label, float(cat.score)
            hands.append({"label": label, "score": score,
                          "landmarks": [[p.x, p.y, p.z] for p in points]})
        return hands

    def hands_in(self, path: Path):
        """(hands, image) for one file; hands is [] when nothing was found."""
        cv2 = self._cv2
        image = cv2.imread(str(path))
        if image is None:
            return [], None
        # Cheapest first; the padded attempts are what rescue tight crops. The
        # last one also upscales, which is what small (100px) frames need.
        attempts = (
            lambda im: self._pad(im, 0.25),
            lambda im: im,
            lambda im: cv2.resize(self._pad(im, 0.35), (512, 512), interpolation=cv2.INTER_CUBIC),
            lambda im: cv2.resize(self._pad(im, 0.6), (640, 640), interpolation=cv2.INTER_CUBIC),
        )
        for prepare in attempts:
            try:
                hands = self._detect(prepare(image))
            except Exception:
                hands = []
            if hands:
                return hands, image
        return [], image

    def thumbnail(self, image) -> bytes | None:
        """JPEG bytes, longest side THUMB_MAX_PX."""
        cv2 = self._cv2
        h, w = image.shape[:2]
        scale = THUMB_MAX_PX / max(h, w)
        if scale < 1:
            image = cv2.resize(image, (int(w * scale), int(h * scale)),
                               interpolation=cv2.INTER_AREA)
        ok, buffer = cv2.imencode(".jpg", image, [cv2.IMWRITE_JPEG_QUALITY, THUMB_QUALITY])
        return buffer.tobytes() if ok else None

    def close(self) -> None:
        try:
            self._impl.close()
        except Exception:
            pass


def discover(root: Path) -> dict:
    """symbol name -> [(path, view), ...]. Reuses the detector's rules, which
    also skip the duplicate copy some datasets ship nested inside themselves."""
    from detector.dataset import discover as _discover

    return _discover(Path(root))


def _display_name(folder: str) -> str:
    return folder.upper() if len(folder) == 1 and folder.isalpha() else folder


def _sign_for(folder: str) -> str:
    if len(folder) == 1 and folder in string.digits:
        return DIGITS_SIGN
    if len(folder) == 1 and folder.isalpha():
        return ALPHABET_SIGN
    return WORDS_SIGN


def import_folder(user_id, language_name: str, root, *, limit_per_class: int | None = None,
                  gesture_translation: bool = True, publish: bool = False,
                  source: str = "user", on_progress=None) -> ImportReport | None:
    """Import `root` into `language_name` owned by `user_id`. Returns a report,
    or None when the folder holds no class folders."""
    classes = discover(Path(root))
    if not classes:
        return None
    if limit_per_class:
        classes = {name: items[:limit_per_class] for name, items in classes.items()}

    detector = _ImageDetector()
    report = ImportReport()
    total = sum(len(items) for items in classes.values())
    done = 0

    language = library.find_or_create_language(user_id, language_name)
    if language.get("source") != source and source != "user":
        db_source = source
    else:
        db_source = None
    language = library.update_language(
        user_id, language["id"], gesture_translation=gesture_translation,
    )
    if db_source:
        # A dataset import is not a user's own recording; say so on the row.
        from . import db as _db
        _db.execute("UPDATE languages SET source = %s WHERE id = %s", (db_source, language["id"]))

    signs: dict = {}

    def sign_named(name: str) -> dict:
        if name not in signs:
            found = next((s for s in library.list_signs(user_id, language["id"])
                          if s["name"].lower() == name.lower()), None)
            signs[name] = (library.get_sign(user_id, found["id"]) if found
                           else library.create_sign(user_id, language["id"], name, False))
        return signs[name]

    try:
        for folder in sorted(classes):
            items = classes[folder]
            sign = sign_named(_sign_for(folder))
            symbol = library.create_symbol(user_id, sign["id"], _display_name(folder))

            by_view: dict = {}
            thumbnail = None
            for path, view in items:
                done += 1
                report.images += 1
                hands, image = detector.hands_in(path)
                if hands:
                    report.detected += 1
                    by_view.setdefault(view, []).append({"hands": hands})
                    if thumbnail is None and gesture_translation and image is not None:
                        thumbnail = detector.thumbnail(image)
                else:
                    report.missed += 1
                if on_progress is not None:
                    on_progress(done, total, _display_name(folder))

            if not by_view:
                report.failed_symbols.append(_display_name(folder))
                continue

            report.symbols += 1
            for view, samples in by_view.items():
                # Replace, so re-running the import cannot stack duplicates.
                library.store_samples(user_id, symbol["id"], view, samples, replace=True)
                report.per_view[view] = report.per_view.get(view, 0) + len(samples)
            if thumbnail:
                try:
                    library.set_symbol_image(user_id, symbol["id"], thumbnail, "image/jpeg")
                except ValueError:
                    pass
    finally:
        detector.close()

    if publish:
        library.publish_language(user_id, language["id"], True)
    return report


# ------------------------------------------------------------------- CLI --

def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description="Import an image dataset as a sign language.")
    parser.add_argument("root", help="folder with one sub-folder per symbol")
    parser.add_argument("--name", required=True, help="language name, e.g. ISL")
    who = parser.add_mutually_exclusive_group(required=True)
    who.add_argument("--owner", help="email of the account that owns the language")
    who.add_argument("--system", action="store_true",
                     help="import as a built-in SignTalk language (auto-installed for new accounts)")
    parser.add_argument("--limit", type=int, default=None, help="images per symbol (default all)")
    parser.add_argument("--publish", action="store_true", help="publish to the community database")
    parser.add_argument("--no-images", action="store_true",
                        help="do not keep a thumbnail per symbol (gesture translation off)")
    args = parser.parse_args(argv)

    ok, why = available()
    if not ok:
        print(f"  ! Cannot import here: {why}\n    pip install mediapipe opencv-python")
        return 1

    from .auth.sql_store import SqlStore
    if args.system:
        from . import builtin
        owner = builtin.system_user()
        source = "asl_dataset"
    else:
        owner = SqlStore().get_user_by_email(args.owner)
        if owner is None:
            print(f"  ! No account with email {args.owner}")
            return 1
        source = "user"

    state = {"last": -1}

    def progress(done, total, name):
        percent = int(done / total * 100)
        if percent != state["last"]:
            state["last"] = percent
            print(f"\r  [{'#' * (percent // 4):<25}] {percent:3d}%  {done}/{total}  {name:<8}",
                  end="", flush=True)

    print(f"\n  Importing {args.root} as '{args.name}' for {owner.username}...")
    report = import_folder(owner.id, args.name, args.root, limit_per_class=args.limit,
                           gesture_translation=not args.no_images,
                           publish=args.publish or args.system, source=source,
                           on_progress=progress)
    print()
    if report is None:
        print("  ! No class folders found there.")
        return 1
    print(f"  {report.summary()}")
    if report.failed_symbols:
        print(f"  ! No usable hand in any image for: {', '.join(report.failed_symbols)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
