"""Video translator: transcribe speech with word timings.

    GET  /video/transcriber        is speech-to-text available here, which model
    POST /video/transcribe         upload audio (or a whole video) -> job id
    GET  /video/jobs/{id}          status, progress, and the words when done

The browser keeps the video. It decodes the soundtrack to a small 16 kHz WAV
and uploads only that; a whole file is accepted too, for browsers that could
not decode it. The upload is written to a temp file, transcribed in a worker
thread, and deleted - nothing about the video is kept once the words are out.
"""

from __future__ import annotations

import os
import tempfile
import threading
import time
import uuid

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status

from .. import transcribe
from .deps import current_user

router = APIRouter(prefix="/video", tags=["video"])

# 200 MB: a 16 kHz mono WAV is ~2 MB/min, so this is hours of audio, or a
# modest video uploaded whole.
MAX_UPLOAD = 200 * 1024 * 1024
JOB_TTL_SECONDS = 30 * 60

_jobs: dict = {}
_jobs_lock = threading.Lock()


def _safe_suffix(filename: str | None) -> str:
    """The upload's extension, reduced to something safe to build a path from.

    The name comes from the client, and mkstemp joins the suffix straight onto
    the temp directory - so ".\\..\\..\\startup\\x" would decide where the file
    lands rather than just what it is called. Only the extension is wanted
    here anyway (ffmpeg and whisper sniff the real format from the bytes), so
    anything that is not a short alphanumeric run is dropped.
    """
    extension = os.path.splitext(filename or "")[1].lstrip(".").lower()
    if not extension.isalnum() or not 1 <= len(extension) <= 8:
        return ".bin"
    return f".{extension}"


def _prune() -> None:
    cutoff = time.time() - JOB_TTL_SECONDS
    with _jobs_lock:
        for job_id in [k for k, v in _jobs.items() if v["created"] < cutoff]:
            _jobs.pop(job_id, None)


def _run(job_id: str, path: str, language: str | None) -> None:
    def progress(fraction: float) -> None:
        with _jobs_lock:
            if job_id in _jobs:
                _jobs[job_id]["progress"] = fraction

    try:
        with _jobs_lock:
            _jobs[job_id]["status"] = "running"
        result = transcribe.transcribe(path, language=language, on_progress=progress)
        with _jobs_lock:
            _jobs[job_id].update(status="done", progress=1.0, result=result)
    except Exception as exc:  # the job carries the error to the client
        with _jobs_lock:
            _jobs[job_id].update(status="failed", error=f"{exc.__class__.__name__}: {exc}")
    finally:
        try:
            os.unlink(path)
        except OSError:
            pass


@router.get("/transcriber")
def transcriber(user=Depends(current_user)):
    ok, why = transcribe.available()
    return {"available": ok, "model": transcribe.model_name() if ok else None, "reason": why or None}


@router.post("/transcribe", status_code=status.HTTP_202_ACCEPTED)
async def start(
    media: UploadFile = File(...),
    language: str = Form(""),
    user=Depends(current_user),
):
    ok, why = transcribe.available()
    if not ok:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE,
                            f"Speech-to-text is not available on this server: {why}. "
                            f"Install it with: pip install faster-whisper")
    _prune()

    handle, path = tempfile.mkstemp(prefix="signtalk-", suffix=_safe_suffix(media.filename))
    size = 0
    try:
        with os.fdopen(handle, "wb") as fh:
            while chunk := await media.read(1024 * 1024):
                size += len(chunk)
                if size > MAX_UPLOAD:
                    raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                                        "That file is too large to transcribe here (200 MB max).")
                fh.write(chunk)
    except HTTPException:
        os.unlink(path)
        raise
    if size == 0:
        os.unlink(path)
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "The upload was empty.")

    job_id = uuid.uuid4().hex
    with _jobs_lock:
        _jobs[job_id] = {"owner": str(user.id), "status": "queued", "progress": 0.0,
                         "result": None, "error": None, "created": time.time(),
                         "bytes": size}
    threading.Thread(target=_run, args=(job_id, path, language.strip() or None),
                     name=f"transcribe-{job_id[:8]}", daemon=True).start()
    return {"jobId": job_id, "bytes": size}


@router.get("/jobs/{job_id}")
def job(job_id: str, user=Depends(current_user)):
    with _jobs_lock:
        found = _jobs.get(job_id)
        if found is None or found["owner"] != str(user.id):
            raise HTTPException(status.HTTP_404_NOT_FOUND, "No such transcription job.")
        return {"status": found["status"], "progress": round(found["progress"], 3),
                "result": found["result"], "error": found["error"]}
