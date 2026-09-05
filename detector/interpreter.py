"""Live interpretation: watch the camera and name what it sees.

Raw kNN output is per-frame and jittery, so it goes through `Smoother`, which
only emits a label once it has held steady for a fraction of a second. The
camera window shows the current best guess; the CLI logs the stable ones.
"""

from __future__ import annotations

import time

from .classifier import KNNClassifier, Smoother
from .ui_input import msvcrt


def _stop_requested(feed) -> bool:
    key = feed.take_key()
    if key in (27, ord("q"), ord("Q")):
        return True
    if msvcrt is not None and msvcrt.kbhit():
        ch = msvcrt.getwch()
        if ch in ("\x00", "\xe0"):
            msvcrt.getwch()
            return False
        if ch == "\x03":
            raise KeyboardInterrupt
        return True
    return False


def run(feed, library, language_names=None, min_confidence: float = 0.55) -> list:
    """Run the interpreter until the user stops it. Returns the transcript."""
    scope = ", ".join(language_names) if language_names else "every language"
    model = KNNClassifier.from_library(library, language_names)

    if not model.trained:
        print(f"\n  Nothing trained in {scope} yet - train a symbol first "
              f"(main menu -> 2, or explore -> add symbols).")
        if model.stale:
            print(f"  ({model.stale} sample(s) were stored under an older "
                  f"feature layout and can't be used - retrain those symbols.)")
        return []

    views = sorted({v for v in model.views if v})
    print(f"\n  Interpreter running over {scope}")
    print(f"  {len(model.label_names)} symbol(s) known, "
          f"{model.matrix.shape[0]} training samples, "
          f"views: {', '.join(views) if views else 'front'}")
    if model.stale:
        print(f"  ! {model.stale} sample(s) use an older feature layout and are "
              f"being ignored - retrain those symbols to get them back.")
    print("  Hold a gesture. Press ENTER here, or ESC in the camera window, to stop.\n")

    smoother = Smoother(min_confidence=min_confidence)
    transcript = []
    last_stamp = 0.0
    feed.drain_keys()
    if msvcrt is not None:
        while msvcrt.kbhit():
            msvcrt.getwch()

    try:
        while True:
            if _stop_requested(feed):
                break

            vector, hands, stamp = feed.latest()
            if stamp == last_stamp:
                time.sleep(0.01)
                continue
            last_stamp = stamp

            prediction = model.predict(vector) if vector is not None else None
            emitted = smoother.push(prediction)

            if emitted is not None:
                stamped = time.strftime("%H:%M:%S")
                transcript.append((stamped, emitted.label, emitted.confidence))
                meta = emitted.meta or {}
                extra = f"  [{meta.get('language', '?')}"
                if emitted.view:
                    extra += f", {emitted.view} view"
                extra += "]"
                if emitted.runner_up_label:
                    extra += f"  vs {emitted.runner_up_label}"
                if meta.get("has_phrases") and meta.get("phrases"):
                    extra += f"  phrases: {', '.join(meta['phrases'][:3])}"
                print(f"  {stamped}  {emitted.label:<28} "
                      f"{emitted.confidence * 100:5.1f}%{extra}")

            best = smoother.peek()
            if best is not None:
                feed.set_readout(f"{best.label}  {best.confidence * 100:.0f}%")
                feed.set_banner(title="INTERPRETING", subtitle=scope,
                                hint="ESC to stop", tone="ok")
            else:
                feed.set_readout("")
                subtitle = ("show a trained gesture" if hands
                            else "no hand detected")
                feed.set_banner(title="INTERPRETING", subtitle=subtitle,
                                hint="ESC to stop", tone="warn")
    finally:
        feed.clear_overlay()

    if transcript:
        print(f"\n  Interpreter stopped - {len(transcript)} reading(s):")
        for stamped, label, confidence in transcript:
            print(f"    {stamped}  {label}  ({confidence * 100:.0f}%)")
    else:
        print("\n  Interpreter stopped - nothing recognised confidently.")
    return transcript
