#!/usr/bin/env python3
"""SignTalk - command line authentication front door.

Run it:
    python3 backend/cli.py
    (or)  python3 -m backend.cli

Accounts live in memory only. Quitting wipes everything.
"""

from __future__ import annotations

import getpass
import os
import sys

if __package__ in (None, ""):  # allow `python3 backend/cli.py`
    sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.config import load_env_file
from backend.auth import (
    CHANNEL_EMAIL,
    CHANNEL_SMS,
    DEMO_EMAIL,
    DEMO_PASSWORD,
    AuthError,
    AuthService,
    DeliveryError,
    default_courier,
    security,
)

# --- terminal helpers -------------------------------------------------------

_COLOR = sys.stdout.isatty() and not os.environ.get("NO_COLOR")


def _c(code: str, text: str) -> str:
    return f"\033[{code}m{text}\033[0m" if _COLOR else text


def bold(t: str) -> str:
    return _c("1", t)


def dim(t: str) -> str:
    return _c("2", t)


def green(t: str) -> str:
    return _c("32", t)


def red(t: str) -> str:
    return _c("31", t)


def yellow(t: str) -> str:
    return _c("33", t)


def cyan(t: str) -> str:
    return _c("36", t)


def ok(msg: str) -> None:
    print(green(f"  [OK] {msg}"))


def fail(msg: str) -> None:
    print(red(f"  [!]  {msg}"))


def info(msg: str) -> None:
    print(dim(f"       {msg}"))


class Abort(Exception):
    """User typed 'q' to back out of a flow."""


def ask(label: str, *, allow_empty: bool = False) -> str:
    while True:
        try:
            value = input(cyan(f"  {label}: ")).strip()
        except (EOFError, KeyboardInterrupt):
            raise Abort from None
        if value.lower() == "q":
            raise Abort
        if value or allow_empty:
            return value
        fail("That cannot be blank.")


def ask_secret(label: str) -> str:
    try:
        value = getpass.getpass(f"  {label}: ")
    except (EOFError, KeyboardInterrupt):
        raise Abort from None
    if value.strip().lower() == "q":
        raise Abort
    return value


def ask_choice(label: str, options: dict[str, str]) -> str:
    """Pick one key from options, showing each with its description."""
    print(bold(f"\n  {label}"))
    for key, description in options.items():
        print(f"    {cyan(key)}  {description}")
    while True:
        choice = ask("Choice")
        if choice in options:
            return choice
        fail(f"Pick one of: {', '.join(options)}")


BANNER = r"""
   ____  _            _____     _ _
  / ___|(_) __ _ _ __|_   _|_ _| | | __
  \___ \| |/ _` | '_ \ | |/ _` | | |/ /
   ___) | | (_| | | | || | (_| | |   <
  |____/|_|\__, |_| |_||_|\__,_|_|_|\_\
           |___/   sign language, translated
"""

MENU = """
  1  Sign up (new account)
  2  Sign in with password
  3  Forgot password / can't sign in
  4  Session status  (who am I)
  5  Sign out
  6  Registered accounts  (dev view)
  0  Exit
"""


# --- flows ------------------------------------------------------------------


def flow_sign_up(auth: AuthService) -> None:
    print(bold("\n  Create an account") + dim("   (type q to cancel)"))
    username = ask("Username")
    email = ask("Email")
    phone = ask(
        "Phone for SMS codes, e.g. +919812345678 (press Enter to skip)", allow_empty=True
    )
    password = ask_secret("Password")
    if password != ask_secret("Confirm password"):
        fail("Passwords did not match.")
        return

    user = auth.sign_up(username, email, password, phone or None)
    score, label = security.password_strength(password)
    ok(f"Account created for {bold(user.username)} <{user.masked_email}>.")
    if user.masked_phone:
        info(f"SMS codes will go to {user.masked_phone}.")
    else:
        info("No phone on file - recovery codes can only go to your email.")
    if score <= 1:
        print(yellow(f"       Password strength: {label}. Fine for the demo, weak for real life."))
    else:
        info(f"Password strength: {label}.")
    info(f"Password stored as {security.ALGORITHM_LABEL}. Nothing was written to disk.")


def flow_sign_in(auth: AuthService) -> None:
    print(bold("\n  Sign in") + dim("   (type q to cancel)"))
    identifier = ask("Email or username")
    password = ask_secret("Password")
    try:
        session = auth.sign_in(identifier, password)
    except AuthError:
        left = auth.attempts_left(identifier)
        if left is not None and 0 < left <= 2:
            info(f"{left} attempt(s) left before the account locks.")
        raise
    ok(f"Welcome back, {bold(session.username)}.")
    info(f"Session valid for {session.minutes_left} more minutes.")
    info("Forgot your password? Use option 3 - that is also where the")
    info("passwordless sign-in lives.")


