"""Typed errors for the SignTalk auth backend.

Every failure the CLI can show a user is one of these, so the interface layer
never has to guess what went wrong or parse a string.
"""

from __future__ import annotations


class AuthError(Exception):
    """Base class for anything the auth service refuses to do."""

    def __init__(self, message: str) -> None:
        super().__init__(message)
        self.message = message


class ValidationError(AuthError):
    """Input did not pass the format / strength rules."""


class DuplicateAccountError(AuthError):
    """Email or username is already taken."""


class InvalidCredentialsError(AuthError):
    """Wrong email or password. Deliberately vague - see service.sign_in."""


class AccountLockedError(AuthError):
    """Too many failed attempts; the account is cooling down."""


class ChallengeError(AuthError):
    """An email code was wrong, expired, already used, or out of attempts."""


class SessionError(AuthError):
    """No active session, or the session has expired."""


class RateLimitedError(AuthError):
    """Correct request, asked for too often. Try again later.

    Distinct from AccountLockedError: that one means this account is cooling
    down after wrong passwords, this one means the caller is going too fast.
    Carries the wait so the interface can say how long, and so the HTTP layer
    can put it in a Retry-After header.
    """

    def __init__(self, message: str, retry_after: int) -> None:
        super().__init__(message)
        self.retry_after = retry_after
