"""The CLI. Camera lives in its own window; every decision happens here."""

from __future__ import annotations

import time

from . import dataset, interpreter, trainer
from .camera import CameraFeed
from .storage import DEFAULT_VIEW, STANDARD_VIEWS, VIEW_HINTS, Library
from .ui_input import BUTTON, ask_int, ask_text, ask_yes_no, menu, pick

RULE = "-" * 66

# Offered as the one-key "make this more reliable" option.
MULTI_VIEW_PASS = ("front", "left", "right")


def _header(text: str) -> None:
    print(f"\n{RULE}\n  {text}\n{RULE}")


def _sign_summary(library: Library, sign: dict) -> str:
    symbols = library.symbols(sign)
    trained = sum(1 for s in symbols.values() if library.sample_count(s))
    phrases = " +phrases" if sign.get("has_phrases") else ""
    return (f"{sign['name']}{phrases}  -  {len(symbols)} symbol(s), "
            f"{trained} trained")


def _symbol_summary(library: Library, symbol: dict) -> str:
    views = library.trained_views(symbol)
    if not views:
        return f"{symbol['name']}  -  UNTRAINED"
    stale = dict(library.stale_views(symbol))
    total = sum(n for _v, n in views)
    detail = ", ".join(f"{v} {n}" + ("!" if v in stale else "")
                       for v, n in sorted(views))
    summary = (f"{symbol['name']}  -  {total} samples across "
               f"{len(views)} view(s) [{detail}]")
    if stale:
        summary += "  ! old format, retrain"
    return summary


