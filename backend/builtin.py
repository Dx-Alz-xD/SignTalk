"""Languages SignTalk ships with.

A built-in language is an ordinary published language owned by a system
account, so nothing in the library code has to know about it: it shows up in
the Community Database like anything else, and every account gets a copy -
at sign-up, at sign-in and whenever its library is listed (`ensure_installed`)
- which is what "pre-installed" means here, for old accounts and new alike.

The system account has a random password nobody knows and is never signed
into. Its languages are imported from image datasets on disk by
`import_dataset.import_folder`, once, in a background thread at API start-up
when a dataset is present and the importer's dependencies are installed.

    SIGNTALK_DATASETS   semicolon-separated "Name=path" pairs to import,
                        default "ISL=D:/dataset_ISL;ISL=detector/isl_dataset;ASL=detector/asl_dataset"
    SIGNTALK_AUTO_IMPORT=0   never import at start-up (run the CLI instead)
    SIGNTALK_IMPORT_LIMIT    images per symbol to use (default all)
"""

from __future__ import annotations

import os
import pathlib
import secrets
import threading

from . import library
from .auth import AuthService, security
from .auth.models import User
from .auth.sql_store import SqlStore
from .config import project_root

SYSTEM_USERNAME = "signtalk"
SYSTEM_EMAIL = "system@signtalk.local"

DEFAULT_DATASETS = "ISL=D:/dataset_ISL;ISL=detector/isl_dataset;ASL=detector/asl_dataset"

_lock = threading.Lock()
_started = False


def system_user() -> User:
    """The account built-in languages belong to. Created on first use."""
    store = SqlStore()
    found = store.get_user_by_email(SYSTEM_EMAIL)
    if found is not None:
        return found
    return store.add_user(User(
        username=SYSTEM_USERNAME,
        email=SYSTEM_EMAIL,
        # Unknowable on purpose: this account exists to own rows, not to log in.
        password_hash=security.hash_password(secrets.token_urlsafe(32)),
    ))


def ensure_installed(user_id) -> list:
    """Give an account every built-in language it does not have yet.

    Idempotent and cheap (two queries when there is nothing to do), so it is
    safe to call on every sign-in and every library listing - which is what
    makes a language "pre-installed" for accounts that existed before it was
    imported, not only for new sign-ups. Returns the names installed now.
    """
    from . import db

    owner = SqlStore().get_user_by_email(SYSTEM_EMAIL)
    if owner is None or str(owner.id) == str(user_id):
        return []

    offered = {str(row["language_id"]) for row in db.fetch_all(
        "SELECT language_id FROM language_installs WHERE user_id = %s", (user_id,))}

    installed = []
    for language in library.published_by(owner.id):
        if str(language["id"]) in offered:
            continue
        try:
            library.install_language(user_id, language["id"])
            installed.append(language["name"])
        except (library.Conflict, library.NotFound):
            # Record the offer anyway, so a language the account cannot take
            # is not retried on every request.
            db.execute(
                "INSERT INTO language_installs (user_id, language_id) VALUES (%s, %s) "
                "ON CONFLICT DO NOTHING",
                (user_id, language["id"]),
            )
    return installed


# The name the sign-up route first used.
install_for = ensure_installed


def datasets() -> list:
    """(name, path) pairs whose folder exists on this machine."""
    spec = os.environ.get("SIGNTALK_DATASETS", DEFAULT_DATASETS)
    found = []
    for entry in spec.split(";"):
        name, _, raw = entry.partition("=")
        if not name or not raw:
            continue
        path = pathlib.Path(raw.strip())
        if not path.is_absolute():
            path = project_root() / path
        if path.is_dir():
            found.append((name.strip(), path))
    return found


def _already_imported(owner_id, name: str) -> bool:
    for language in library.list_languages(owner_id):
        if language["name"].lower() == name.lower() and language["sample_count"] > 0:
            return True
    return False


def _run_imports(pairs) -> None:
    from . import import_dataset

    owner = system_user()
    seen = set()
    limit = os.environ.get("SIGNTALK_IMPORT_LIMIT")
    for name, path in pairs:
        if name.lower() in seen:
            continue
        if _already_imported(owner.id, name):
            seen.add(name.lower())
            continue
        seen.add(name.lower())
        print(f"  [builtin] importing {name} from {path} in the background...")
        state = {"last": -1}

        def progress(done, total, symbol, _name=name):
            percent = int(done / total * 100)
            if percent // 10 != state["last"] // 10:
                state["last"] = percent
                print(f"  [builtin] {_name}: {percent}% ({done}/{total}, {symbol})")

        try:
            report = import_dataset.import_folder(
                owner.id, name, path, limit_per_class=int(limit) if limit else None,
                gesture_translation=True, publish=True, source="asl_dataset",
                on_progress=progress,
            )
        except Exception as exc:  # a failed import must not take the API down
            print(f"  [builtin] {name} import failed: {exc.__class__.__name__}: {exc}")
            continue
        if report is None:
            print(f"  [builtin] {name}: no class folders in {path}")
        else:
            print(f"  [builtin] {name} ready: {report.summary()}")


def startup() -> None:
    """Import built-in languages once per process, without blocking the API."""
    global _started
    if os.environ.get("SIGNTALK_AUTO_IMPORT", "1") == "0":
        return
    with _lock:
        if _started:
            return
        _started = True

    pairs = datasets()
    if not pairs:
        return

    from . import import_dataset
    ok, why = import_dataset.available()
    if not ok:
        print(f"  [builtin] datasets found but the importer cannot run ({why}); "
              f"pip install mediapipe opencv-python")
        return

    threading.Thread(target=_run_imports, args=(pairs,), name="builtin-import",
                     daemon=True).start()


__all__ = ["AuthService", "system_user", "ensure_installed", "install_for", "startup", "datasets"]
