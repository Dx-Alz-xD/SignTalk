#!/usr/bin/env python3
"""Check that real email / SMS delivery is wired up - and prove it.

    python3 backend/check_delivery.py                     what is configured
    python3 backend/check_delivery.py --email you@x.com   send a real test email
    python3 backend/check_delivery.py --sms +919812345678 send a real test SMS

Use this before a demo so you find out here, not mid-flow, whether your
credentials work.
"""

from __future__ import annotations

import argparse
import os
import sys

if __package__ in (None, ""):
    sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.auth import (
    CHANNEL_EMAIL,
    CHANNEL_SMS,
    DeliveryError,
    TwilioSmsSender,
    default_courier,
    security,
)
from backend.config import load_env_file, project_root

GREEN, RED, YELLOW, DIM, RESET = "\033[32m", "\033[31m", "\033[33m", "\033[2m", "\033[0m"

HINTS = {
    CHANNEL_EMAIL: [
        "Real email needs an SMTP account. For Gmail:",
        "  1. Turn on 2-Step Verification at myaccount.google.com/security",
        "  2. Create an App Password at myaccount.google.com/apppasswords",
        "  3. Put these in .env (see .env.example):",
        "       SMTP_HOST=smtp.gmail.com",
        "       SMTP_PORT=587",
        "       SMTP_USER=you@gmail.com",
        "       SMTP_PASSWORD=the-16-character-app-password",
    ],
    CHANNEL_SMS: [
        "Real SMS over Twilio:",
        "  1. Sign up at twilio.com/try-twilio (free trial credit)",
        "  2. From console.twilio.com copy your Account SID and Auth Token",
        "  3. Get a number: Phone Numbers -> Buy a number (SMS capable),",
        "     or use the trial number Twilio already gave you",
        "  4. TRIAL ONLY: verify the phone you want to text, under",
        "     Phone Numbers -> Verified Caller IDs. Trial accounts refuse",
        "     to send anywhere else.",
        "  5. Put these in .env:",
        "       TWILIO_ACCOUNT_SID=ACxxxxxxxx",
        "       TWILIO_AUTH_TOKEN=xxxxxxxx",
        "       TWILIO_FROM_NUMBER=+15017122661",
    ],
}


def preflight_twilio() -> bool:
    """Check the SID/token on their own, before blaming the recipient."""
    if not all(
        os.environ.get(k)
        for k in ("TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_FROM_NUMBER")
    ):
        return True  # not configured; nothing to preflight

    print(f"\n  Checking Twilio credentials...")
    try:
        account = TwilioSmsSender().verify_credentials()
    except DeliveryError as exc:
        print(f"  {RED}FAILED: {exc}{RESET}")
        return False

    name = account["friendly_name"] or "(unnamed)"
    print(f"  {GREEN}Credentials OK.{RESET} Account: {name} [{account['type']}, "
          f"{account['status']}]")
    if account["type"].lower() == "trial":
        print(f"  {YELLOW}Trial account: you can only text numbers verified under{RESET}")
        print(f"  {YELLOW}Phone Numbers -> Verified Caller IDs, and Twilio prepends{RESET}")
        print(f"  {YELLOW}\"Sent from your Twilio trial account\" to every message.{RESET}")
    return True


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--email", metavar="ADDRESS", help="send a real test email here")
    parser.add_argument("--sms", metavar="+E164", help="send a real test SMS here")
    args = parser.parse_args()

    loaded = load_env_file()
    env_file = project_root() / ".env"
    print()
    if loaded:
        print(f"  Loaded {len(loaded)} setting(s) from {env_file}: {', '.join(loaded)}")
    elif env_file.is_file():
        print(f"  {DIM}{env_file} exists but set nothing new (already exported?){RESET}")
    else:
        print(f"  {DIM}No .env at {env_file} - copy .env.example to .env to add credentials.{RESET}")

    courier = default_courier()
    print(f"\n  {'CHANNEL':<8} {'STATUS':<12} SENDER")
    for channel in (CHANNEL_EMAIL, CHANNEL_SMS):
        live = courier.is_live(channel)
        status = f"{GREEN}live{RESET}" if live else f"{YELLOW}simulated{RESET}"
        padding = 12 + len(status) - len("simulated" if not live else "live")
        print(f"  {channel:<8} {status:<{padding}} {courier.label(channel)}")
    print(f"\n  {DIM}Passwords: {security.ALGORITHM_LABEL}{RESET}")

    targets = [(CHANNEL_EMAIL, args.email), (CHANNEL_SMS, args.sms)]
    targets = [(channel, dest) for channel, dest in targets if dest]

    if not targets:
        for channel in (CHANNEL_EMAIL, CHANNEL_SMS):
            if not courier.is_live(channel):
                print(f"\n  {YELLOW}{channel} is simulated.{RESET}")
                for line in HINTS[channel]:
                    print(f"    {line}")
        print(f"\n  {DIM}Then prove it: python3 backend/check_delivery.py "
              f"--email you@gmail.com --sms +919812345678{RESET}\n")
        return 0

    failures = 0
    if any(channel == CHANNEL_SMS for channel, _ in targets) and not preflight_twilio():
        return 1

    for channel, destination in targets:
        if channel == CHANNEL_SMS and not security.is_valid_phone(destination):
            print(f"\n  {RED}{destination} is not in international format "
                  f"(e.g. +919812345678).{RESET}")
            failures += 1
            continue
        if channel == CHANNEL_EMAIL and not security.is_valid_email(destination):
            print(f"\n  {RED}{destination} is not a valid email address.{RESET}")
            failures += 1
            continue
        if not courier.is_live(channel):
            print(f"\n  {YELLOW}{channel} is still simulated - this will print, "
                  f"not send.{RESET}")

        code = security.generate_otp()
        print(f"\n  Sending a test {channel} to {destination}...")
        try:
            courier.send_code(channel, destination, code, 300)
        except DeliveryError as exc:
            print(f"  {RED}FAILED: {exc}{RESET}")
            for line in HINTS[channel]:
                print(f"    {line}")
            failures += 1
            continue
        print(f"  {GREEN}Sent.{RESET} The code in that message should be {code}.")

    print()
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
