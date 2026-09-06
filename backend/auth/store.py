"""In-memory account store.

Deliberately NOT backed by a database - everything lives in these dicts and
disappears when the process exits. The method names match what a real
repository would expose, so swapping in Postgres/Mongo later is a one-file
change and the service layer stays untouched.
"""

from __future__ import annotations

from .models import OtpChallenge, RecoveryTicket, Session, User
from .security import normalize_email


class InMemoryStore:
    def __init__(self) -> None:
        self._users: dict[str, User] = {}  # email -> User
        self._usernames: dict[str, str] = {}  # username(lower) -> email
        self._challenges: dict[str, OtpChallenge] = {}
        self._tickets: dict[str, RecoveryTicket] = {}
        self._sessions: dict[str, Session] = {}

    # --- users --------------------------------------------------------------

    def add_user(self, user: User) -> User:
        self._users[normalize_email(user.email)] = user
        self._usernames[user.username.lower()] = normalize_email(user.email)
        return user

    def get_user_by_email(self, email: str) -> User | None:
        return self._users.get(normalize_email(email))

    def get_user_by_username(self, username: str) -> User | None:
        email = self._usernames.get(username.lower())
        return self._users.get(email) if email else None

    def email_taken(self, email: str) -> bool:
        return normalize_email(email) in self._users

    def username_taken(self, username: str) -> bool:
        return username.lower() in self._usernames

    def all_users(self) -> list[User]:
        return list(self._users.values())

    # --- write-through hooks ------------------------------------------------
    # No-ops here: this store hands out the live objects, so a mutation in the
    # service is already "saved". PostgresStore implements them for real, and
    # the service calls them after every in-place change so both stores work.

    def persist_user(self, user: User) -> None:
        pass

    def persist_challenge(self, challenge: OtpChallenge) -> None:
        pass

    def persist_ticket(self, ticket: RecoveryTicket) -> None:
        pass

    def touch_session(self, token: str) -> None:
        pass

    def extend_session(self, token: str, expires_at) -> None:
        # The in-memory store hands out the live Session, so the service's
        # own assignment already moved it.
        pass

    def record_event(self, email, event, **kwargs) -> None:
        pass

    # --- one-time codes -----------------------------------------------------

    def add_challenge(self, challenge: OtpChallenge) -> OtpChallenge:
        self._challenges[challenge.challenge_id] = challenge
        return challenge

    def get_challenge(self, challenge_id: str) -> OtpChallenge | None:
        return self._challenges.get(challenge_id)

    def drop_challenge(self, challenge_id: str) -> None:
        self._challenges.pop(challenge_id, None)

    def invalidate_challenges_for(self, email: str) -> None:
        """Issuing a new code kills any code already outstanding."""
        target = normalize_email(email)
        for cid, ch in list(self._challenges.items()):
            if ch.email == target:
                del self._challenges[cid]

    # --- recovery tickets ---------------------------------------------------

    def add_ticket(self, ticket: RecoveryTicket) -> RecoveryTicket:
        self._tickets[ticket.ticket_id] = ticket
        return ticket

    def get_ticket(self, ticket_id: str) -> RecoveryTicket | None:
        return self._tickets.get(ticket_id)

    def drop_ticket(self, ticket_id: str) -> None:
        self._tickets.pop(ticket_id, None)

    # --- sessions -----------------------------------------------------------

    def add_session(self, session: Session) -> Session:
        self._sessions[session.token] = session
        return session

    def get_session(self, token: str) -> Session | None:
        return self._sessions.get(token)

    def drop_session(self, token: str) -> None:
        self._sessions.pop(token, None)

    def drop_sessions_for(self, email: str) -> int:
        """Revoke every session for an account - used after a password reset."""
        target = normalize_email(email)
        doomed = [t for t, s in self._sessions.items() if s.email == target]
        for token in doomed:
            del self._sessions[token]
        return len(doomed)
