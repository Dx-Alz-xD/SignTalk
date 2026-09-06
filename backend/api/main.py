"""FastAPI application.

    uvicorn backend.api.main:app --reload --port 8000

Run it from the repo root - the detector package is imported from there.
"""

from __future__ import annotations

import logging
import math
import os

from contextlib import asynccontextmanager
from urllib.parse import urlsplit

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
    RateLimitedError,
    SessionError,
    ValidationError,
)
from ..config import is_production, load_env_file
from ..errors import Invalid
from ..ratelimit import http_limiter
from . import (routes_auth, routes_library, routes_preferences, routes_training,
               routes_users, routes_video)
from .deps import client_ip

load_env_file()

log = logging.getLogger("signtalk.api")

PRODUCTION = is_production()

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


# Interactive docs are a complete map of the API. Useful on a laptop, an
# invitation on a public host - so they are published only outside production.
app = FastAPI(
    title="SignTalk API",
    version="1.0.0",
    description="Accounts, sign library and gesture training for SignTalk.",
    lifespan=lifespan,
    docs_url=None if PRODUCTION else "/docs",
    redoc_url=None if PRODUCTION else "/redoc",
    openapi_url=None if PRODUCTION else "/openapi.json",
)

# The two Next apps run on their own ports in development. Credentials are on
# because the session is a cookie, and that requires explicit origins -
# "*" is rejected by browsers alongside credentials.
DEFAULT_ORIGINS = [
    "http://localhost:3000", "http://127.0.0.1:3000",
    "http://localhost:3001", "http://127.0.0.1:3001",
]
origins = [o.strip() for o in os.environ.get("SIGNTALK_ORIGINS", "").split(",") if o.strip()]

# Falling back to the localhost list in production would be silent and wrong:
# the real frontend would be refused, and the failure would look like a bug in
# the browser rather than a missing variable. Say so at startup instead.
if PRODUCTION and not origins:
    raise RuntimeError(
        "SIGNTALK_ENV is production but SIGNTALK_ORIGINS is not set. List the "
        "origins your frontend is served from, e.g. "
        "SIGNTALK_ORIGINS=https://signtalk.example.com"
    )

ALLOWED_ORIGINS = origins or DEFAULT_ORIGINS

# Middleware is applied outermost-last, so CORSMiddleware is added at the end
# of this file rather than here. Everything below runs inside it, which is what
# lets a 429 or a 403 from our own middleware still carry CORS headers - without
# that the browser reports an opaque network failure instead of the real status.


# ------------------------------------------------------------- rate limiting --

# Per client address. The per-account lockout in auth/service.py answers "many
# guesses at one account"; these answer "many requests from one source", which
# is a different attack and needs a different key.
#
# (path prefix, methods, limit, window in seconds)
_ROUTE_LIMITS = (
    # Account creation is the only unauthenticated write that leaves state
    # behind, so it is the one worth holding tightest.
    ("/auth/signup", ("POST",), 5, 3600),
    # Spraying one password across many accounts never trips a per-account
    # lockout, because no single account sees more than one failure.
    ("/auth/login", ("POST",), 20, 300),
    # Code delivery is also limited per account inside AuthService. This is the
    # other half: one source may not walk through many accounts.
    ("/auth/forgot", ("POST",), 12, 3600),
    ("/auth/password", ("POST",), 12, 3600),
    # Each of these is a 200 MB upload and a Whisper run.
    ("/video/transcribe", ("POST",), 12, 3600),
)

# A backstop for everything else, sized so it cannot fire during normal use.
# Trainer capture calls /training/encode every 80 ms, which is 12.5 requests a
# second, so anything near that rate is a real user and not an attack.
_GLOBAL_LIMIT = 2400
_GLOBAL_WINDOW = 60.0


def _too_many(wait: float) -> JSONResponse:
    seconds = max(1, math.ceil(wait))
    return JSONResponse(
        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
        content={"error": f"Too many requests. Try again in {seconds}s.",
                 "code": "RateLimited"},
        headers={"Retry-After": str(seconds)},
    )


@app.middleware("http")
async def rate_limit(request: Request, call_next):
    # A preflight carries no credentials and does no work; counting it would
    # halve the effective limit for every cross-origin call.
    if request.method == "OPTIONS":
        return await call_next(request)

    who = client_ip(request) or "unknown"
    path = request.url.path

    for prefix, methods, limit, window in _ROUTE_LIMITS:
        if request.method in methods and path.startswith(prefix):
            wait = http_limiter.retry_after(f"{prefix}:{who}", limit, float(window))
            if wait > 0:
                log.warning("Rate limited %s %s from %s", request.method, path, who)
                return _too_many(wait)
            break

    wait = http_limiter.retry_after(f"all:{who}", _GLOBAL_LIMIT, _GLOBAL_WINDOW)
    if wait > 0:
        log.warning("Global rate limit hit by %s", who)
        return _too_many(wait)
    return await call_next(request)


# --------------------------------------------------------------------- CSRF --

_UNSAFE_METHODS = frozenset({"POST", "PUT", "PATCH", "DELETE"})


