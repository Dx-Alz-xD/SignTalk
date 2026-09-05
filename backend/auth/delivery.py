"""Getting a one-time code to a human, by email or SMS.

Both channels have a real sender and a simulated one:

  email  SmtpEmailSender   -> real mail   (set SMTP_HOST / SMTP_USER / SMTP_PASSWORD)
         ConsoleEmailSender -> drawn in the terminal
  sms    TwilioSmsSender   -> real SMS    (set TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN /
                                           TWILIO_FROM_NUMBER)
         TextbeltSmsSender -> real SMS    (set TEXTBELT_KEY - no signup needed)
         ConsoleSmsSender  -> drawn in the terminal

default_courier() picks the real sender per channel whenever its environment
variables are present, and the simulated one otherwise - so the app always
runs, with or without credentials.
"""

from __future__ import annotations

import base64
import json
import os
import smtplib
import ssl
import textwrap
import urllib.error
import urllib.parse
import urllib.request
from email.message import EmailMessage

from .models import mask_email, mask_phone

# macOS python.org builds do not trust the system keychain, so an https call
# fails with CERTIFICATE_VERIFY_FAILED unless we hand it a CA bundle.
try:
    import certifi

    _TLS = ssl.create_default_context(cafile=certifi.where())
except ImportError:  # pragma: no cover - fall back to whatever the OS trusts
    _TLS = ssl.create_default_context()

CHANNEL_EMAIL = "email"
CHANNEL_SMS = "sms"
CHANNELS = (CHANNEL_EMAIL, CHANNEL_SMS)


class DeliveryError(Exception):
    """The code could not be delivered - network, credentials, bad number."""


# --- message text -----------------------------------------------------------