def flow_recover(auth: AuthService) -> None:
    """Forgot password: verify by code, then reset OR sign in passwordlessly."""
    print(bold("\n  Account recovery") + dim("   (type q to cancel)"))
    email = ask("Email")

    channel = {
        "1": CHANNEL_EMAIL,
        "2": CHANNEL_SMS,
    }[
        ask_choice(
            "Where should we send your code?",
            {
                "1": f"Email  {dim('- ' + auth.courier.label(CHANNEL_EMAIL))}",
                "2": f"SMS    {dim('- ' + auth.courier.label(CHANNEL_SMS))}",
            },
        )
    ]

    try:
        challenge_id = auth.request_recovery_code(email, channel)
    except DeliveryError as exc:
        fail(str(exc))
        return

    where = "email address" if channel == CHANNEL_EMAIL else "phone"
    # Same wording whether or not the account exists - no account enumeration.
    ok(f"If an account exists with that {where}, a code is on its way.")
    if challenge_id is None:
        if not auth.courier.is_live(channel):
            info("(dev note: no account matched, or no phone is on file for it)")
        return
    info(f"The code expires in {auth.OTP_TTL_SECONDS // 60} minutes.")

    # 1. prove control of the inbox / phone
    ticket = None
    while ticket is None:
        code = ask("6-digit code")
        try:
            ticket = auth.verify_recovery_code(challenge_id, code)
        except AuthError as exc:
            fail(exc.message)
            if "attempt" in exc.message:  # wrong code, retries remain
                continue
            return
    ok("Code verified.")

    # 2. spend that proof on one of two things
    choice = ask_choice(
        "What would you like to do?",
        {
            "1": "Set a new password",
            "2": f"Sign in now without changing it  {dim('- passwordless')}",
        },
    )

    if choice == "2":
        session = auth.sign_in_with_ticket(ticket)
        ok(f"Signed in as {bold(session.username)} - no password needed.")
        info(f"Session valid for {session.minutes_left} more minutes.")
        info("Your password is unchanged.")
        return

    while True:
        new_password = ask_secret("New password")
        if new_password != ask_secret("Confirm new password"):
            fail("Passwords did not match.")
            continue
        try:
            user = auth.reset_password_with_ticket(ticket, new_password)
        except AuthError as exc:
            fail(exc.message)
            if "different" in exc.message or "least" in exc.message:
                continue  # ticket survives, let them try another password
            return
        ok(f"Password updated for {user.masked_email}.")
        info("Every existing session for that account was signed out.")
        return


def flow_whoami(auth: AuthService) -> None:
    session = auth.whoami()
    method = "password" if session.method == "password" else "recovery code (passwordless)"
    print(bold("\n  Session"))
    print(f"    user     {session.username}")
    print(f"    email    {session.email}")
    print(f"    method   {method}")
    print(f"    token    {session.token[:12]}{dim('...')}")
    print(f"    expires  in {session.minutes_left} min")


def flow_sign_out(auth: AuthService) -> None:
    name = auth.whoami().username
    auth.sign_out()
    ok(f"Signed out {name}.")


def flow_list_accounts(auth: AuthService) -> None:
    users = auth.store.all_users()
    print(bold(f"\n  In-memory accounts ({len(users)})"))
    print(dim("  Passwords are shown as stored - a hash, never what anyone typed."))
    for user in users:
        state = red("LOCKED") if user.is_locked else green("active")
        phone = user.masked_phone or dim("no phone")
        print(f"    {user.username:<14} {user.email:<26} {phone:<16} {state}")
        print(dim(f"      [{security.describe_hash(user.password_hash)}] "
                  f"{user.password_hash[:46]}..."))


# --- main loop --------------------------------------------------------------


def main() -> int:
    load_env_file()  # pick up SMTP / Twilio / Textbelt credentials from .env
    auth = AuthService(courier=default_courier())

    print(cyan(BANNER))
    print(bold("  CLI authentication backend") + dim("  |  in-memory only, no database"))
    print(dim(f"  Passwords:  {security.ALGORITHM_LABEL}"))
    print(dim(f"  Email codes: {auth.courier.label(CHANNEL_EMAIL)}"))
    print(dim(f"  SMS codes:   {auth.courier.label(CHANNEL_SMS)}"))
    print(dim(f"  Demo login -> email: {DEMO_EMAIL}   password: {DEMO_PASSWORD}"))
    if not (auth.courier.is_live(CHANNEL_EMAIL) and auth.courier.is_live(CHANNEL_SMS)):
        print(dim("  For real delivery: python3 backend/check_delivery.py"))

    actions = {
        "1": flow_sign_up,
        "2": flow_sign_in,
        "3": flow_recover,
        "4": flow_whoami,
        "5": flow_sign_out,
        "6": flow_list_accounts,
    }

    while True:
        session = auth.current_session
        who = (
            green(f"signed in as {session.username}")
            if session and not session.is_expired
            else dim("not signed in")
        )
        print(bold("\n  ------------------------------------------------"))
        print(f"  {who}")
        print(MENU)
        try:
            choice = input(cyan("  Choose: ")).strip()
        except (EOFError, KeyboardInterrupt):
            print()
            choice = "0"

        if choice == "0":
            print(dim("\n  Session store cleared. Bye.\n"))
            return 0

        action = actions.get(choice)
        if action is None:
            fail("Pick a number from the menu.")
            continue

        try:
            action(auth)
        except Abort:
            info("Cancelled.")
        except AuthError as exc:
            fail(exc.message)
        except DeliveryError as exc:
            fail(str(exc))


if __name__ == "__main__":
    raise SystemExit(main())