@app.middleware("http")
async def check_origin(request: Request, call_next):
    """Refuse state-changing requests that a foreign page set off.

    The session cookie is SameSite=Lax, which already stops a cross-site form
    post from carrying it. This is the second layer, and it is the one that
    does not depend on the browser getting SameSite right.

    A request with no Origin and no Referer is allowed through: that is curl,
    the CLI and the test suite. It is not a hole, because a cross-site attack
    only matters when the victim's browser attaches their cookie, and a browser
    always sends Origin on a cross-origin state-changing request.
    """
    if request.method not in _UNSAFE_METHODS:
        return await call_next(request)

    origin = request.headers.get("origin")
    if not origin:
        referer = request.headers.get("referer")
        if not referer:
            return await call_next(request)
        try:
            parts = urlsplit(referer)
            origin = f"{parts.scheme}://{parts.netloc}" if parts.scheme and parts.netloc else None
        except ValueError:
            origin = None
        if not origin:
            return await call_next(request)

    if origin not in ALLOWED_ORIGINS:
        log.warning("Blocked %s %s from origin %s", request.method, request.url.path, origin)
        return JSONResponse(
            status_code=status.HTTP_403_FORBIDDEN,
            content={"error": "That request came from an origin this server does not accept.",
                     "code": "BadOrigin"},
        )
    return await call_next(request)


# ------------------------------------------------------------------ headers --

# This app answers with JSON, images and one binary model file - never HTML
# that a browser should run script from. So the policy can be the strictest
# one there is, and it stays correct however the routes grow.
_API_CSP = "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"

_SECURITY_HEADERS = {
    # Stops a browser second-guessing Content-Type - the reason an uploaded
    # "image" can otherwise come back and be run as script.
    "X-Content-Type-Options": "nosniff",
    # Legacy sibling of frame-ancestors, still honoured by older browsers.
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    # Nothing here needs the camera or microphone: the browser does the camera
    # work on the frontend origin, and only landmarks are ever sent here.
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    # The frontend is a different origin by design, so resources have to stay
    # loadable across it; the CORS rules above are what actually gate access.
    "Cross-Origin-Resource-Policy": "cross-origin",
}

# Swagger UI is HTML with its own scripts and styles, so default-src 'none'
# would leave a blank page. Docs only exist outside production anyway.
_DOC_PATHS = ("/docs", "/redoc", "/openapi.json")


@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    for header, value in _SECURITY_HEADERS.items():
        response.headers.setdefault(header, value)
    if not request.url.path.startswith(_DOC_PATHS):
        response.headers.setdefault("Content-Security-Policy", _API_CSP)
    if PRODUCTION:
        # Two years, and only in production: sent over plain HTTP on a laptop
        # it would pin localhost to HTTPS in the developer's browser.
        response.headers.setdefault(
            "Strict-Transport-Security", "max-age=63072000; includeSubDomains")
    return response


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
    RateLimitedError: status.HTTP_429_TOO_MANY_REQUESTS,
}


@app.exception_handler(AuthError)
def handle_auth_error(_request: Request, exc: AuthError):
    # Retry-After is the whole point of a 429: it tells the client how long to
    # wait instead of leaving it to guess or to spin.
    headers = {"Retry-After": str(exc.retry_after)} if isinstance(exc, RateLimitedError) else None
    return JSONResponse(
        status_code=_STATUS.get(type(exc), status.HTTP_400_BAD_REQUEST),
        content={"error": exc.message, "code": type(exc).__name__},
        headers=headers,
    )


@app.exception_handler(DeliveryError)
def handle_delivery_error(_request: Request, exc: DeliveryError):
    # The detail is an SMTP or Twilio failure: hostnames, account ids and
    # sometimes a rejected credential. Useful on a laptop, reconnaissance on a
    # public host, so it goes to the log there and only to the client here.
    log.warning("Delivery failed: %s", exc)
    content = {"error": "Could not send the code right now. Try again.",
               "code": "DeliveryError"}
    if not PRODUCTION:
        content["detail"] = str(exc)
    return JSONResponse(status_code=status.HTTP_502_BAD_GATEWAY, content=content)


@app.exception_handler(library.NotFound)
def handle_not_found(_request: Request, exc: library.NotFound):
    return JSONResponse(status_code=status.HTTP_404_NOT_FOUND,
                        content={"error": str(exc), "code": "NotFound"})


@app.exception_handler(library.Conflict)
def handle_conflict(_request: Request, exc: library.Conflict):
    return JSONResponse(status_code=status.HTTP_409_CONFLICT,
                        content={"error": str(exc), "code": "Conflict"})


@app.exception_handler(Invalid)
def handle_invalid(_request: Request, exc: Invalid):
    """Input the user can fix, in wording chosen for them. Safe to pass on."""
    return JSONResponse(status_code=status.HTTP_400_BAD_REQUEST,
                        content={"error": str(exc), "code": "Invalid"})


@app.exception_handler(ValueError)
def handle_value_error(request: Request, exc: ValueError):
    """A ValueError nobody wrote a message for - so it describes our internals.

    It still means the request was unusable, so the status is unchanged; what
    changes is that the text goes to the log rather than to the browser. If
    one of these turns out to be worth showing, raise errors.Invalid instead.
    """
    log.exception("Unhandled ValueError on %s %s", request.method, request.url.path)
    if PRODUCTION:
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content={"error": "That request could not be processed.",
                     "code": "ValueError"})
    return JSONResponse(status_code=status.HTTP_400_BAD_REQUEST,
                        content={"error": str(exc), "code": "ValueError"})


# ---------------------------------------------------------------------- CORS --

# Added last on purpose, which makes it the outermost layer: every response,
# including one our own middleware returns early, passes back out through it
# and picks up the CORS headers. Added earlier it would sit inside the rate
# limiter, and a browser would see a 429 as an unexplained network error.
#
# Credentials are on because the session is a cookie, and that requires
# explicit origins - "*" is rejected by browsers alongside credentials.
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


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


