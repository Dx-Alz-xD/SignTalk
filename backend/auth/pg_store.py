"""PostgreSQL-backed account store.

Same method names and return types as InMemoryStore, so AuthService does not
know or care which one it was handed - that was the point of the interface in
store.py, and this is the file that cashes it in.

Two things differ from the in-memory version, both deliberate:

*Bearer credentials are stored hashed.* Session tokens, challenge ids and
ticket ids go in as SHA-256 digests. In RAM the raw value is fine - it dies
with the process. In a table it is a replayable credential, so the caller
still gets the plaintext to hand out, and only the digest is ever written.

*Mutations have to be flushed.* The in-memory store hands back live objects,
so `user.failed_attempts += 1` in the service is already persisted. Here the
dataclass is a detached copy, so the service calls persist_user/challenge/
ticket after mutating one. InMemoryStore implements those as no-ops.
"""

from __future__ import annotations

from .. import db
from .models import OtpChallenge, RecoveryTicket, Session, User
from .security import normalize_email

_USER_COLUMNS = """
    id, email::text AS email, username::text AS username, phone, password_hash,
    failed_attempts, locked_until, last_login_at, created_at
"""


class PostgresStore:
    """Drop-in replacement for InMemoryStore, backed by the `signtalk` database."""

    # ------------------------------------------------------------- mapping --
    @staticmethod
    def _to_user(row) -> User | None:
        if row is None:
            return None
        user = User(
            username=row["username"],
            email=row["email"],
            password_hash=row["password_hash"],
            phone=row["phone"],
            created_at=row["created_at"],
            failed_attempts=row["failed_attempts"],
            locked_until=row["locked_until"],
            last_login_at=row["last_login_at"],
        )
        # Carried for callers that need the row id (the library API scopes
        # every query by it). Set as a plain attribute so models.py stays free
        # of storage concerns.
        user.id = row["id"]
        return user

    # --------------------------------------------------------------- users --
    def add_user(self, user: User) -> User:
        row = db.fetch_one(
            f"""
            INSERT INTO users (email, username, phone, password_hash, created_at)
            VALUES (%s, %s, %s, %s, COALESCE(%s, now()))
            RETURNING {_USER_COLUMNS}
            """,
            (normalize_email(user.email), user.username, user.phone,
             user.password_hash, user.created_at),
        )
        return self._to_user(row)

    def get_user_by_email(self, email: str) -> User | None:
        if not email:
            return None
        return self._to_user(db.fetch_one(
            f"SELECT {_USER_COLUMNS} FROM users "
            f"WHERE email = %s AND deleted_at IS NULL",
            (normalize_email(email),),
        ))

    def get_user_by_username(self, username: str) -> User | None:
        if not username:
            return None
        return self._to_user(db.fetch_one(
            f"SELECT {_USER_COLUMNS} FROM users "
            f"WHERE username = %s AND deleted_at IS NULL",
            (username.strip(),),
        ))

    def email_taken(self, email: str) -> bool:
        return db.fetch_one(
            "SELECT 1 AS hit FROM users WHERE email = %s",
            (normalize_email(email),),
        ) is not None

    def username_taken(self, username: str) -> bool:
        return db.fetch_one(
            "SELECT 1 AS hit FROM users WHERE username = %s",
            (username.strip(),),
        ) is not None

    def all_users(self) -> list:
        rows = db.fetch_all(
            f"SELECT {_USER_COLUMNS} FROM users WHERE deleted_at IS NULL "
            f"ORDER BY created_at"
        )
        return [self._to_user(r) for r in rows]

    def persist_user(self, user: User) -> None:
        """Flush the fields AuthService mutates in place."""
        db.execute(
            """
            UPDATE users
               SET password_hash   = %s,
                   failed_attempts = %s,
                   locked_until    = %s,
                   last_login_at   = %s
             WHERE email = %s
            """,
            (user.password_hash, user.failed_attempts, user.locked_until,
             user.last_login_at, normalize_email(user.email)),
        )

    # ------------------------------------------------------- one-time codes --
    def add_challenge(self, challenge: OtpChallenge) -> OtpChallenge:
        db.execute(
            """
            INSERT INTO otp_challenges
                (user_id, challenge_ref, channel, destination,
                 code_hash, salt, attempts_left, expires_at, created_at)
            SELECT u.id, %s, %s, %s, %s, %s, %s, %s, %s
              FROM users u WHERE u.email = %s
            """,
            (db.token_digest(challenge.challenge_id), challenge.channel,
             challenge.destination, challenge.code_hash, challenge.salt,
             challenge.attempts_left, challenge.expires_at,
             challenge.created_at, normalize_email(challenge.email)),
        )
        return challenge

    def get_challenge(self, challenge_id: str) -> OtpChallenge | None:
        row = db.fetch_one(
            """
            SELECT c.*, u.email::text AS email
              FROM otp_challenges c JOIN users u ON u.id = c.user_id
             WHERE c.challenge_ref = %s
            """,
            (db.token_digest(challenge_id),),
        )
        if row is None:
            return None
        challenge = OtpChallenge(
            challenge_id=challenge_id,           # only the caller ever holds this
            email=row["email"],
            channel=row["channel"],
            destination=row["destination"],
            code_hash=bytes(row["code_hash"]),
            salt=bytes(row["salt"]),
            expires_at=row["expires_at"],
            attempts_left=row["attempts_left"],
            created_at=row["created_at"],
            consumed=row["consumed_at"] is not None,
        )
        return challenge

    def persist_challenge(self, challenge: OtpChallenge) -> None:
        db.execute(
            """
            UPDATE otp_challenges
               SET attempts_left = %s,
                   consumed_at   = CASE WHEN %s THEN COALESCE(consumed_at, now())
                                        ELSE consumed_at END
             WHERE challenge_ref = %s
            """,
            (challenge.attempts_left, challenge.consumed,
             db.token_digest(challenge.challenge_id)),
        )

    def drop_challenge(self, challenge_id: str) -> None:
        db.execute("DELETE FROM otp_challenges WHERE challenge_ref = %s",
                   (db.token_digest(challenge_id),))

    def invalidate_challenges_for(self, email: str) -> None:
        db.execute(
            """
            DELETE FROM otp_challenges
             WHERE user_id = (SELECT id FROM users WHERE email = %s)
            """,
            (normalize_email(email),),
        )

    # ----------------------------------------------------- recovery tickets --
    def add_ticket(self, ticket: RecoveryTicket) -> RecoveryTicket:
        db.execute(
            """
            INSERT INTO recovery_tickets
                (user_id, ticket_ref, channel, expires_at, created_at)
            SELECT u.id, %s, %s, %s, %s FROM users u WHERE u.email = %s
            """,
            (db.token_digest(ticket.ticket_id), ticket.channel,
             ticket.expires_at, ticket.created_at,
             normalize_email(ticket.email)),
        )
        return ticket

    def get_ticket(self, ticket_id: str) -> RecoveryTicket | None:
        row = db.fetch_one(
            """
            SELECT t.*, u.email::text AS email
              FROM recovery_tickets t JOIN users u ON u.id = t.user_id
             WHERE t.ticket_ref = %s
            """,
            (db.token_digest(ticket_id),),
        )
        if row is None:
            return None
        return RecoveryTicket(
            ticket_id=ticket_id,
            email=row["email"],
            channel=row["channel"],
            expires_at=row["expires_at"],
            created_at=row["created_at"],
            consumed=row["consumed_at"] is not None,
        )

    def persist_ticket(self, ticket: RecoveryTicket) -> None:
        db.execute(
            """
            UPDATE recovery_tickets
               SET consumed_at = CASE WHEN %s THEN COALESCE(consumed_at, now())
                                      ELSE consumed_at END
             WHERE ticket_ref = %s
            """,
            (ticket.consumed, db.token_digest(ticket.ticket_id)),
        )

    def drop_ticket(self, ticket_id: str) -> None:
        db.execute("DELETE FROM recovery_tickets WHERE ticket_ref = %s",
                   (db.token_digest(ticket_id),))

    # ------------------------------------------------------------ sessions --
    def add_session(self, session: Session) -> Session:
        db.execute(
            """
            INSERT INTO sessions
                (user_id, token_hash, method, issued_at, expires_at)
            SELECT u.id, %s, %s, %s, %s FROM users u WHERE u.email = %s
            """,
            (db.token_digest(session.token), session.method,
             session.issued_at, session.expires_at,
             normalize_email(session.email)),
        )
        return session

    def get_session(self, token: str) -> Session | None:
        row = db.fetch_one(
            """
            SELECT s.*, u.email::text AS email, u.username::text AS username
              FROM sessions s JOIN users u ON u.id = s.user_id
             WHERE s.token_hash = %s AND s.revoked_at IS NULL
             """,
            (db.token_digest(token),),
        )
        if row is None:
            return None
        return Session(
            token=token,
            email=row["email"],
            username=row["username"],
            method=row["method"],
            issued_at=row["issued_at"],
            expires_at=row["expires_at"],
        )

    def touch_session(self, token: str) -> None:
        db.execute("UPDATE sessions SET last_seen_at = now() WHERE token_hash = %s",
                   (db.token_digest(token),))

    def drop_session(self, token: str) -> None:
        # Revoked, not deleted: keeps "signed out at" for the audit trail.
        # purge_expired_auth() clears them out later.
        db.execute(
            "UPDATE sessions SET revoked_at = now() "
            " WHERE token_hash = %s AND revoked_at IS NULL",
            (db.token_digest(token),),
        )

    def drop_sessions_for(self, email: str) -> int:
        return db.execute(
            """
            UPDATE sessions SET revoked_at = now()
             WHERE revoked_at IS NULL
               AND user_id = (SELECT id FROM users WHERE email = %s)
            """,
            (normalize_email(email),),
        )

    # -------------------------------------------------------------- events --
    def record_event(self, email: str | None, event: str, *, channel=None,
                     ip=None, user_agent=None, detail=None) -> None:
        """Append to auth_events. Never raises - an audit write must not be
        able to fail a sign-in."""
        try:
            db.execute(
                """
                INSERT INTO auth_events (user_id, event, channel, ip, user_agent, detail)
                VALUES ((SELECT id FROM users WHERE email = %s), %s, %s, %s, %s, %s)
                """,
                (normalize_email(email) if email else None, event, channel,
                 ip, user_agent, detail),
            )
        except Exception:
            pass
