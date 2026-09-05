#!/usr/bin/env python3
"""End-to-end check of every auth flow. No pytest needed:

    python3 backend/smoke_test.py

Uses silent console senders and reads codes out of their outbox, which is the
same path the real CLI takes - only the delivery is captured instead of drawn.
"""

from __future__ import annotations

import os
import sys

if __package__ in (None, ""):
    sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.auth import (
    CHANNEL_EMAIL,
    CHANNEL_SMS,
    DEMO_EMAIL,
    DEMO_PASSWORD,
    DEMO_PHONE,
    AccountLockedError,
    AuthService,
    ChallengeError,
    ConsoleEmailSender,
    ConsoleSmsSender,
    Courier,
    DuplicateAccountError,
    InvalidCredentialsError,
    SessionError,
    ValidationError,
    security,
)

PASSED: list[str] = []


def check(name: str) -> None:
    PASSED.append(name)
    print(f"  \033[32mPASS\033[0m  {name}")


def expect(error_type, fn, *args, **kwargs):
    try:
        fn(*args, **kwargs)
    except error_type:
        return
    raise AssertionError(f"expected {error_type.__name__} from {fn.__name__}")


def new_service() -> tuple[AuthService, Courier]:
    courier = Courier(ConsoleEmailSender(show_code=False), ConsoleSmsSender(show_code=False))
    return AuthService(courier=courier), courier


def last_email_code(courier: Courier) -> str:
    return courier.email.outbox[-1][1]


def last_sms(courier: Courier) -> tuple[str, str]:
    return courier.sms.outbox[-1]


# --- 1. Argon2id password hashing -------------------------------------------

assert security.ARGON2_AVAILABLE, "argon2-cffi is not installed: pip install -r requirements.txt"
h = security.hash_password("123456")
assert h.startswith("$argon2id$"), h[:20]
assert security.verify_password("123456", h)
assert not security.verify_password("1234567", h)
check(f"passwords hashed with {security.ALGORITHM_LABEL}")

assert security.hash_password("samepass") != security.hash_password("samepass")
check("per-password salt: same password -> different hashes")

assert not security.needs_rehash(h)
legacy = security._pbkdf2_hash("123456", b"0123456789abcdef")
assert security.verify_password("123456", legacy), "legacy PBKDF2 hashes must still verify"
assert security.needs_rehash(legacy)
check("legacy PBKDF2 hashes still verify and are flagged for upgrade")

auth, courier = new_service()
demo = auth.store.get_user_by_email(DEMO_EMAIL)
demo.password_hash = legacy  # pretend this account predates the Argon2 switch
auth.sign_in(DEMO_EMAIL, "123456")
assert demo.password_hash.startswith("$argon2id$")
check("a PBKDF2 account is silently upgraded to Argon2id on next sign in")

# --- 2. seeded demo account -------------------------------------------------

auth, courier = new_service()
session = auth.sign_in(DEMO_EMAIL, DEMO_PASSWORD)
assert session.username == "demo" and session.method == "password"
check("demo account signs in with example@gmail.com / 123456")

assert auth.whoami().token == session.token
auth.sign_out()
expect(SessionError, auth.whoami)
check("session status and sign out")

# --- 3. sign up -------------------------------------------------------------

auth, courier = new_service()
user = auth.sign_up("aarav", "aarav@signtalk.dev", "sunflower22", "+91 98123-45678")
assert user.email == "aarav@signtalk.dev"
assert user.phone == "+919812345678", user.phone
assert user.password_hash.startswith("$argon2id$")
assert "sunflower22" not in user.password_hash
check("sign up normalises the phone number and stores only a hash")

expect(DuplicateAccountError, auth.sign_up, "someone", "AARAV@signtalk.dev", "abcdef")
expect(DuplicateAccountError, auth.sign_up, "aarav", "other@signtalk.dev", "abcdef")
expect(ValidationError, auth.sign_up, "x", "a@b.dev", "abcdef")
expect(ValidationError, auth.sign_up, "goodname", "not-an-email", "abcdef")
expect(ValidationError, auth.sign_up, "goodname", "a@b.dev", "123")
expect(ValidationError, auth.sign_up, "goodname", "a@b.dev", "abcdef", "98123")
check("duplicates, bad email/username/password and a bad phone are rejected")

