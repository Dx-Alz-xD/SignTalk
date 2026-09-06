"""In-process rate limiting.

A sliding window counter per key. Used for two different jobs:

  * abuse control on the HTTP surface (see api/main.py), keyed by client IP
  * cost control on code delivery (see auth/service.py), keyed by account,
    because every SMS is a real charge on someone's Twilio bill

State lives in this process and nowhere else. That is the right trade for a
single uvicorn worker and it is honest about its limits: run several workers
and each keeps its own counters, so the effective limit multiplies by the
worker count. If this app ever runs behind more than one process, move the
counters to the database or to Redis and keep the same interface.

Nothing here is a substitute for the per-account lockout in auth/service.py.
That defends one account against many guesses; this defends the server, and
the SMS budget, against one client making many requests.
"""

from __future__ import annotations

import threading
import time

# Keys are only ever dropped when they are checked again, so a burst of unique
# keys (one per spoofed address, say) would otherwise sit in memory forever.
# Prune whole buckets that cannot matter any more, no more often than this.
_PRUNE_INTERVAL_SECONDS = 300.0


class RateLimiter:
    """Sliding window counters, safe to call from several request threads."""

    def __init__(self, clock=time.monotonic) -> None:
        # key -> the timestamps of the calls still inside their window
        self._hits: dict[str, list[float]] = {}
        self._lock = threading.Lock()
        self._clock = clock
        self._next_prune = 0.0

    def retry_after(self, key: str, limit: int, window: float) -> float:
        """Seconds the caller must wait, or 0.0 when the call is allowed.

        A call that is allowed is also recorded, so this both asks and spends.
        Check it once per request and act on the answer.
        """
        return self.consume(((key, limit, window),))[1]

    def consume(self, specs) -> tuple[str | None, float]:
        """Apply several windows as one decision.

        `specs` is an iterable of (key, limit, window). Returns the name of
        the first window that refuses and how long to wait, or (None, 0.0)
        when every window allows the call.

        All or nothing, under one lock. Checking the windows one at a time
        would record a hit against the first before discovering the second
        refuses, so a request that never happened would still push the next
        real one further out.
        """
        specs = list(specs)
        for _key, limit, _window in specs:
            if limit <= 0:
                raise ValueError("limit must be positive")

        now = self._clock()
        with self._lock:
            self._prune(now)

            buckets = []
            for key, limit, window in specs:
                hits = self._hits.setdefault(key, [])
                cutoff = now - window
                # The list is in order, so everything expired is at the front.
                fresh = 0
                while fresh < len(hits) and hits[fresh] <= cutoff:
                    fresh += 1
                if fresh:
                    del hits[:fresh]
                if len(hits) >= limit:
                    # The window frees up when its oldest call falls out of it.
                    return key, max(0.0, hits[0] + window - now)
                buckets.append(hits)

            for hits in buckets:
                hits.append(now)
            return None, 0.0

    def reset(self, key: str) -> None:
        """Forget a key. Called after a success that should clear the count."""
        with self._lock:
            self._hits.pop(key, None)

    def clear(self) -> None:
        with self._lock:
            self._hits.clear()

    def _prune(self, now: float) -> None:
        """Drop buckets whose newest entry is older than any window we use.

        Called with the lock held. One hour is longer than the longest window
        configured anywhere, so an entry older than that cannot affect a
        decision and only costs memory.
        """
        if now < self._next_prune:
            return
        self._next_prune = now + _PRUNE_INTERVAL_SECONDS
        stale = now - 3600.0
        for key in [k for k, hits in self._hits.items() if not hits or hits[-1] <= stale]:
            del self._hits[key]


# The limiter the HTTP layer uses. Delivery limits live on the AuthService so
# the CLI gets them too, and so tests can swap them out.
http_limiter = RateLimiter()
