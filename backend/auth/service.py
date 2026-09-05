"""AuthService - all of the auth rules live here.

The CLI is only a driver for this class. Anything else in SignTalk (a REST
layer, the desktop app, the translation service) can import AuthService and
get identical behaviour.

Recovery flow, end to end:

    request_recovery_code(email, channel)  ->  code sent by email or SMS
    verify_recovery_code(challenge_id, code)  ->  ticket
    then EITHER reset_password_with_ticket(ticket, new_password)
         OR     sign_in_with_ticket(ticket)          (passwordless)

Passwordless sign-in is deliberately reachable only through that flow - it
is an outcome of proving you control the inbox or phone, not a standing
alternative to the password on the main menu.
"""

from __future__ import annotations

import os
from datetime import timedelta
from functools import lru_cache

from . import security
from .delivery import CHANNEL_EMAIL, CHANNEL_SMS, CHANNELS, Courier, DeliveryError
from .errors import (
    AccountLockedError,
    ChallengeError,
    DuplicateAccountError,
    InvalidCredentialsError,
    SessionError,
    ValidationError,
)
from .models import OtpChallenge, RecoveryTicket, Session, User, utcnow
from .store import InMemoryStore

# Seeded demo account - the credentials to use when showing this off.
DEMO_EMAIL = "example@gmail.com"
DEMO_PASSWORD = "123456"
DEMO_USERNAME = "demo"
DEMO_PHONE = "+15555550100"  # reserved-for-fiction number; override with SIGNTALK_DEMO_PHONE


@lru_cache(maxsize=1)
def _decoy_hash() -> str:
    """A real hash to check against when no account matches.

    Verifying this costs the same as verifying a genuine one, so a missing
    account and a wrong password take the same time to answer.
    """
    return security.hash_password("signtalk-timing-equalizer")


