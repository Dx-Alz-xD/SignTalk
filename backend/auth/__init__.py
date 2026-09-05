"""SignTalk auth backend - CLI-facing account and session handling."""

from . import security
from .delivery import (
    CHANNEL_EMAIL,
    CHANNEL_SMS,
    CHANNELS,
    ConsoleEmailSender,
    ConsoleSmsSender,
    Courier,
    DeliveryError,
    SmtpEmailSender,
    TextbeltSmsSender,
    TwilioSmsSender,
    default_courier,
)
from .errors import (
    AccountLockedError,
    AuthError,
    ChallengeError,
    DuplicateAccountError,
    InvalidCredentialsError,
    SessionError,
    ValidationError,
)
from .models import OtpChallenge, RecoveryTicket, Session, User, mask_email, mask_phone
from .service import (
    DEMO_EMAIL,
    DEMO_PASSWORD,
    DEMO_PHONE,
    DEMO_USERNAME,
    AuthService,
)
from .store import InMemoryStore

__all__ = [
    "security",
    "AuthService",
    "InMemoryStore",
    "User",
    "Session",
    "OtpChallenge",
    "RecoveryTicket",
    "mask_email",
    "mask_phone",
    "Courier",
    "default_courier",
    "ConsoleEmailSender",
    "ConsoleSmsSender",
    "SmtpEmailSender",
    "TextbeltSmsSender",
    "TwilioSmsSender",
    "DeliveryError",
    "CHANNEL_EMAIL",
    "CHANNEL_SMS",
    "CHANNELS",
    "AuthError",
    "ValidationError",
    "DuplicateAccountError",
    "InvalidCredentialsError",
    "AccountLockedError",
    "ChallengeError",
    "SessionError",
    "DEMO_EMAIL",
    "DEMO_PASSWORD",
    "DEMO_PHONE",
    "DEMO_USERNAME",
]