def _minutes(ttl_seconds: int) -> int:
    return max(1, ttl_seconds // 60)


def email_message(code: str, ttl_seconds: int) -> tuple[str, str]:
    subject = "SignTalk verification code"
    body = (
        "Here is your SignTalk verification code.\n"
        "\n"
        f"    {code}\n"
        "\n"
        f"It expires in {_minutes(ttl_seconds)} minute(s) and can be used once.\n"
        "If you did not request this, ignore this email. Nothing has changed."
    )
    return subject, body


def sms_message(code: str, ttl_seconds: int) -> str:
    return (
        f"SignTalk: your verification code is {code}. "
        f"It expires in {_minutes(ttl_seconds)} minutes. Do not share it with anyone."
    )


# --- terminal rendering for the simulated senders ---------------------------


def _box(title: str, lines: list[str], width: int = 62) -> None:
    inner = width - 2
    rule = "+" + "-" * width + "+"

    def wrapped(line: str) -> list[str]:
        if len(line) <= inner:
            return [line]
        indent = " " * (len(line) - len(line.lstrip()))
        return textwrap.wrap(line, inner, initial_indent=indent, subsequent_indent=indent)

    print()
    print(rule)
    print("|" + title.center(width) + "|")
    print(rule)
    for line in lines:
        for part in wrapped(line):
            print("| " + part.ljust(inner) + " |")
    print(rule)
    print()


# --- email senders ----------------------------------------------------------


class EmailSender:
    live = False
    label = "email"

    def send(self, to: str, code: str, ttl_seconds: int) -> None:
        raise NotImplementedError


class ConsoleEmailSender(EmailSender):
    live = False
    label = "simulated email (printed here)"

    def __init__(self, *, show_code: bool = True) -> None:
        self.show_code = show_code
        self.outbox: list[tuple[str, str]] = []  # (to, code)

    def send(self, to: str, code: str, ttl_seconds: int) -> None:
        self.outbox.append((to, code))
        if not self.show_code:
            return
        subject, body = email_message(code, ttl_seconds)
        _box(
            "INCOMING EMAIL (simulated - nothing was sent)",
            [f"To:      {to}", f"Subject: {subject}", ""] + body.splitlines(),
        )


class SmtpEmailSender(EmailSender):
    live = True

    def __init__(self) -> None:
        self.host = os.environ["SMTP_HOST"]
        self.port = int(os.environ.get("SMTP_PORT", "587"))
        self.user = os.environ["SMTP_USER"]
        self.password = os.environ["SMTP_PASSWORD"]
        self.sender = os.environ.get("SMTP_FROM", self.user)
        self.label = f"real email via {self.host}"

    def send(self, to: str, code: str, ttl_seconds: int) -> None:
        subject, body = email_message(code, ttl_seconds)
        msg = EmailMessage()
        msg["From"] = self.sender
        msg["To"] = to
        msg["Subject"] = subject
        msg.set_content(body)
        try:
            with smtplib.SMTP(self.host, self.port, timeout=20) as smtp:
                smtp.starttls(context=_TLS)
                smtp.login(self.user, self.password)
                smtp.send_message(msg)
        except (smtplib.SMTPException, OSError) as exc:
            raise DeliveryError(f"Email could not be sent: {exc}") from exc
        print(f"  Code emailed to {mask_email(to)}.")


# --- SMS senders ------------------------------------------------------------


class SmsSender:
    live = False
    label = "sms"

    def send(self, to: str, code: str, ttl_seconds: int) -> None:
        raise NotImplementedError


class ConsoleSmsSender(SmsSender):
    live = False
    label = "simulated SMS (printed here)"

    def __init__(self, *, show_code: bool = True) -> None:
        self.show_code = show_code
        self.outbox: list[tuple[str, str]] = []  # (to, code)

    def send(self, to: str, code: str, ttl_seconds: int) -> None:
        self.outbox.append((to, code))
        if not self.show_code:
            return
        _box(
            "INCOMING SMS (simulated - nothing was sent)",
            [f"To: {to}", "", sms_message(code, ttl_seconds)],
        )


# The Twilio failures you actually hit, and what to do about each. Trial
# accounts land on 21608 constantly, and the raw API message buries the fix.
TWILIO_HINTS = {
    20003: (
        "Twilio rejected your credentials. Check TWILIO_ACCOUNT_SID starts with "
        "'AC' and that TWILIO_AUTH_TOKEN is the current one from "
        "console.twilio.com (rotating the token invalidates the old one)."
    ),
    21608: (
        "Trial accounts can only text VERIFIED numbers. Add this number at "
        "console.twilio.com -> Phone Numbers -> Verified Caller IDs, then try "
        "again."
    ),
    21211: "That 'To' number is not valid. Use international format, e.g. +919812345678.",
    21212: (
        "TWILIO_FROM_NUMBER is not valid. It must be a number Twilio gave you, "
        "in international format, e.g. +15017122661."
    ),
    21606: (
        "TWILIO_FROM_NUMBER is not an SMS-capable number on your account. Check "
        "console.twilio.com -> Phone Numbers -> Active Numbers and pick one with "
        "the SMS capability."
    ),
    21610: "That number replied STOP to your Twilio sender, so Twilio will not text it.",
    21614: "That number is not a mobile number, so it cannot receive SMS.",
    21659: (
        "TWILIO_FROM_NUMBER is a valid number but is not on your account. Use one "
        "listed under Phone Numbers -> Active Numbers."
    ),
}


class TwilioSmsSender(SmsSender):
    """Real SMS over Twilio's REST API - urllib only, no SDK dependency."""

    live = True
    BASE = "https://api.twilio.com/2010-04-01/Accounts/{sid}"

    def __init__(self) -> None:
        self.sid = os.environ["TWILIO_ACCOUNT_SID"].strip()
        self.token = os.environ["TWILIO_AUTH_TOKEN"].strip()
        self.from_number = os.environ["TWILIO_FROM_NUMBER"].strip()
        self.label = f"real SMS via Twilio (from {self.from_number})"

    # --- plumbing -----------------------------------------------------------

    def _url(self, suffix: str = "") -> str:
        return self.BASE.format(sid=urllib.parse.quote(self.sid)) + suffix

    def _auth_header(self) -> str:
        return "Basic " + base64.b64encode(f"{self.sid}:{self.token}".encode()).decode("ascii")

    def _call(self, url: str, payload: bytes | None = None) -> dict:
        request = urllib.request.Request(
            url,
            data=payload,
            headers={
                "Authorization": self._auth_header(),
                "Content-Type": "application/x-www-form-urlencoded",
            },
        )
        try:
            with urllib.request.urlopen(request, timeout=20, context=_TLS) as response:
                return json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            raise self._describe(exc) from exc
        except (urllib.error.URLError, OSError, ValueError) as exc:
            raise DeliveryError(f"Could not reach Twilio: {exc}") from exc

    def _describe(self, exc: urllib.error.HTTPError) -> DeliveryError:
        """Turn a Twilio HTTP error into something worth reading."""
        raw = exc.read().decode("utf-8", "replace")
        try:
            body = json.loads(raw)
        except ValueError:
            body = {}
        code = body.get("code")
        message = body.get("message", raw.strip() or f"HTTP {exc.code}")
        hint = TWILIO_HINTS.get(code)
        if hint is None and exc.code == 401:
            hint = TWILIO_HINTS[20003]
        detail = f"Twilio error {code}: {message}" if code else f"Twilio said: {message}"
        return DeliveryError(f"{detail}\n    -> {hint}" if hint else detail)

    # --- public -------------------------------------------------------------

    def verify_credentials(self) -> dict:
        """Check the SID/token before sending anything.

        Separates 'your credentials are wrong' from 'that recipient is not
        verified', which are otherwise easy to confuse.
        """
        account = self._call(self._url(".json"))
        return {
            "friendly_name": account.get("friendly_name", ""),
            "status": account.get("status", "unknown"),
            "type": account.get("type", "unknown"),  # "Trial" or "Full"
        }

    def send(self, to: str, code: str, ttl_seconds: int) -> None:
        payload = urllib.parse.urlencode(
            {"To": to, "From": self.from_number, "Body": sms_message(code, ttl_seconds)}
        ).encode("utf-8")
        body = self._call(self._url("/Messages.json"), payload)
        status = body.get("status", "queued")
        print(f"  Code sent to {mask_phone(to)} (Twilio says: {status}).")


class TextbeltSmsSender(SmsSender):
    """Real SMS with no account to create.

    Textbelt's free key sends one real text per day per IP - enough to prove
    the flow works on stage. TEXTBELT_KEY=textbelt uses that free quota; a
    paid key from textbelt.com lifts it. The key "textbelt_test" always
    reports success without sending, which is useful for wiring checks.
    """

    live = True
    ENDPOINT = "https://textbelt.com/text"

    def __init__(self) -> None:
        self.key = os.environ["TEXTBELT_KEY"]
        if self.key == "textbelt":
            self.label = "real SMS via Textbelt (free key: 1 per day)"
        elif self.key == "textbelt_test":
            self.label = "Textbelt dry run (reports success, sends nothing)"
        else:
            self.label = "real SMS via Textbelt (paid key)"

    def send(self, to: str, code: str, ttl_seconds: int) -> None:
        payload = urllib.parse.urlencode(
            {"phone": to, "message": sms_message(code, ttl_seconds), "key": self.key}
        ).encode("utf-8")
        try:
            with urllib.request.urlopen(
                urllib.request.Request(self.ENDPOINT, data=payload), timeout=20, context=_TLS
            ) as response:
                body = json.loads(response.read().decode("utf-8"))
        except (urllib.error.URLError, OSError, ValueError) as exc:
            raise DeliveryError(f"Could not reach Textbelt: {exc}") from exc

        if not body.get("success"):
            raise DeliveryError(
                f"Textbelt refused the message: {body.get('error', 'unknown error')}"
            )
        quota = body.get("quotaRemaining")
        suffix = f", {quota} free text(s) left today" if quota is not None else ""
        print(f"  Code sent to {mask_phone(to)}{suffix}.")


# --- routing ----------------------------------------------------------------


class Courier:
    """Routes a code to whichever channel the user picked."""

    def __init__(
        self, email_sender: EmailSender | None = None, sms_sender: SmsSender | None = None
    ) -> None:
        self.email = email_sender or ConsoleEmailSender()
        self.sms = sms_sender or ConsoleSmsSender()

    def sender_for(self, channel: str) -> EmailSender | SmsSender:
        if channel == CHANNEL_EMAIL:
            return self.email
        if channel == CHANNEL_SMS:
            return self.sms
        raise DeliveryError(f"Unknown delivery channel: {channel}")

    def send_code(self, channel: str, destination: str, code: str, ttl_seconds: int) -> None:
        self.sender_for(channel).send(destination, code, ttl_seconds)

    def is_live(self, channel: str) -> bool:
        return self.sender_for(channel).live

    def label(self, channel: str) -> str:
        return self.sender_for(channel).label


def default_courier() -> Courier:
    """Real senders where credentials exist, simulated ones everywhere else."""
    email_sender: EmailSender | None = None
    sms_sender: SmsSender | None = None

    if all(os.environ.get(k) for k in ("SMTP_HOST", "SMTP_USER", "SMTP_PASSWORD")):
        try:
            email_sender = SmtpEmailSender()
        except Exception:  # bad config must never block a demo
            email_sender = None

    twilio_keys = ("TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_FROM_NUMBER")
    if all(os.environ.get(k) for k in twilio_keys):
        try:
            sms_sender = TwilioSmsSender()
        except Exception:
            sms_sender = None
    elif os.environ.get("TEXTBELT_KEY"):
        try:
            sms_sender = TextbeltSmsSender()
        except Exception:
            sms_sender = None

    return Courier(email_sender, sms_sender)
