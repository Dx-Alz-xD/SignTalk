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
from . import routes_auth, routes_library, routes_training

load_env_file()

@asynccontextmanager
async def lifespan(_app: FastAPI):
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
    ok, message = db.healthcheck()
    return JSONResponse(
        status_code=status.HTTP_200_OK if ok else status.HTTP_503_SERVICE_UNAVAILABLE,
        content={"ok": ok, "database": message},
    )


