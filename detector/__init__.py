"""SignTalk detector: camera-driven sign capture, training and interpretation.

Standalone for now; the storage layer (`detector.storage`) and the classifier
(`detector.classifier`) are the seams the rest of the project will plug into.
"""

__all__ = ["storage", "classifier", "camera", "tracker", "features", "interpreter"]
