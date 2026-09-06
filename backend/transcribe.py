"""Speech to text with word timestamps, for the video translator.

Runs faster-whisper (CTranslate2 Whisper) on the CPU, entirely on this
machine: the audio never goes anywhere else, and the file it came from is
deleted as soon as the words are out. The model weights are downloaded once
from Hugging Face on first use (~150 MB for "base") into the user's cache.

    SIGNTALK_WHISPER_MODEL   tiny | base | small | medium  (default base)
    SIGNTALK_WHISPER_DEVICE  cpu | cuda                    (default cpu)

Optional dependency: ``pip install faster-whisper``. Without it `available()`
says so and the frontend falls back to a subtitle file or a typed transcript.
"""

from __future__ import annotations

import os
import threading
import wave
from pathlib import Path

DEFAULT_MODEL = "base"

_model = None
_model_lock = threading.Lock()


def available() -> tuple[bool, str]:
    try:
        import faster_whisper  # noqa: F401
    except Exception as exc:  # pragma: no cover - depends on the machine
        return False, f"faster-whisper is not installed ({exc.__class__.__name__})"
    return True, ""


def model_name() -> str:
    return os.environ.get("SIGNTALK_WHISPER_MODEL", DEFAULT_MODEL)


def _load():
    """One model per process, loaded on first use (it takes a few seconds)."""
    global _model
    if _model is None:
        with _model_lock:
            if _model is None:
                from faster_whisper import WhisperModel

                device = os.environ.get("SIGNTALK_WHISPER_DEVICE", "cpu")
                compute = "int8" if device == "cpu" else "float16"
                _model = WhisperModel(model_name(), device=device, compute_type=compute)
    return _model


def _read_wav(path: Path):
    """16-bit PCM WAV -> float32 mono at its native rate, or None if not WAV."""
    import numpy as np

    try:
        with wave.open(str(path), "rb") as fh:
            channels, width, rate = fh.getnchannels(), fh.getsampwidth(), fh.getframerate()
            frames = fh.readframes(fh.getnframes())
    except (wave.Error, EOFError):
        return None
    if width != 2:
        return None
    samples = np.frombuffer(frames, dtype="<i2").astype("float32") / 32768.0
    if channels > 1:
        samples = samples.reshape(-1, channels).mean(axis=1)
    return samples, rate


def transcribe(path, *, language: str | None = None, on_progress=None) -> dict:
    """Words with timings for one media file.

    Returns {"language", "duration", "words": [{"text","start","end","probability"}],
    "segments": [{"start","end","text"}]}. `on_progress(fraction)` is called as
    segments come out.
    """
    import numpy as np

    model = _load()
    path = Path(path)

    # A WAV the browser already made is decoded here and handed over as an
    # array; anything else (a whole video) goes through PyAV inside
    # faster-whisper, which understands every common container.
    audio = None
    duration = None
    wav = _read_wav(path)
    if wav is not None:
        samples, rate = wav
        if rate != 16000:
            # Linear resample; the browser normally sends 16 kHz already.
            target = int(len(samples) * 16000 / rate)
            samples = np.interp(np.linspace(0, len(samples) - 1, target),
                                np.arange(len(samples)), samples).astype("float32")
        audio = samples
        duration = len(samples) / 16000.0

    segments, info = model.transcribe(
        audio if audio is not None else str(path),
        language=language or None,
        word_timestamps=True,
        vad_filter=True,
        beam_size=5,
        condition_on_previous_text=False,
    )
    total = duration or float(getattr(info, "duration", 0) or 0) or None

    words, spans = [], []
    for segment in segments:
        spans.append({"start": round(segment.start, 3), "end": round(segment.end, 3),
                      "text": segment.text.strip()})
        for word in segment.words or []:
            text = word.word.strip()
            if not text:
                continue
            words.append({
                "text": text,
                "start": round(word.start, 3),
                "end": round(word.end, 3),
                "probability": round(float(word.probability), 3),
            })
        if on_progress is not None and total:
            on_progress(min(0.99, segment.end / total))

    return {
        "language": getattr(info, "language", language) or language,
        "duration": round(total or (words[-1]["end"] if words else 0.0), 3),
        "words": words,
        "segments": spans,
        "model": model_name(),
    }
