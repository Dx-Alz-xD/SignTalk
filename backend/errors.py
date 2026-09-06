"""The one error type whose message is written for the person using the app.

Everything in here exists to draw a line the API layer can act on. `Invalid`
carries wording someone deliberately chose - "That name is already taken",
"Only editing keys can be shared" - and the client is meant to see it. A bare
ValueError does not: it is int() choking on a malformed id, or numpy refusing
a badly shaped array, and its message describes our internals rather than
anything the caller can fix.

Both are still a 400. The difference is whether the text reaches the browser
(see backend/api/main.py) or only the log.
"""

from __future__ import annotations


class Invalid(ValueError):
    """Input the user can correct, with a message written for them.

    Subclasses ValueError so that `except ValueError` anywhere upstream keeps
    catching it, and so switching a raise over to it changes nothing but the
    error's provenance.
    """
