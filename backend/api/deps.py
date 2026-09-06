"""Shared dependencies: the auth service, and who is calling."""

from __future__ import annotations

import os
from functools import lru_cache

from fastapi import Cookie, Depends, HTTPException, Request, status

from ..auth import AuthService, SessionError
from ..auth.sql_store import SqlStore
from ..config import is_production

SESSION_COOKIE = "signtalk_session"

# The session row slides forward while the app is in use (see
# AuthService.resolve_session), so the cookie is given a longer life than one
# TTL and is refreshed on every answer. It still cannot outlive the row: an
# expired session is refused whatever the browser sends.
COOKIE_MAX_AGE = AuthService.SESSION_TTL_MINUTES * 60 * 24


@lru_cache(maxsize=1)
def get_auth() -> AuthService:
    """One service for the process, over whichever database db.py picked.

    The demo account (example@gmail.com / 123456) is seeded outside production
    only. It exists so a fresh clone is usable in one step and so the judges
    have something to type, and it is a published password on a public host:
    the lockout does not slow anyone who already knows it. In production the
    first account is created through sign up like any other.
    """
    return AuthService(store=SqlStore(), seed_demo_account=not is_production())


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


@lru_cache(maxsize=1)
def trusted_proxies() -> frozenset[str]:
    """Addresses whose X-Forwarded-For we believe.

    Set SIGNTALK_TRUSTED_PROXIES to the address of your load balancer or
    reverse proxy, comma separated. Empty by default, which means the header
    is ignored entirely.
    """
    raw = os.environ.get("SIGNTALK_TRUSTED_PROXIES", "")
    return frozenset(part.strip() for part in raw.split(",") if part.strip())


def client_ip(request: Request) -> str | None:
    """The caller's address, as well as it can be known.

    X-Forwarded-For is set by whoever is closest to us and appended to by each
    hop, so any client can put whatever it likes at the front. Trusting that
    first entry means anyone can claim any address, which turns a rate limit
    keyed on this into a rate limit that never fires.

    So the header counts only when the connection itself came from a proxy we
    listed, and then we read from the right, skipping our own proxies, and
    take the first address none of them vouched for.
    """
    peer = request.client.host if request.client else None
    trusted = trusted_proxies()
    if not peer or peer not in trusted:
        # Direct connection, or a proxy we were not told about. Either way the
        # socket address is the only thing here that cannot be forged.
        return peer

    forwarded = request.headers.get("x-forwarded-for", "")
    for candidate in reversed([part.strip() for part in forwarded.split(",")]):
        if candidate and candidate not in trusted:
            return candidate
    return peer
