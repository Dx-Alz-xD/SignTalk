"""Entry point.

    python detector/run.py            # default camera
    python detector/run.py --camera 1 # pick a different one
    python -m detector                # same thing
"""

from __future__ import annotations

import argparse
import os
import sys


def _bootstrap():
    """Allow running this file directly, not just as `python -m detector`."""
    if __package__:
        return
    sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def main() -> int:
    _bootstrap()
    parser = argparse.ArgumentParser(prog="detector",
                                     description="SignTalk sign detector")
    parser.add_argument("--camera", type=int, default=0,
                        help="camera index (default 0)")
    args = parser.parse_args()

    try:
        from detector.cli import main as run_cli
    except ImportError as exc:
        print(f"\n  ! Missing dependency: {exc}")
        print("    pip install -r detector/requirements.txt\n")
        return 1

    return run_cli(camera_index=args.camera)


if __name__ == "__main__":
    raise SystemExit(main())
