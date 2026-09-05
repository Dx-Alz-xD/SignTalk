"""Data shapes held in memory. Nothing here is written to disk."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def mask_email(email: str) -> str:
    """example@gmail.com -> e*****e@gmail.com

    Used whenever we echo an address back, so a shoulder-surfer at the demo
    table does not read the full address off the screen.
    """
    local, _, domain = email.partition("@")
    if not domain:
        return "***"
    if len(local) <= 2:
        return f"{'*' * len(local)}@{domain}"
    return f"{local[0]}{'*' * (len(local) - 2)}{local[-1]}@{domain}"


def mask_phone(phone: str) -> str:
    """+919812345678 -> +91******5678"""
    if len(phone) <= 6:
        return "*" * len(phone)
    return f"{phone[:3]}{'*' * (len(phone) - 7)}{phone[-4:]}"


@dataclass
class User:
    username: str
    email: str
    password_hash: str
    phone: str | None = None
    created_at: datetime = field(default_factory=utcnow)
    failed_attempts: int = 0
    locked_until: datetime | None = None
    last_login_at: datetime | None = None

    @property
    def is_locked(self) -> bool:
        return self.locked_until is not None and self.locked_until > utcnow()

    @property
    def lock_seconds_left(self) -> int:
        if not self.is_locked:
            return 0
        return int((self.locked_until - utcnow()).total_seconds()) + 1

    @property
    def masked_email(self) -> str:
        return mask_email(self.email)

    @property
    def masked_phone(self) -> str | None:
        return mask_phone(self.phone) if self.phone else None


@dataclass
class OtpChallenge:
    """A pending verification code. The code itself is only stored hashed."""

    challenge_id: str
    email: str
    channel: str  # "email" or "sms"
    destination: str  # the address or number it was actually sent to
    code_hash: bytes
    salt: bytes
    expires_at: datetime
    attempts_left: int
    created_at: datetime = field(default_factory=utcnow)
    consumed: bool = False

    @property
    def is_expired(self) -> bool:
        return utcnow() >= self.expires_at

    @property
    def seconds_left(self) -> int:
        return max(0, int((self.expires_at - utcnow()).total_seconds()))


@dataclass
class RecoveryTicket:
    """Proof that someone just passed a code challenge for this account.

    Minted the moment a code verifies, which lets the code be burned
    immediately. The ticket then authorises exactly one follow-up action -
    setting a new password, or opening a session without one.
    """

    ticket_id: str
    email: str
    channel: str
    expires_at: datetime
    created_at: datetime = field(default_factory=utcnow)
    consumed: bool = False

    @property
    def is_expired(self) -> bool:
        return utcnow() >= self.expires_at

    @property
    def minutes_left(self) -> int:
        return max(0, int((self.expires_at - utcnow()).total_seconds() // 60))


@dataclass
class Session:
    token: str
    email: str
    username: str
    method: str  # "password" or "recovery_code"
    issued_at: datetime
    expires_at: datetime

    @property
    def is_expired(self) -> bool:
        return utcnow() >= self.expires_at

    @property
    def minutes_left(self) -> int:
        return max(0, int((self.expires_at - utcnow()).total_seconds() // 60))