assert auth.sign_up("noph", "noph@signtalk.dev", "abcdef").phone is None
check("phone is optional at sign up")

# --- 4. password sign in + lockout ------------------------------------------

expect(InvalidCredentialsError, auth.sign_in, "aarav@signtalk.dev", "wrong")
assert auth.sign_in("aarav", "sunflower22").username == "aarav"
check("sign in works by username or email, rejects a wrong password")

auth, courier = new_service()
for _ in range(AuthService.MAX_FAILED_ATTEMPTS):
    expect(InvalidCredentialsError, auth.sign_in, DEMO_EMAIL, "nope")
expect(AccountLockedError, auth.sign_in, DEMO_EMAIL, DEMO_PASSWORD)
check(f"account locks after {AuthService.MAX_FAILED_ATTEMPTS} failed attempts")

# --- 5. recovery: delivery channels -----------------------------------------

auth, courier = new_service()
cid = auth.request_recovery_code(DEMO_EMAIL, CHANNEL_EMAIL)
assert cid is not None
code = last_email_code(courier)
assert len(code) == 6 and code.isdigit()
check("recovery code can be delivered by email")

auth, courier = new_service()
cid = auth.request_recovery_code(DEMO_EMAIL, CHANNEL_SMS)
assert cid is not None
to, code = last_sms(courier)
assert to == DEMO_PHONE and len(code) == 6
assert not courier.email.outbox, "picking SMS must not also send an email"
check("recovery code can be delivered by SMS to the number on the account")

auth, courier = new_service()
auth.sign_up("nophone", "nophone@signtalk.dev", "abcdef")
assert auth.request_recovery_code("nophone@signtalk.dev", CHANNEL_SMS) is None
assert not courier.sms.outbox
check("SMS is refused when no number is on file (caller shows a generic message)")

assert auth.request_recovery_code("nobody@nowhere.dev", CHANNEL_EMAIL) is None
check("unknown address returns no challenge, and nothing is sent")

expect(ValidationError, auth.request_recovery_code, DEMO_EMAIL, "carrier-pigeon")
check("an unknown delivery channel is rejected")

# --- 6. recovery: code hardening --------------------------------------------

auth, courier = new_service()
cid = auth.request_recovery_code(DEMO_EMAIL, CHANNEL_EMAIL)
challenge = auth.store.get_challenge(cid)
assert last_email_code(courier).encode() not in challenge.code_hash
check("pending codes are stored hashed, not in plaintext")

for _ in range(AuthService.OTP_MAX_ATTEMPTS - 1):
    expect(ChallengeError, auth.verify_recovery_code, cid, "000000")
expect(ChallengeError, auth.verify_recovery_code, cid, "000000")
expect(ChallengeError, auth.verify_recovery_code, cid, last_email_code(courier))
check(f"code dies after {AuthService.OTP_MAX_ATTEMPTS} wrong guesses")

auth, courier = new_service()
first = auth.request_recovery_code(DEMO_EMAIL, CHANNEL_EMAIL)
first_code = last_email_code(courier)
second = auth.request_recovery_code(DEMO_EMAIL, CHANNEL_SMS)
expect(ChallengeError, auth.verify_recovery_code, first, first_code)
assert auth.verify_recovery_code(second, last_sms(courier)[1])
check("requesting a new code retires the previous one, across channels")

auth, courier = new_service()
cid = auth.request_recovery_code(DEMO_EMAIL, CHANNEL_EMAIL)
code = last_email_code(courier)
auth.verify_recovery_code(cid, code)
expect(ChallengeError, auth.verify_recovery_code, cid, code)
check("a code is burned the moment it verifies and cannot be replayed")

# --- 7. recovery outcome A: passwordless sign in ----------------------------

