"""Read credentials from a .env file at the project root.

Keeps SMTP / Twilio / Textbelt secrets out of your shell history and out of
git (.env is gitignored). A variable already exported in the shell always
wins over the file.
"""

from __future__ import annotations

import os
import pathlib


def project_root() -> pathlib.Path:
    return pathlib.Path(__file__).resolve().parent.parent


def is_production() -> bool:
    """True when this process is serving real traffic.

    One switch behind every hardening decision - the Secure cookie flag, the
    security headers, whether /docs is published and whether an unset
    SIGNTALK_ORIGINS is fatal - so a deployment cannot end up half-hardened by
    setting one variable and forgetting another.
    """
    return os.environ.get("SIGNTALK_ENV", "dev").strip().lower() in ("prod", "production")


def load_env_file(path: str | os.PathLike | None = None) -> list[str]:
    """Load KEY=value lines into os.environ. Returns the keys it set.

    Blank values are skipped, so a .env copied straight from .env.example
    changes nothing until you actually fill something in.
    """
    env_path = pathlib.Path(path) if path else project_root() / ".env"
    if not env_path.is_file():
        return []

    loaded: list[str] = []
    for raw in env_path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("export "):
            line = line[len("export ") :].lstrip()
        key, separator, value = line.partition("=")
        if not separator:
            continue
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        # A blank placeholder (KEY=) must not shadow a default, or copying
        # .env.example would silently unset everything it lists.
        if not key or not value or key in os.environ:  # an exported variable wins
            continue
        os.environ[key] = value
        loaded.append(key)
    return loaded
