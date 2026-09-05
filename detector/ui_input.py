"""CLI prompts that stay responsive to the camera window.

The menu prompt can't just block on `input()`: the camera window has a
"TEST INTERPRETER" button, and a button that only registers after you go back
to the terminal and press Enter isn't a button. On Windows we poll `msvcrt`
for single keypresses while also polling the camera's button queue. Elsewhere
we fall back to a plain line prompt (the button then needs an Enter to land).
"""

from __future__ import annotations

import sys
import time

try:
    import msvcrt  # Windows only
except ImportError:  # pragma: no cover - non-Windows fallback
    msvcrt = None

BUTTON = "__button__"

ESC = "\x1b"


def _flush_keys() -> None:
    if msvcrt is None:
        return
    while msvcrt.kbhit():
        msvcrt.getwch()


def menu(feed, options, prompt: str = "Choose", allow_button: bool = True) -> str:
    """Show `options` [(key, label), ...] and return the chosen key.

    Returns `BUTTON` if the camera window's TEST INTERPRETER button is clicked.
    """
    print()
    for key, label in options:
        print(f"  [{key}] {label}")
    keys = {k.lower() for k, _ in options}

    if feed is not None and allow_button:
        feed.take_button_press()

    if msvcrt is None:
        while True:
            choice = input(f"\n{prompt}: ").strip().lower()
            if feed is not None and allow_button and feed.take_button_press():
                return BUTTON
            if choice in keys:
                return choice
            print("  ? not one of the options")

    _flush_keys()
    sys.stdout.write(f"\n{prompt}: ")
    sys.stdout.flush()
    while True:
        if feed is not None and allow_button and feed.take_button_press():
            print("[camera button]")
            return BUTTON
        if msvcrt.kbhit():
            ch = msvcrt.getwch()
            if ch in ("\x00", "\xe0"):   # function / arrow key
                msvcrt.getwch()
                continue
            if ch == "\x03":
                raise KeyboardInterrupt
            low = ch.lower()
            if low in keys:
                print(ch)
                return low
            if ch in ("\r", "\n"):
                continue
        time.sleep(0.02)


def wait_for_stop(feed, message: str = "press ENTER to stop") -> None:
    """Block until Enter in the terminal, or ESC/Q in the camera window."""
    print(f"  ({message}, or ESC in the camera window)")
    if feed is not None:
        feed.drain_keys()

    if msvcrt is None:
        input()
        return

    _flush_keys()
    while True:
        if msvcrt.kbhit():
            ch = msvcrt.getwch()
            if ch in ("\x00", "\xe0"):
                msvcrt.getwch()
                continue
            if ch == "\x03":
                raise KeyboardInterrupt
            if ch in ("\r", "\n", ESC, "q", "Q"):
                return
        if feed is not None:
            key = feed.take_key()
            if key in (27, ord("q"), ord("Q")):
                return
        time.sleep(0.03)


def ask_text(prompt: str, default: str = "", required: bool = True,
             allow_cancel: bool = True) -> str | None:
    """Line prompt. Returns None if the user cancels with a blank/'-' entry."""
    suffix = f" [{default}]" if default else ""
    while True:
        raw = input(f"{prompt}{suffix}: ").strip()
        if not raw and default:
            return default
        if not raw:
            if not required:
                return ""
            if allow_cancel:
                print("  (nothing entered - cancelled)")
                return None
            print("  ! this one is required")
            continue
        if allow_cancel and raw == "-":
            return None
        return raw


def ask_yes_no(prompt: str, default: bool = False) -> bool:
    hint = "Y/n" if default else "y/N"
    while True:
        raw = input(f"{prompt} ({hint}): ").strip().lower()
        if not raw:
            return default
        if raw in ("y", "yes"):
            return True
        if raw in ("n", "no"):
            return False
        print("  ? answer y or n")


def ask_int(prompt: str, default: int, low: int, high: int) -> int:
    while True:
        raw = input(f"{prompt} [{default}]: ").strip()
        if not raw:
            return default
        try:
            value = int(raw)
        except ValueError:
            print("  ? that isn't a number")
            continue
        if low <= value <= high:
            return value
        print(f"  ? pick a number between {low} and {high}")


def pick(items, prompt: str = "Pick one", zero_label: str = "back"):
    """Numbered picker over a list of display strings. Returns index or None."""
    if not items:
        return None
    print()
    for i, item in enumerate(items, 1):
        print(f"  {i:>2}. {item}")
    print(f"   0. {zero_label}")
    while True:
        raw = input(f"\n{prompt}: ").strip()
        if raw in ("", "0"):
            return None
        try:
            index = int(raw)
        except ValueError:
            print("  ? enter a number")
            continue
        if 1 <= index <= len(items):
            return index - 1
        print("  ? out of range")
