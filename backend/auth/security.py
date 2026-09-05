"""Hashing, code generation and input rules.

Passwords are hashed with Argon2id (winner of the Password Hashing
Competition, and what OWASP recommends first). If argon2-cffi is not
installed the module falls back to PBKDF2-HMAC-SHA256 so the app still runs
on a bare Python - see ALGORITHM_LABEL for which one is live.

Hashes are self-describing, so both formats can be verified regardless of
which one is active, and a PBKDF2 hash is transparently upgraded to Argon2id
the next time that user signs in.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import re
import secrets

# --- Argon2id (preferred) ---------------------------------------------------

try:
    from argon2 import PasswordHasher
    from argon2 import Type as _Argon2Type
    from argon2.exceptions import Argon2Error, InvalidHashError

    # OWASP's second recommended profile: 64 MiB of memory, 3 passes.
    # Memory hardness is the point - it is what makes GPU cracking expensive.
    _ARGON2 = PasswordHasher(
        time_cost=3,
        memory_cost=64 * 1024,  # KiB
        parallelism=4,
        hash_len=32,
        salt_len=16,
        type=_Argon2Type.ID,
    )
    ARGON2_AVAILABLE = True
except ImportError:  # pragma: no cover - only on a machine without the wheel
    _ARGON2 = None
    Argon2Error = InvalidHashError = Exception
    ARGON2_AVAILABLE = False

ALGORITHM_LABEL = "argon2id (m=64MiB, t=3, p=4)" if ARGON2_AVAILABLE else "pbkdf2_sha256 (200k)"

# --- PBKDF2 fallback --------------------------------------------------------

_PBKDF2_ALGORITHM = "pbkdf2_sha256"
_PBKDF2_ITERATIONS = 200_000
_SALT_BYTES = 16

# --- input rules ------------------------------------------------------------

MIN_PASSWORD_LENGTH = 6
_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[a-zA-Z]{2,}$")
_USERNAME_RE = re.compile(r"^[a-zA-Z0-9._-]{3,20}$")
_PHONE_RE = re.compile(r"^\+[1-9]\d{7,14}$")  # E.164


def _pbkdf2_hash(password: str, salt: bytes) -> str:
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, _PBKDF2_ITERATIONS)
    return "{}${}${}${}".format(
        _PBKDF2_ALGORITHM,
        _PBKDF2_ITERATIONS,
        base64.b64encode(salt).decode("ascii"),
        base64.b64encode(digest).decode("ascii"),
    )


def hash_password(password: str) -> str:
    """Hash a password with the strongest algorithm available."""
    if ARGON2_AVAILABLE:
        return _ARGON2.hash(password)
    return _pbkdf2_hash(password, secrets.token_bytes(_SALT_BYTES))


def _verify_pbkdf2(password: str, encoded: str) -> bool:
    try:
        algorithm, iterations, b64_salt, b64_digest = encoded.split("$")
        if algorithm != _PBKDF2_ALGORITHM:
            return False
        salt = base64.b64decode(b64_salt)
        expected = base64.b64decode(b64_digest)
        rounds = int(iterations)
    except (ValueError, TypeError):
        return False
    candidate = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, rounds)
    # compare_digest avoids leaking how many leading bytes matched.
    return hmac.compare_digest(candidate, expected)


def verify_password(password: str, encoded: str) -> bool:
    """Check a password against a stored hash of either supported format."""
    if encoded.startswith("$argon2"):
        if not ARGON2_AVAILABLE:
            return False
        try:
            return _ARGON2.verify(encoded, password)
        except (Argon2Error, InvalidHashError, ValueError):
            # Covers a wrong password and a corrupt hash alike.
            return False
    return _verify_pbkdf2(password, encoded)


def needs_rehash(encoded: str) -> bool:
    """True when a stored hash should be regenerated on next successful login.

    Catches both a legacy PBKDF2 hash and an Argon2id hash made with weaker
    parameters than the ones configured above.
    """
    if not ARGON2_AVAILABLE:
        return False
    if not encoded.startswith("$argon2"):
        return True
    try:
        return _ARGON2.check_needs_rehash(encoded)
    except (Argon2Error, InvalidHashError, ValueError):
        return True


def describe_hash(encoded: str) -> str:
    """Short human label for a stored hash - used by the dev account view."""
    if encoded.startswith("$argon2id"):
        return "argon2id"
    if encoded.startswith("$argon2"):
        return "argon2 (non-id)"
    if encoded.startswith(_PBKDF2_ALGORITHM):
        return "pbkdf2_sha256"
    return "unknown"


# --- one-time codes ---------------------------------------------------------


def generate_otp(digits: int = 6) -> str:
    """A cryptographically random numeric code, zero-padded."""
    return str(secrets.randbelow(10**digits)).zfill(digits)


def hash_otp(code: str, salt: bytes) -> bytes:
    """Codes are stored hashed too - plaintext never sits in the store."""
    return hmac.new(salt, code.encode("utf-8"), hashlib.sha256).digest()


def verify_otp(code: str, salt: bytes, expected: bytes) -> bool:
    return hmac.compare_digest(hash_otp(code, salt), expected)


def generate_token(nbytes: int = 32) -> str:
    """Opaque session / ticket token."""
    return secrets.token_urlsafe(nbytes)


def new_salt() -> bytes:
    return secrets.token_bytes(_SALT_BYTES)


# --- validation -------------------------------------------------------------


def normalize_email(email: str) -> str:
    return email.strip().lower()


def normalize_phone(phone: str) -> str:
    """Strip the punctuation people type, keep the leading +."""
    cleaned = re.sub(r"[\s()\-.]", "", phone.strip())
    if cleaned.startswith("00"):
        cleaned = "+" + cleaned[2:]
    return cleaned


def is_valid_email(email: str) -> bool:
    return bool(_EMAIL_RE.match(email.strip()))


def is_valid_username(username: str) -> bool:
    return bool(_USERNAME_RE.match(username.strip()))


def is_valid_phone(phone: str) -> bool:
    """E.164: a leading + and 8-15 digits, e.g. +919812345678."""
    return bool(_PHONE_RE.match(normalize_phone(phone)))


def password_strength(password: str) -> tuple[int, str]:
    """Score a password 0-4 with a human label. Advisory, not a gate."""
    score = 0
    if len(password) >= 8:
        score += 1
    if len(password) >= 12:
        score += 1
    if re.search(r"[A-Z]", password) and re.search(r"[a-z]", password):
        score += 1
    if re.search(r"\d", password) and re.search(r"[^A-Za-z0-9]", password):
        score += 1
    return score, ("very weak", "weak", "fair", "good", "strong")[score]
