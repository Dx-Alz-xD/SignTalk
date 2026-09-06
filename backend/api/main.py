"""FastAPI application.

    uvicorn backend.api.main:app --reload --port 8000

Run it from the repo root - the detector package is imported from there.
"""

from __future__ import annotations

import os

from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .. import db, library
from ..auth import (
    AccountLockedError,
    AuthError,
    ChallengeError,
    DeliveryError,
    DuplicateAccountError,
    InvalidCredentialsError,
    SessionError,
    ValidationError,
)
from ..config import load_env_file
from . import (routes_auth, routes_library, routes_preferences, routes_training,
               routes_users, routes_video)

load_env_file()

@asynccontextmanager
async def lifespan(_app: FastAPI):
    # Pick the database now rather than on the first request, so a misconfigured
    # DATABASE_URL fails at startup where someone is watching the terminal.
    print(f"  [db] {db.describe()}")
    # Built-in languages (the ISL alphabet) are imported once, in the
    # background, if their dataset is on this machine. See backend/builtin.py.
    from .. import builtin
    builtin.startup()
    yield
    # Hand the pooled connections back on the way out, so a reload does not
    # leak them.
    db.close_pool()


app = FastAPI(
    title="SignTalk API",
    version="1.0.0",
    description="Accounts, sign library and gesture training for SignTalk.",
    lifespan=lifespan,
)

# The two Next apps run on their own ports in development. Credentials are on
# because the session is a cookie, and that requires explicit origins -
# "*" is rejected by browsers alongside credentials.
DEFAULT_ORIGINS = [
    "http://localhost:3000", "http://127.0.0.1:3000",
    "http://localhost:3001", "http://127.0.0.1:3001",
]
origins = [o.strip() for o in os.environ.get("SIGNTALK_ORIGINS", "").split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins or DEFAULT_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# --------------------------------------------------------- error translation --
# Each typed error from the service maps to one status code, so the frontend
# can branch on the code and still show the service's own wording.

_STATUS = {
    ValidationError: status.HTTP_400_BAD_REQUEST,
    DuplicateAccountError: status.HTTP_409_CONFLICT,
    InvalidCredentialsError: status.HTTP_401_UNAUTHORIZED,
    AccountLockedError: status.HTTP_423_LOCKED,
    ChallengeError: status.HTTP_400_BAD_REQUEST,
    SessionError: status.HTTP_401_UNAUTHORIZED,
}


@app.exception_handler(AuthError)
def handle_auth_error(_request: Request, exc: AuthError):
    return JSONResponse(
        status_code=_STATUS.get(type(exc), status.HTTP_400_BAD_REQUEST),
        content={"error": exc.message, "code": type(exc).__name__},
    )


@app.exception_handler(DeliveryError)
def handle_delivery_error(_request: Request, exc: DeliveryError):
    return JSONResponse(
        status_code=status.HTTP_502_BAD_GATEWAY,
        content={"error": "Could not send the code right now. Try again.",
                 "code": "DeliveryError", "detail": str(exc)},
    )


@app.exception_handler(library.NotFound)
def handle_not_found(_request: Request, exc: library.NotFound):
    return JSONResponse(status_code=status.HTTP_404_NOT_FOUND,
                        content={"error": str(exc), "code": "NotFound"})


@app.exception_handler(library.Conflict)
def handle_conflict(_request: Request, exc: library.Conflict):
    return JSONResponse(status_code=status.HTTP_409_CONFLICT,
                        content={"error": str(exc), "code": "Conflict"})


@app.exception_handler(ValueError)
def handle_value_error(_request: Request, exc: ValueError):
    return JSONResponse(status_code=status.HTTP_400_BAD_REQUEST,
                        content={"error": str(exc), "code": "ValueError"})


# -------------------------------------------------------------------- routes --

app.include_router(routes_auth.router)
app.include_router(routes_library.router)
app.include_router(routes_training.router)
app.include_router(routes_users.router)
app.include_router(routes_video.router)
app.include_router(routes_preferences.router)


@app.get("/models/hand_landmarker.task")
def hand_landmarker_model():
    """Serve the MediaPipe model the browser tracker loads.

    Served from here rather than Google's CDN so the trainer keeps working
    offline and on a locked-down network, and so the browser and the desktop
    detector are provably running the same model file.
    """
    from fastapi.responses import FileResponse

    from detector.models import HAND_LANDMARKER, ensure_hand_landmarker

    path = ensure_hand_landmarker(quiet=True) or HAND_LANDMARKER
    if not path.exists():
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content={"error": "Hand model is not downloaded on the server."},
        )
    return FileResponse(
        path,
        media_type="application/octet-stream",
        headers={"Cache-Control": "public, max-age=604800"},
    )


@app.get("/health")
def health():
    """Is the server usable, and which optional parts are installed here?

    The frontend shows the capability list in Settings, so a missing piece
    reads as "not installed on this server" rather than as a broken feature.
    """
    ok, message = db.healthcheck()

    from .. import import_dataset, transcribe

    speech_ok, speech_why = transcribe.available()
    import_ok, import_why = import_dataset.available()
    try:
        import PIL  # noqa: F401
        pictures_ok, pictures_why = True, ""
    except ImportError as exc:
        pictures_ok, pictures_why = False, str(exc)

    return JSONResponse(
        status_code=status.HTTP_200_OK if ok else status.HTTP_503_SERVICE_UNAVAILABLE,
        content={
            "ok": ok,
            "database": message,
            "engine": db.engine_name() if ok else None,
            "version": app.version,
            "capabilities": {
                "speechToText": {"available": speech_ok,
                                 "detail": transcribe.model_name() if speech_ok else speech_why},
                "datasetImport": {"available": import_ok,
                                  "detail": "mediapipe" if import_ok else import_why},
                "signSkeletons": {"available": pictures_ok,
                                  "detail": "pillow" if pictures_ok else pictures_why},
            },
        },
    )