class App:
    def __init__(self, feed: CameraFeed, library: Library):
        self.feed = feed
        self.library = library

    # ------------------------------------------------------------- guards --
    def _camera_ready(self) -> bool:
        if self.feed is not None and not self.feed.failed.is_set():
            return True
        reason = self.feed.error if self.feed is not None else "camera not started"
        print(f"\n  ! Camera unavailable: {reason}")
        print("    Training and interpreting both need it.")
        return False

    def _tracking_ready(self) -> bool:
        if not self._camera_ready():
            return False
        note = self.feed.tracker_note
        if note:
            print(f"\n  ! Hand tracking unavailable: {note}")
            print("    Install it with:  pip install -r detector/requirements.txt")
            return False
        return True

    # ---------------------------------------------------------- main loop --
    def run(self) -> None:
        self._offer_asl_import()
        while True:
            stats = self.library.stats()
            _header(
                f"SignTalk Detector   |   {stats['languages']} language(s), "
                f"{stats['signs']} sign(s), {stats['symbols']} symbol(s), "
                f"{stats['samples']} samples"
            )
            choice = menu(self.feed, [
                ("1", "Explore existing languages"),
                ("2", "Make a new language"),
                ("3", "Browse online"),
                ("4", "Test the interpreter"),
                ("5", "Import the bundled ASL dataset"),
                ("q", "Quit"),
            ])

            if choice == BUTTON or choice == "4":
                self.test_interpreter()
            elif choice == "1":
                self.explore()
            elif choice == "2":
                self.create()
            elif choice == "3":
                self.browse_online()
            elif choice == "5":
                self.import_asl()
            elif choice == "q":
                print("\n  Bye.\n")
                return

    # ------------------------------------------------------------ browse ---
    @staticmethod
    def browse_online() -> None:
        _header("Browse online")
        print("  Not wired up yet - this will pull shared languages from the")
        print("  SignTalk backend once the API lands.\n")

    # ------------------------------------------------------ ASL base data --
    def _offer_asl_import(self) -> None:
        """On an empty library, point at the dataset sitting right there."""
        if self.library.find_language(dataset.LANGUAGE) is not None:
            return
        if not dataset.discover():
            return
        print("\n  The bundled ASL dataset (a-z, 0-9, multiple angles) is not")
        print("  imported yet. It gives the interpreter a base to recognise.")
        if ask_yes_no("  Import it now? (takes a couple of minutes)", default=True):
            self.import_asl()

    def import_asl(self) -> None:
        _header("Import the bundled ASL dataset")

        classes = dataset.discover()
        if not classes:
            print(f"  ! No dataset found at {dataset.DEFAULT_ASL_DIR}")
            print("    Expected one folder per class (0-9, a-z) of images.\n")
            return

        total = sum(len(v) for v in classes.values())
        print(f"  Found {len(classes)} classes, {total} images.")

        existing = self.library.find_language(dataset.LANGUAGE)
        if existing is not None:
            print(f"  '{dataset.LANGUAGE}' already exists - importing replaces "
                  f"its dataset samples.")
            if not ask_yes_no("  Continue?", default=False):
                return

        limit = None
        if ask_yes_no("  Quick import (20 images per class) instead of all?",
                      default=False):
            limit = 20
            total = sum(min(len(v), limit) for v in classes.values())

        print(f"\n  Encoding {total} images. This runs on the CPU and takes")
        print("  roughly a minute per 2000 images.\n")

        state = {"last": -1, "started": time.time()}

        def progress(done, count, class_name):
            percent = int(done / count * 100)
            if percent == state["last"]:
                return
            state["last"] = percent
            elapsed = time.time() - state["started"]
            eta = (elapsed / done) * (count - done) if done else 0
            bar = "#" * (percent // 4) + "." * (25 - percent // 4)
            print(f"\r  [{bar}] {percent:3d}%  {done}/{count}  "
                  f"class {class_name:<2}  eta {eta:4.0f}s", end="", flush=True)
            if self.feed is not None:
                self.feed.set_progress(done / count)
                self.feed.set_banner(title="IMPORTING ASL DATASET",
                                     subtitle=f"class {class_name}  -  {percent}%",
                                     hint=f"{done}/{count}", tone="accent")

        report = dataset.import_asl(self.library, on_progress=progress,
                                    limit_per_class=limit)
        print()
        if self.feed is not None:
            self.feed.clear_overlay()

        if report is None:
            print("  ! Import failed - see the message above.\n")
            return

        print(f"\n  Done in {time.time() - state['started']:.0f}s.")
        print(f"  {report.summary()}")
        if report.missed:
            print(f"  {report.missed} image(s) had no detectable hand and were "
                  f"skipped.")
        if report.failed_classes:
            print(f"  ! No usable samples for: {', '.join(report.failed_classes)}")
        print(f"  Saved to {self.library.path.name}.\n")

    # ------------------------------------------------------------ create ---
    def create(self) -> None:
        """Option 2: define a sign, attach it to a language, then train symbols."""
        _header("New sign")
        print("  (leave a field blank, or enter '-', to cancel)\n")

        name = ask_text("  Sign name")
        if not name:
            return

        language_name = self._ask_language()
        if not language_name:
            return

        has_phrases = ask_yes_no("  Does this sign have phrases?", default=False)
        phrases = []
        if has_phrases:
            print("  Enter phrases one per line; blank line when done.")
            while True:
                phrase = ask_text("    phrase", required=False, allow_cancel=False)
                if not phrase:
                    break
                phrases.append(phrase)

        language = self.library.ensure_language(language_name)
        if self.library.find_sign(language, name) is not None:
            print(f"\n  ! '{name}' already exists in {language['name']}.")
            if not ask_yes_no("  Open the existing one instead?", default=True):
                return
            sign = self.library.find_sign(language, name)
        else:
            print(f"\n  Sign     : {name}")
            print(f"  Language : {language['name']}")
            print(f"  Phrases  : {', '.join(phrases) if phrases else 'no'}")
            if not ask_yes_no("\n  Save this sign?", default=True):
                print("  Discarded.")
                return
            sign = self.library.add_sign(language, name, has_phrases, phrases)
            self.library.save()
            print(f"  Saved to {self.library.path.name}.")

        self.add_symbols(language, sign)

    def _ask_language(self):
        """Pick an existing language or name a new one."""
        existing = self.library.language_names()
        if existing:
            print("\n  Which language is it associated to?")
            index = pick(existing + ["<new language>"], "  Language",
                         zero_label="cancel")
            if index is None:
                return None
            if index < len(existing):
                return existing[index]
        return ask_text("  New language name")

    # ----------------------------------------------------------- symbols ---
    def add_symbols(self, language: dict, sign: dict) -> None:
        _header(f"Symbols for '{sign['name']}' ({language['name']})")
        print("  Add a symbol, then hold its gesture to train it.")
        print("  Blank name when you're done.\n")

        while True:
            symbols = self.library.symbols(sign)
            if symbols:
                print("  Current symbols:")
                for symbol in symbols.values():
                    print(f"    - {_symbol_summary(self.library, symbol)}")
                print()

            name = ask_text("  New symbol name", required=False, allow_cancel=False)
            if not name:
                break

            symbol = self.library.add_symbol(sign, name)
            self.library.save()
            print(f"  Added '{symbol['name']}'.")

            if ask_yes_no(f"  Train '{symbol['name']}' now?", default=True):
                self.train_symbol(sign, symbol)
            print()

        print(f"  Done - '{sign['name']}' has "
              f"{len(self.library.symbols(sign))} symbol(s).\n")

    # ---------------------------------------------------------- training ---
    def train_symbol(self, sign: dict, symbol: dict) -> None:
        """Capture one or more views of a symbol."""
        if not self._tracking_ready():
            return

        _header(f"Train '{symbol['name']}' ({sign['name']})")
        trained = self.library.trained_views(symbol)
        stale = dict(self.library.stale_views(symbol))
        if trained:
            print("  Already trained:")
            for view, count in sorted(trained):
                flag = "   ! old format - recapture to use it" if view in stale else ""
                print(f"    - {view:<8} {count} samples{flag}")
        else:
            print("  Nothing trained yet.")

        print("\n  Extra views are optional, but each one you add makes the")
        print("  interpreter noticeably more confident - it stops having to")
        print("  match a rotated hand against front-on samples only.")

        choice = menu(self.feed, [
            ("m", f"Multi-view pass - {', '.join(MULTI_VIEW_PASS)} (best confidence)"),
            ("f", "Front view only (quick)"),
            ("s", "One specific view (side, top, bottom, custom)"),
            ("d", "Delete a trained view"),
            ("0", "Back"),
        ], allow_button=False)

        if choice == "0":
            return
        if choice == "d":
            self._delete_view(symbol)
            return

        if choice == "m":
            views = list(MULTI_VIEW_PASS)
        elif choice == "f":
            views = [DEFAULT_VIEW]
        else:
            view = self._ask_view()
            if not view:
                return
            views = [view]

        count = ask_int("  Samples per view", trainer.DEFAULT_SAMPLES, 10, 200)
        replace = False
        clashing = [v for v in views if self.library.sample_count(symbol, v)]
        if clashing:
            print(f"  Already have samples for: {', '.join(clashing)}")
            replace = ask_yes_no("  Replace them? (no = add more)", default=False)

        for index, view in enumerate(views, 1):
            hint = VIEW_HINTS.get(view, f"show the '{view}' angle")
            print(f"\n  [{index}/{len(views)}] {view} view - {hint}")
            print("  Watch the camera window: it counts down, then records while")
            print("  you hold steady. ESC there (or any key here) cancels.")
            input("  Press ENTER when you're in position... ")

            result = trainer.capture_symbol(
                self.feed, f"{sign['name']} / {symbol['name']}",
                target=count, view=view, view_hint=hint,
            )

            if result.cancelled:
                print(f"  ! Stopped: {result.reason} "
                      f"({len(result.vectors)} samples discarded)")
                if index < len(views) and not ask_yes_no(
                        "  Carry on with the remaining views?", default=True):
                    break
                continue

            total = self.library.store_samples(symbol, result.vectors,
                                               view=view, replace=replace)
            self.library.save()
            print(f"  {view}: {len(result.vectors)} new samples, "
                  f"{total} total for '{symbol['name']}'.")
            print(f"  Hold quality: {trainer.describe_quality(result)}")

        final = self.library.trained_views(symbol)
        if len(final) == 1 and final[0][0] == DEFAULT_VIEW:
            print("\n  Tip: this symbol only has a front view. Adding left and")
            print("  right raises its confidence when your hand isn't square on.")

    def _ask_view(self):
        options = list(STANDARD_VIEWS) + ["<type a custom name>"]
        index = pick(options, "  Which view", zero_label="cancel")
        if index is None:
            return None
        if index < len(STANDARD_VIEWS):
            return STANDARD_VIEWS[index]
        return ask_text("  View name")

    def _delete_view(self, symbol: dict) -> None:
        trained = self.library.trained_views(symbol)
        if not trained:
            print("  Nothing to delete.")
            return
        names = [v for v, _n in sorted(trained)]
        index = pick([f"{v} ({n} samples)" for v, n in sorted(trained)],
                     "  Delete which view")
        if index is None:
            return
        if ask_yes_no(f"  Delete the '{names[index]}' view?", default=False):
            self.library.delete_view(symbol, names[index])
            self.library.save()
            print("  Deleted.")

    # ----------------------------------------------------------- explore ---
    def explore(self) -> None:
        while True:
            names = self.library.language_names()
            _header("Existing languages")
            if not names:
                print("  Nothing here yet - use option 2 to make one.\n")
                return

            rows = []
            for name in names:
                lang = self.library.find_language(name)
                signs = self.library.signs(lang)
                symbols = sum(len(self.library.symbols(s)) for s in signs.values())
                tag = "  (dataset)" if lang.get("source") == "asl_dataset" else ""
                rows.append(f"{name}  -  {len(signs)} sign(s), "
                            f"{symbols} symbol(s){tag}")

            index = pick(rows, "  Open language")
            if index is None:
                return
            self.explore_language(self.library.find_language(names[index]))

    def explore_language(self, language: dict) -> None:
        while True:
            signs = self.library.signs(language)
            _header(f"Language: {language['name']}")
            if not signs:
                print("  No signs yet.\n")
            else:
                for sign in signs.values():
                    print(f"    - {_sign_summary(self.library, sign)}")

            choice = menu(self.feed, [
                ("o", "Open a sign"),
                ("n", "New sign in this language"),
                ("i", f"Test the interpreter on {language['name']}"),
                ("x", "Delete this language"),
                ("0", "Back"),
            ])

            if choice == BUTTON:
                self.test_interpreter()
            elif choice == "o":
                names = list(signs.keys())
                index = pick([_sign_summary(self.library, signs[n]) for n in names],
                             "  Open sign")
                if index is not None:
                    self.explore_sign(language, signs[names[index]])
            elif choice == "n":
                self._new_sign_in(language)
            elif choice == "i":
                interpreter.run(self.feed, self.library, [language["name"]])
            elif choice == "x":
                if ask_yes_no(f"  Delete '{language['name']}' and everything "
                              f"in it?", default=False):
                    self.library.delete_language(language["name"])
                    self.library.save()
                    print("  Deleted.")
                    return
            elif choice == "0":
                return

    def _new_sign_in(self, language: dict) -> None:
        name = ask_text("  Sign name")
        if not name:
            return
        if self.library.find_sign(language, name) is not None:
            print("  ! A sign with that name already exists here.")
            return
        has_phrases = ask_yes_no("  Does this sign have phrases?", default=False)
        phrases = []
        if has_phrases:
            print("  Enter phrases one per line; blank line when done.")
            while True:
                phrase = ask_text("    phrase", required=False, allow_cancel=False)
                if not phrase:
                    break
                phrases.append(phrase)
        sign = self.library.add_sign(language, name, has_phrases, phrases)
        self.library.save()
        print(f"  Saved '{sign['name']}'.")
        self.add_symbols(language, sign)

    def explore_sign(self, language: dict, sign: dict) -> None:
        while True:
            symbols = self.library.symbols(sign)
            _header(f"Sign: {sign['name']}  ({language['name']})")
            print(f"  Phrases: "
                  f"{', '.join(sign.get('phrases') or []) if sign.get('has_phrases') else 'no'}")
            print()
            if not symbols:
                print("  No symbols yet.")
            else:
                for symbol in symbols.values():
                    print(f"    - {_symbol_summary(self.library, symbol)}")

            choice = menu(self.feed, [
                ("a", "Add symbols"),
                ("t", "Train / add a view to a symbol"),
                ("d", "Delete a symbol"),
                ("p", "Edit phrases"),
                ("x", "Delete this sign"),
                ("0", "Back"),
            ])

            if choice == BUTTON:
                self.test_interpreter()
            elif choice == "a":
                self.add_symbols(language, sign)
            elif choice == "t":
                names = list(symbols.keys())
                index = pick([_symbol_summary(self.library, symbols[n])
                              for n in names], "  Train which")
                if index is not None:
                    self.train_symbol(sign, symbols[names[index]])
            elif choice == "d":
                names = list(symbols.keys())
                index = pick([_symbol_summary(self.library, symbols[n])
                              for n in names], "  Delete which")
                if index is not None and ask_yes_no(
                        f"  Delete '{names[index]}'?", default=False):
                    self.library.delete_symbol(sign, names[index])
                    self.library.save()
                    print("  Deleted.")
            elif choice == "p":
                self._edit_phrases(sign)
            elif choice == "x":
                if ask_yes_no(f"  Delete '{sign['name']}'?", default=False):
                    self.library.delete_sign(language, sign["name"])
                    self.library.save()
                    print("  Deleted.")
                    return
            elif choice == "0":
                return

    def _edit_phrases(self, sign: dict) -> None:
        current = sign.get("phrases") or []
        print(f"  Current: {', '.join(current) if current else '(none)'}")
        print("  Enter the full new list, one per line; blank line when done.")
        phrases = []
        while True:
            phrase = ask_text("    phrase", required=False, allow_cancel=False)
            if not phrase:
                break
            phrases.append(phrase)
        sign["phrases"] = phrases
        sign["has_phrases"] = bool(phrases)
        self.library.save()
        print(f"  Saved {len(phrases)} phrase(s).")

    # -------------------------------------------------------- interpreter --
    def test_interpreter(self) -> None:
        _header("Test the interpreter")
        if not self._tracking_ready():
            return

        names = self.library.language_names()
        if not names:
            print("  Nothing trained yet.\n")
            return

        scope = None
        if len(names) > 1:
            index = pick(["All languages"] + names, "  Interpret using",
                         zero_label="cancel")
            if index is None:
                return
            if index > 0:
                scope = [names[index - 1]]
        else:
            scope = names

        interpreter.run(self.feed, self.library, scope)


def main(camera_index: int = 0) -> int:
    print("\n  SignTalk Detector - starting camera...")
    feed = CameraFeed(index=camera_index)
    feed.start()

    if not feed.ready.wait(timeout=20):
        print("  ! Camera did not start within 20s; continuing without it.")
    elif feed.failed.is_set():
        print(f"  ! {feed.error}")
    else:
        time.sleep(0.3)
        print("  Camera window is open.")
        if feed.tracker_note:
            print(f"  ! Hand tracking is off: {feed.tracker_note}")
            print("    Run: pip install -r detector/requirements.txt")

    library = Library()
    app = App(feed, library)
    try:
        app.run()
    except KeyboardInterrupt:
        print("\n\n  Interrupted.\n")
    finally:
        library.save()
        feed.stop()
        feed.join(timeout=3)
    return 0