auth, courier = new_service()
cid = auth.request_recovery_code(DEMO_EMAIL, CHANNEL_SMS)
ticket = auth.verify_recovery_code(cid, last_sms(courier)[1])
session = auth.sign_in_with_ticket(ticket)
assert session.method == "recovery_code"
check("a verified code can be spent on a passwordless sign in")

assert auth.sign_in(DEMO_EMAIL, DEMO_PASSWORD).username == "demo"
check("signing in passwordlessly leaves the password untouched")

expect(ChallengeError, auth.sign_in_with_ticket, ticket)
check("a recovery ticket is single use")

# --- 8. recovery outcome B: password reset ----------------------------------

auth, courier = new_service()
live = auth.sign_in(DEMO_EMAIL, DEMO_PASSWORD)  # an open session to revoke
cid = auth.request_recovery_code(DEMO_EMAIL, CHANNEL_EMAIL)
ticket = auth.verify_recovery_code(cid, last_email_code(courier))

expect(ValidationError, auth.reset_password_with_ticket, ticket, "abc")
expect(ValidationError, auth.reset_password_with_ticket, ticket, DEMO_PASSWORD)
check("reset rejects a too-short password and reuse of the old one")

auth.reset_password_with_ticket(ticket, "skyline77")
check("the ticket survived those rejections and still worked")

expect(ChallengeError, auth.reset_password_with_ticket, ticket, "another99")
expect(InvalidCredentialsError, auth.sign_in, DEMO_EMAIL, DEMO_PASSWORD)
assert auth.sign_in(DEMO_EMAIL, "skyline77").username == "demo"
check("old password stops working, new password works, ticket is spent")

assert auth.store.get_session(live.token) is None
check("reset revokes sessions that were already open")

auth, courier = new_service()
for _ in range(AuthService.MAX_FAILED_ATTEMPTS):
    expect(InvalidCredentialsError, auth.sign_in, DEMO_EMAIL, "nope")
cid = auth.request_recovery_code(DEMO_EMAIL, CHANNEL_EMAIL)
ticket = auth.verify_recovery_code(cid, last_email_code(courier))
auth.reset_password_with_ticket(ticket, "unlocked42")
assert auth.sign_in(DEMO_EMAIL, "unlocked42").username == "demo"
check("a reset clears an existing lockout")

# --- 9. .env handling -------------------------------------------------------

import pathlib
import tempfile

from backend.config import load_env_file

env_file = pathlib.Path(tempfile.mkdtemp()) / ".env"
env_file.write_text(
    "# a comment\n"
    "SIGNTALK_TEST_BLANK=\n"           # a placeholder copied from .env.example
    "export SIGNTALK_TEST_QUOTED=\"kept\"\n"
    "SIGNTALK_TEST_PRESET=from-file\n"
    "GARBAGE_LINE_NO_EQUALS\n"
)
os.environ["SIGNTALK_TEST_PRESET"] = "from-shell"
assert load_env_file(env_file) == ["SIGNTALK_TEST_QUOTED"]
assert "SIGNTALK_TEST_BLANK" not in os.environ, "a blank value must not shadow a default"
assert os.environ["SIGNTALK_TEST_QUOTED"] == "kept"
assert os.environ["SIGNTALK_TEST_PRESET"] == "from-shell", "an exported value must win"
check(".env: blanks are skipped, quotes stripped, exported values win")

os.environ["SIGNTALK_DEMO_PHONE"] = ""  # what a copied .env.example used to do
assert new_service()[0].store.get_user_by_email(DEMO_EMAIL).phone == DEMO_PHONE
del os.environ["SIGNTALK_DEMO_PHONE"]
check("an empty SIGNTALK_DEMO_PHONE falls back to the built-in demo number")

# --- 10. nothing is persisted -----------------------------------------------

fresh, _ = new_service()
assert fresh.store.get_user_by_email("aarav@signtalk.dev") is None
assert [u.email for u in fresh.store.all_users()] == [DEMO_EMAIL]
check("new process = empty store (only the seeded demo account)")

print(f"\n  \033[1m{len(PASSED)} checks passed\033[0m\n")
