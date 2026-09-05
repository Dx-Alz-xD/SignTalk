"""k-nearest-neighbour classifier over pose vectors.

kNN is the right fit here: training is "hold a gesture for three seconds", so
the model has to be usable the instant new samples land, with no fitting step,
and adding one symbol must not disturb any other.

Confidence is deliberately *margin-based*. "How close is the best match" alone
is a poor signal - every gesture is somewhat close to something. What actually
predicts correctness is how much better the winner is than the best competing
label, so that term carries the most weight.
"""

from __future__ import annotations

from collections import defaultdict

import numpy as np

from .features import WEIGHTS

EPS = 1e-6


class Prediction:
    __slots__ = ("label", "confidence", "meta", "distance", "view",
                 "margin", "runner_up", "runner_up_label")

    def __init__(self, label, confidence, meta, distance, view=None,
                 margin=0.0, runner_up=None, runner_up_label=None):
        self.label = label
        self.confidence = confidence
        self.meta = meta or {}
        self.distance = distance
        self.view = view
        self.margin = margin
        self.runner_up = runner_up
        self.runner_up_label = runner_up_label

    def __repr__(self):
        return f"<Prediction {self.label!r} {self.confidence:.2f}>"


class KNNClassifier:
    # k=5 and max_distance=8.0 come from a 70/30 split of the ASL dataset:
    # 96-97% accuracy across k=3..9, with correct matches averaging 0.78
    # confidence against 0.42 for wrong ones. k=3 scored marginally higher but
    # the held-out photos come from the same sessions as their neighbours, so
    # it flatters small k; 5 tolerates a stray outlier better on live video.
    def __init__(self, labels, matrix, meta=None, views=None, k: int = 5,
                 max_distance: float = 8.0, min_confidence: float = 0.0):
        self.labels = list(labels)
        self.views = list(views or [None] * len(self.labels))
        self.matrix = np.asarray(matrix, dtype=np.float32)
        self.meta = dict(meta or {})
        self.k = k
        self.max_distance = max_distance
        self.min_confidence = min_confidence
        self.stale = 0

        # label -> row indices, for the runner-up scan
        self._rows = defaultdict(list)
        for i, label in enumerate(self.labels):
            self._rows[label].append(i)
        self._label_array = np.asarray(self.labels, dtype=object)

    @classmethod
    def from_library(cls, library, language_names=None, **kwargs):
        labels, views, matrix, meta, stale = library.training_set(language_names)
        model = cls(labels, matrix, meta, views, **kwargs)
        model.stale = stale
        return model

    @property
    def trained(self) -> bool:
        return self.matrix.shape[0] > 0

    @property
    def label_names(self) -> list:
        return sorted(set(self.labels))

    def distances(self, vector) -> np.ndarray:
        diff = (self.matrix - np.asarray(vector, dtype=np.float32)) * WEIGHTS
        return np.linalg.norm(diff, axis=1)

    def predict(self, vector) -> Prediction | None:
        """Distance-weighted kNN vote. None if untrained, too far, or unsure."""
        if not self.trained or vector is None:
            return None

        dists = self.distances(vector)
        k = min(self.k, dists.shape[0])
        nearest = np.argpartition(dists, k - 1)[:k]
        nearest = nearest[np.argsort(dists[nearest])]

        # Closer neighbours count for more than distant ones.
        weights = defaultdict(float)
        for i in nearest:
            weights[self.labels[i]] += 1.0 / (float(dists[i]) + EPS)

        total = sum(weights.values()) or EPS
        label = max(weights, key=weights.get)
        agreement = weights[label] / total

        own = np.asarray(self._rows[label], dtype=np.int64)
        best_row = int(own[np.argmin(dists[own])])
        best = float(dists[best_row])
        if best > self.max_distance:
            return None

        # Best match belonging to any *other* label - the real competitor.
        mask = np.ones(dists.shape[0], dtype=bool)
        mask[own] = False
        if mask.any():
            other_idx = int(np.flatnonzero(mask)[np.argmin(dists[mask])])
            runner_up = float(dists[other_idx])
            runner_up_label = self.labels[other_idx]
            margin = (runner_up - best) / (runner_up + best + EPS)
            margin = max(0.0, min(1.0, margin))
        else:
            # Only one label exists; nothing to be confused with, so fall back
            # to closeness rather than claiming a perfect margin.
            runner_up, runner_up_label = None, None
            margin = 1.0 - min(best / self.max_distance, 1.0)

        closeness = 1.0 - min(best / self.max_distance, 1.0)
        confidence = 0.45 * margin + 0.30 * closeness + 0.25 * agreement

        if confidence < self.min_confidence:
            return None

        return Prediction(
            label=label,
            confidence=confidence,
            meta=self.meta.get(label),
            distance=best,
            view=self.views[best_row] if best_row < len(self.views) else None,
            margin=margin,
            runner_up=runner_up,
            runner_up_label=runner_up_label,
        )

    def top_labels(self, vector, count: int = 3) -> list:
        """(label, distance) for the closest few labels - used for diagnostics."""
        if not self.trained or vector is None:
            return []
        dists = self.distances(vector)
        best = {}
        for label, rows in self._rows.items():
            idx = np.asarray(rows, dtype=np.int64)
            best[label] = float(np.min(dists[idx]))
        return sorted(best.items(), key=lambda kv: kv[1])[:count]


class Smoother:
    """Debounce raw per-frame predictions into stable, emitted labels.

    A label has to win `window` recent frames by `min_ratio` and clear
    `min_confidence` before it is reported, which stops the interpreter from
    flickering between neighbours mid-transition.
    """

    def __init__(self, window: int = 12, min_ratio: float = 0.6,
                 min_confidence: float = 0.55):
        self.window = window
        self.min_ratio = min_ratio
        self.min_confidence = min_confidence
        self._recent = []
        self._current = None

    def push(self, prediction):
        self._recent.append(prediction)
        if len(self._recent) > self.window:
            self._recent.pop(0)

        if len(self._recent) < max(3, self.window // 2):
            return None

        named = [p for p in self._recent if p is not None]
        if not named:
            self._current = None
            return None

        counts = defaultdict(int)
        for p in named:
            counts[p.label] += 1
        label = max(counts, key=counts.get)
        if counts[label] / len(self._recent) < self.min_ratio:
            return None

        matching = [p for p in named if p.label == label]
        confidence = sum(p.confidence for p in matching) / len(matching)
        if confidence < self.min_confidence:
            return None

        if label == self._current:
            return None  # already reported; wait for a change

        self._current = label
        best = max(matching, key=lambda p: p.confidence)
        return Prediction(label, confidence, best.meta, best.distance,
                          best.view, best.margin, best.runner_up,
                          best.runner_up_label)

    def peek(self):
        """Best current guess, whether or not it is stable enough to emit."""
        named = [p for p in self._recent if p is not None]
        if not named:
            return None
        counts = defaultdict(int)
        for p in named:
            counts[p.label] += 1
        label = max(counts, key=counts.get)
        matching = [p for p in named if p.label == label]
        confidence = sum(p.confidence for p in matching) / len(matching)
        best = max(matching, key=lambda p: p.confidence)
        return Prediction(label, confidence, best.meta, best.distance,
                          best.view, best.margin, best.runner_up,
                          best.runner_up_label)

    def reset(self):
        self._recent.clear()
        self._current = None
