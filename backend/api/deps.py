"""Shared dependencies: the auth service, and who is calling."""

from __future__ import annotations

import os
from functools import lru_cache

from fastapi import Cookie, Depends, HTTPException, Request, status

from ..auth import AuthService, SessionError
from ..auth.sql_store import SqlStore

SESSION_COOKIE = "signtalk_session"

# The session row slides forward while the app is in use (see
# AuthService.resolve_session), so the cookie is given a longer life than one
# TTL and is refreshed on every answer. It still cannot outlive the row: an
# expired session is refused whatever the browser sends.
COOKIE_MAX_AGE = AuthService.SESSION_TTL_MINUTES * 60 * 24


@lru_cache(maxsize=1)
def get_auth() -> AuthService:
    """One service for the process, over whichever database db.py picked.

    seed_demo_account stays on so example@gmail.com / 123456 works against a
    fresh database - the same account the CLI seeds.
    """
    return AuthService(store=SqlStore(), seed_demo_account=True)


def secure_cookies() -> bool:
    """Secure flag off on localhost, where there is no TLS to attach it to."""
    return os.environ.get("SIGNTALK_ENV", "dev").lower() in ("prod", "production")


def set_session_cookie(response, token: str) -> None:
    response.set_cookie(
        SESSION_COOKIE,
        token,
        max_age=COOKIE_MAX_AGE,
        # HttpOnly is the point: script on the page cannot read the token, so
        # an XSS bug cannot walk off with the session.
        httponly=True,
        samesite="lax",
        secure=secure_cookies(),
        path="/",
    )


def clear_session_cookie(response) -> None:
    response.delete_cookie(SESSION_COOKIE, path="/")


def current_session(signtalk_session: str | None = Cookie(default=None)):
    """The caller's session, or 401. Use for anything that needs a login."""
    try:
        return get_auth().resolve_session(signtalk_session or "")
    except SessionError as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, exc.message) from exc


def current_user(session=Depends(current_session)):
    """The caller's user row. `id` is what every library query scopes by."""
    user = get_auth().store.get_user_by_email(session.email)
    if user is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "That account no longer exists.")
    return user


def client_ip(request: Request) -> str | None:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else None