class AuthService:
    # Brute-force protection
    MAX_FAILED_ATTEMPTS = 5
    LOCKOUT_SECONDS = 300  # 5 minutes

    # One-time codes
    OTP_TTL_SECONDS = 300  # 5 minutes
    OTP_MAX_ATTEMPTS = 3

    # A verified code becomes a ticket, good for one follow-up action.
    TICKET_TTL_SECONDS = 600  # 10 minutes

    # Sessions
    SESSION_TTL_MINUTES = 30

    def __init__(
        self,
        # Any object with the store.py interface - InMemoryStore for the CLI
        # and tests, PostgresStore for the API.
        store=None,
        courier: Courier | None = None,
        *,
        seed_demo_account: bool = True,
    ) -> None:
        self.store = store or InMemoryStore()
        self.courier = courier or Courier()
        self.current_session: Session | None = None
        if seed_demo_account:
            self._seed_demo_account()

    def _seed_demo_account(self) -> None:
        """Pre-load the credentials the judges will type in."""
        if self.store.email_taken(DEMO_EMAIL):
            return
        phone = security.normalize_phone(os.environ.get("SIGNTALK_DEMO_PHONE") or DEMO_PHONE)
        self.store.add_user(
            User(
                username=DEMO_USERNAME,
                email=security.normalize_email(DEMO_EMAIL),
                password_hash=security.hash_password(DEMO_PASSWORD),
                phone=phone if security.is_valid_phone(phone) else None,
            )
        )

    # --- sign up ------------------------------------------------------------

    def sign_up(
        self, username: str, email: str, password: str, phone: str | None = None
    ) -> User:
        username = username.strip()
        email = security.normalize_email(email)

        if not security.is_valid_username(username):
            raise ValidationError(
                "Username must be 3-20 characters: letters, digits, dot, dash or underscore."
            )
        if not security.is_valid_email(email):
            raise ValidationError("That does not look like a valid email address.")
        if len(password) < security.MIN_PASSWORD_LENGTH:
            raise ValidationError(
                f"Password must be at least {security.MIN_PASSWORD_LENGTH} characters."
            )

        normalized_phone = None
        if phone:
            normalized_phone = security.normalize_phone(phone)
            if not security.is_valid_phone(normalized_phone):
                raise ValidationError(
                    "Phone must be in international format, e.g. +919812345678."
                )

        if self.store.email_taken(email):
            raise DuplicateAccountError("An account with that email already exists.")
        if self.store.username_taken(username):
            raise DuplicateAccountError("That username is taken.")

        return self.store.add_user(
            User(
                username=username,
                email=email,
                password_hash=security.hash_password(password),
                phone=normalized_phone,
            )
        )

    # --- password sign in ---------------------------------------------------

    def sign_in(self, email_or_username: str, password: str) -> Session:
        identifier = email_or_username.strip()
        user = self.store.get_user_by_email(identifier) or self.store.get_user_by_username(
            identifier
        )

        if user is not None and user.is_locked:
            raise AccountLockedError(
                f"Account locked after {self.MAX_FAILED_ATTEMPTS} failed attempts. "
                f"Try again in {user.lock_seconds_left}s."
            )

        stored_hash = user.password_hash if user else _decoy_hash()
        password_ok = security.verify_password(password, stored_hash)

        if user is None or not password_ok:
            if user is not None:
                self._register_failure(user)
            # Same message either way - never confirm which emails are registered.
            raise InvalidCredentialsError("Invalid credentials. Check your email and password.")

        # Free upgrade path: re-hash with the current algorithm and parameters
        # while we still have the plaintext in hand.
        if security.needs_rehash(user.password_hash):
            user.password_hash = security.hash_password(password)

        return self._start_session(user, method="password")

    def _register_failure(self, user: User) -> None:
        user.failed_attempts += 1
        if user.failed_attempts >= self.MAX_FAILED_ATTEMPTS:
            user.locked_until = utcnow() + timedelta(seconds=self.LOCKOUT_SECONDS)
            user.failed_attempts = 0
        self.store.persist_user(user)

    def attempts_left(self, email_or_username: str) -> int | None:
        user = self.store.get_user_by_email(email_or_username) or self.store.get_user_by_username(
            email_or_username
        )
        if user is None:
            return None
        return max(0, self.MAX_FAILED_ATTEMPTS - user.failed_attempts)

    # --- account recovery: send a code --------------------------------------

    def request_recovery_code(self, email: str, channel: str) -> str | None:
        """Send a one-time code to the account's email or phone.

        Returns a challenge id, or None when there is nothing to send to -
        no such account, or SMS was asked for and no number is on file.
        Callers must show the same message either way; the return value
        drives the flow, not the wording.
        """
        if channel not in CHANNELS:
            raise ValidationError(f"Unknown delivery channel: {channel}")

        email = security.normalize_email(email)
        if not security.is_valid_email(email):
            raise ValidationError("That does not look like a valid email address.")

        user = self.store.get_user_by_email(email)
        if user is None:
            return None

        destination = user.email if channel == CHANNEL_EMAIL else user.phone
        if not destination:
            return None  # SMS requested but no number on the account

        # A fresh code retires anything still outstanding for this account.
        self.store.invalidate_challenges_for(email)

        code = security.generate_otp()
        salt = security.new_salt()
        challenge = OtpChallenge(
            challenge_id=security.generate_token(12),
            email=email,
            channel=channel,
            destination=destination,
            code_hash=security.hash_otp(code, salt),
            salt=salt,
            expires_at=utcnow() + timedelta(seconds=self.OTP_TTL_SECONDS),
            attempts_left=self.OTP_MAX_ATTEMPTS,
        )

        # Only record the challenge once delivery actually succeeded, so a
        # failed send does not leave a code the user never received.
        self.courier.send_code(channel, destination, code, self.OTP_TTL_SECONDS)
        self.store.add_challenge(challenge)
        return challenge.challenge_id

    # --- account recovery: verify the code ----------------------------------

    def verify_recovery_code(self, challenge_id: str, code: str) -> str:
        """Check the code and, on success, mint a single-use recovery ticket.

        The code is burned here, so it can never be replayed. Whatever the
        user does next is authorised by the ticket instead.
        """
        challenge = self.store.get_challenge(challenge_id)
        if challenge is None or challenge.consumed:
            raise ChallengeError("That code is no longer valid. Request a new one.")
        if challenge.is_expired:
            self.store.drop_challenge(challenge_id)
            raise ChallengeError("That code has expired. Request a new one.")

        if not security.verify_otp(code.strip(), challenge.salt, challenge.code_hash):
            challenge.attempts_left -= 1
            if challenge.attempts_left <= 0:
                self.store.drop_challenge(challenge_id)
                raise ChallengeError("Too many wrong codes. Request a new one.")
            # Must be written before we return, or a persistent store would
            # hand out a fresh 3 attempts on the next guess.
            self.store.persist_challenge(challenge)
            raise ChallengeError(f"Incorrect code. {challenge.attempts_left} attempt(s) left.")

        challenge.consumed = True
        self.store.drop_challenge(challenge_id)

        ticket = self.store.add_ticket(
            RecoveryTicket(
                ticket_id=security.generate_token(),
                email=challenge.email,
                channel=challenge.channel,
                expires_at=utcnow() + timedelta(seconds=self.TICKET_TTL_SECONDS),
            )
        )
        return ticket.ticket_id

    def _claim_ticket(self, ticket_id: str) -> tuple[RecoveryTicket, User]:
        """Validate a ticket without spending it - see _burn_ticket."""
        ticket = self.store.get_ticket(ticket_id)
        if ticket is None or ticket.consumed:
            raise ChallengeError("That verification has already been used. Start again.")
        if ticket.is_expired:
            self.store.drop_ticket(ticket_id)
            raise ChallengeError("That verification expired. Start again.")
        user = self.store.get_user_by_email(ticket.email)
        if user is None:
            raise InvalidCredentialsError("That account no longer exists.")
        return ticket, user

    def _burn_ticket(self, ticket: RecoveryTicket) -> None:
        ticket.consumed = True
        self.store.drop_ticket(ticket.ticket_id)

    # --- account recovery: the two things a ticket can buy ------------------

    def reset_password_with_ticket(self, ticket_id: str, new_password: str) -> User:
        """Outcome A: set a new password."""
        ticket, user = self._claim_ticket(ticket_id)

        if len(new_password) < security.MIN_PASSWORD_LENGTH:
            # Ticket survives - the user just needs a longer password.
            raise ValidationError(
                f"Password must be at least {security.MIN_PASSWORD_LENGTH} characters."
            )
        if security.verify_password(new_password, user.password_hash):
            raise ValidationError("New password must be different from the old one.")

        self._burn_ticket(ticket)
        user.password_hash = security.hash_password(new_password)
        # A reset clears any lockout and kicks out every existing session.
        user.failed_attempts = 0
        user.locked_until = None
        self.store.persist_user(user)
        self.store.drop_sessions_for(user.email)
        if self.current_session and self.current_session.email == user.email:
            self.current_session = None
        return user

    def sign_in_with_ticket(self, ticket_id: str) -> Session:
        """Outcome B: sign in this once, password untouched."""
        ticket, user = self._claim_ticket(ticket_id)
        if user.is_locked:
            raise AccountLockedError(f"Account locked. Try again in {user.lock_seconds_left}s.")
        self._burn_ticket(ticket)
        return self._start_session(user, method="recovery_code")

    # --- sessions -----------------------------------------------------------

    def _start_session(self, user: User, *, method: str) -> Session:
        user.failed_attempts = 0
        user.locked_until = None
        user.last_login_at = utcnow()
        # Also flushes a password_hash that sign_in may have just upgraded.
        self.store.persist_user(user)
        now = utcnow()
        session = self.store.add_session(
            Session(
                token=security.generate_token(),
                email=user.email,
                username=user.username,
                method=method,
                issued_at=now,
                expires_at=now + timedelta(minutes=self.SESSION_TTL_MINUTES),
            )
        )
        self.current_session = session
        return session

    # The CLI keeps one signed-in user in `current_session`. HTTP has no such
    # thing - each request arrives with its own cookie - so these two resolve a
    # session from a token instead of from instance state. Same store, same
    # rules, no shared mutable state between concurrent requests.

    def resolve_session(self, token: str) -> Session:
        """Look up a session by its token. Raises SessionError if unusable."""
        if not token:
            raise SessionError("You are not signed in.")
        session = self.store.get_session(token)
        if session is None:
            raise SessionError("You are not signed in.")
        if session.is_expired:
            self.store.drop_session(token)
            raise SessionError("Your session expired. Sign in again.")
        self.store.touch_session(token)
        return session

    def sign_out_token(self, token: str) -> None:
        """Revoke one session by token. Idempotent - signing out twice is fine."""
        if token:
            self.store.drop_session(token)

    def whoami(self) -> Session:
        session = self.current_session
        if session is None:
            raise SessionError("You are not signed in.")
        if session.is_expired:
            self.store.drop_session(session.token)
            self.current_session = None
            raise SessionError("Your session expired. Sign in again.")
        return session

    def sign_out(self) -> None:
        if self.current_session is None:
            raise SessionError("You are not signed in.")
        self.store.drop_session(self.current_session.token)
        self.current_session = None
