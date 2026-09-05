"""Import the bundled ASL image dataset as base recognition data.

The dataset is laid out one folder per class (`0`-`9`, `a`-`z`), with file
names like `hand1_a_bot_seg_3_cropped.jpeg`. The `bot`/`top`/`left`/`right`/
`dif` part is the angle the photo was taken from, which maps straight onto the
view buckets used for live training - so the imported alphabet arrives with
side/top/bottom coverage already in place.

Two practical details:

*The crops are tight.* MediaPipe's palm detector wants some background around
the hand and finds only ~75% of hands in these 400x400 crops as-is. Padding
the image by 25% before detection takes that to 100%, so every image goes
through a small cascade of preprocessing attempts before it is written off.

*There is a duplicate copy nested inside the dataset folder.* It is skipped,
otherwise every sample would be counted twice and quietly double its weight
in the nearest-neighbour vote.
"""

from __future__ import annotations

import string
from pathlib import Path

import cv2
import numpy as np

from . import features
from .models import ensure_hand_landmarker
from .tracker import Hand, TrackedFrame

DEFAULT_ASL_DIR = Path(__file__).resolve().parent / "asl_dataset"

LANGUAGE = "ASL"
ALPHABET_SIGN = "Alphabet"
DIGITS_SIGN = "Digits"

DIGITS = set(string.digits)
LETTERS = set(string.ascii_lowercase)

# filename fragment -> view bucket
VIEW_MAP = {
    "bot": "bottom",
    "top": "top",
    "left": "left",
    "right": "right",
    "dif": "varied",
}

DETECT_CONFIDENCE = 0.3


class ImportReport:
    def __init__(self):
        self.images = 0
        self.detected = 0
        self.missed = 0
        self.classes = 0
        self.per_view = {}
        self.failed_classes = []

    @property
    def rate(self) -> float:
        return self.detected / self.images if self.images else 0.0

    def summary(self) -> str:
        views = ", ".join(f"{v}:{n}" for v, n in sorted(self.per_view.items()))
        return (f"{self.detected}/{self.images} images used "
                f"({self.rate * 100:.1f}%), {self.classes} symbols, "
                f"views -> {views}")


def _view_for(path: Path) -> str:
    parts = path.stem.lower().split("_")
    for part in parts:
        if part in VIEW_MAP:
            return VIEW_MAP[part]
    return "varied"


def discover(root: Path = DEFAULT_ASL_DIR) -> dict:
    """class name -> [(path, view), ...], skipping the nested duplicate copy."""
    root = Path(root)
    if not root.is_dir():
        return {}

    found = {}
    for child in sorted(root.iterdir()):
        if not child.is_dir():
            continue
        # The dataset ships a full copy of itself one level down.
        if child.name.lower() == root.name.lower():
            continue
        images = sorted(
            p for p in child.iterdir()
            if p.is_file() and p.suffix.lower() in (".jpg", ".jpeg", ".png")
        )
        if images:
            found[child.name.lower()] = [(p, _view_for(p)) for p in images]
    return found


class _Detector:
    """Single-image hand landmarker with a preprocessing cascade."""

    def __init__(self, quiet: bool = False):
        self.available = False
        self.reason = ""
        self._impl = None
        self._mp = None

        model = ensure_hand_landmarker(quiet=quiet)
        if model is None:
            self.reason = "hand_landmarker.task model is missing"
            return
        try:
            import mediapipe as mp
            vision = mp.tasks.vision
            self._impl = vision.HandLandmarker.create_from_options(
                vision.HandLandmarkerOptions(
                    base_options=mp.tasks.BaseOptions(model_asset_path=str(model)),
                    running_mode=vision.RunningMode.IMAGE,
                    num_hands=1,
                    min_hand_detection_confidence=DETECT_CONFIDENCE,
                    min_hand_presence_confidence=DETECT_CONFIDENCE,
                )
            )
            self._mp = mp
        except Exception as exc:
            self.reason = f"could not start HandLandmarker: {exc}"
            return
        self.available = True

    @staticmethod
    def _pad(image, fraction):
        margin = int(max(image.shape[:2]) * fraction)
        return cv2.copyMakeBorder(image, margin, margin, margin, margin,
                                  cv2.BORDER_REPLICATE)

    def _detect_once(self, bgr):
        mp = self._mp
        rgb = np.ascontiguousarray(cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB))
        result = self._impl.detect(
            mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb))
        if not result or not result.hand_landmarks:
            return None
        label, score = "Right", 1.0
        if result.handedness and result.handedness[0]:
            cat = result.handedness[0][0]
            label = cat.category_name or label
            score = float(cat.score)
        return Hand(label=label, score=score,
                    landmarks=[(p.x, p.y, p.z) for p in result.hand_landmarks[0]])

    def encode_file(self, path: Path):
        """Feature vector for one image, or None if no hand was found."""
        image = cv2.imread(str(path))
        if image is None:
            return None

        # Cheapest first; 25% padding alone lifts detection from ~75% to 100%.
        attempts = (
            lambda im: self._pad(im, 0.25),
            lambda im: im,
            lambda im: cv2.resize(self._pad(im, 0.35), (512, 512),
                                  interpolation=cv2.INTER_CUBIC),
        )
        for prepare in attempts:
            try:
                hand = self._detect_once(prepare(image))
            except Exception:
                hand = None
            if hand is not None:
                return features.encode(TrackedFrame([hand]))
        return None

    def close(self):
        if self._impl is not None:
            try:
                self._impl.close()
            except Exception:
                pass
            self._impl = None
        self.available = False


def import_asl(library, root: Path = DEFAULT_ASL_DIR, on_progress=None,
               limit_per_class: int | None = None, quiet: bool = False):
    """Encode the dataset into `library` under the ASL language.

    `on_progress(done, total, class_name)` is called as it goes. Returns an
    `ImportReport`, or None if the dataset or the detector is unavailable.
    """
    classes = discover(root)
    if not classes:
        return None

    detector = _Detector(quiet=quiet)
    if not detector.available:
        if not quiet:
            print(f"  ! {detector.reason}")
        return None

    if limit_per_class:
        classes = {name: items[:limit_per_class] for name, items in classes.items()}

    total = sum(len(items) for items in classes.values())
    report = ImportReport()
    done = 0

    language = library.ensure_language(LANGUAGE, source="asl_dataset")
    signs = {}
    for sign_name, has_phrases in ((ALPHABET_SIGN, False), (DIGITS_SIGN, False)):
        sign = library.find_sign(language, sign_name)
        if sign is None:
            sign = library.add_sign(language, sign_name, has_phrases)
        signs[sign_name] = sign

    try:
        for class_name in sorted(classes):
            items = classes[class_name]
            sign = signs[DIGITS_SIGN if class_name in DIGITS else ALPHABET_SIGN]
            display = class_name.upper() if class_name in LETTERS else class_name
            symbol = library.add_symbol(sign, display)

            by_view = {}
            for path, view in items:
                done += 1
                report.images += 1
                vector = detector.encode_file(path)
                if vector is None:
                    report.missed += 1
                else:
                    report.detected += 1
                    by_view.setdefault(view, []).append(vector)
                if on_progress is not None:
                    on_progress(done, total, display)

            if not by_view:
                report.failed_classes.append(display)
                continue

            report.classes += 1
            for view, vectors in by_view.items():
                # Replace rather than append so re-importing can't stack
                # duplicate copies of the same photos.
                library.store_samples(symbol, vectors, view=view, replace=True)
                report.per_view[view] = report.per_view.get(view, 0) + len(vectors)
    finally:
        detector.close()

    library.save()
    return report
