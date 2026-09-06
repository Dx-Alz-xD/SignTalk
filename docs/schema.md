# SignTalk — data model

Everything the app needs to persist: accounts, authentication, the sign
library the detector trains and reads, and sharing.

Target is **PostgreSQL**. It's the right fit here for three specific reasons:
the sample data is binary blobs (`BYTEA`), the content is a strict
language → sign → symbol → view tree that wants real foreign keys and
cascading deletes, and account deletion has to reliably remove biometric-ish
data — which is a transaction, not a best-effort cleanup.

The existing `backend/auth/store.py` is an in-memory store whose method names
already mirror a repository. This schema is what those methods map onto, so
the service layer above them shouldn't need to change.

---

## 1. What must never be stored

Get this wrong and nothing else matters.

| Never store | Store instead |
| --- | --- |
| Plaintext passwords | Argon2id hash (already implemented) |
| Plaintext OTP codes | HMAC-SHA256 of the code + per-challenge salt (already implemented) |
| **Raw session tokens** | SHA-256 of the token |
| **Raw recovery ticket ids** | SHA-256 of the id |
| Full email/phone in logs | Masked form — `mask_email()` / `mask_phone()` already exist |
| Camera frames or photos | Only the numeric landmarks |

The two in bold are a change from the current in-memory store, which keys
sessions and tickets by their raw value. That's fine in RAM — it dies with the
process. In a database it means anyone who reads the table (a dump, a backup,
a log of a slow query, a SQL injection) can immediately impersonate every
logged-in user.

The token is a bearer credential, exactly like a password. Hash it on write,
hash the incoming token on read, look it up by hash. The user's copy in their
cookie still works; a stolen table is inert.

---

## 2. Identity

```sql
CREATE EXTENSION IF NOT EXISTS citext;      -- case-insensitive text
CREATE EXTENSION IF NOT EXISTS pgcrypto;    -- gen_random_uuid()

CREATE TABLE users (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email               CITEXT      NOT NULL UNIQUE,
    username            CITEXT      NOT NULL UNIQUE,
    phone               TEXT        UNIQUE,          -- E.164, nullable
    password_hash       TEXT        NOT NULL,        -- self-describing: $argon2id$... or pbkdf2_sha256$...

    email_verified_at   TIMESTAMPTZ,
    phone_verified_at   TIMESTAMPTZ,

    -- lockout policy (AuthService: MAX_FAILED_ATTEMPTS=5, LOCKOUT_SECONDS=300)
    failed_attempts     INTEGER     NOT NULL DEFAULT 0,
    locked_until        TIMESTAMPTZ,

    last_login_at       TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at          TIMESTAMPTZ                   -- soft delete; see §8
);
```

Notes:

- **One `password_hash` column, no separate salt or algorithm columns.** The
  Argon2id and PBKDF2 encodings are both self-describing — parameters and salt
  live inside the string. `needs_rehash()` already upgrades a stale hash on the
  next successful sign-in, which only works if the whole string round-trips.
- `CITEXT` gives case-insensitive uniqueness directly, matching
  `normalize_email()` and the `username.lower()` index in the current store.
  (Alternative if you'd rather avoid the extension: `TEXT` plus
  `CREATE UNIQUE INDEX ON users (lower(email))`.)
- `failed_attempts` / `locked_until` live on the row because lockout must
  survive a restart. In memory it currently doesn't.

---

## 3. Authentication flow

### Sessions

```sql
CREATE TABLE sessions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash      BYTEA       NOT NULL UNIQUE,     -- sha256(token), NOT the token
    method          TEXT        NOT NULL CHECK (method IN ('password','recovery_code')),

    issued_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at      TIMESTAMPTZ NOT NULL,            -- SESSION_TTL_MINUTES = 30
    last_seen_at    TIMESTAMPTZ,
    revoked_at      TIMESTAMPTZ,

    ip              INET,
    user_agent      TEXT
);

CREATE INDEX ON sessions (user_id) WHERE revoked_at IS NULL;
CREATE INDEX ON sessions (expires_at);
```

`method` is carried through from `Session.method` — it matters because a
session opened with a recovery code hasn't proven knowledge of the password,
so you may want to block sensitive actions (changing email, deleting the
account) until a real password is entered.

`revoked_at` rather than deleting the row gives you "sign out everywhere" and
a trail of why. `drop_sessions_for(email)` after a password reset becomes
`UPDATE sessions SET revoked_at = now() WHERE user_id = $1`.

30 minutes is short for a web app. If you add a refresh token, it's a second
row in this table with a longer TTL and its own hash — same shape.

### OTP challenges

```sql
CREATE TABLE otp_challenges (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    challenge_ref   BYTEA       NOT NULL UNIQUE,     -- sha256(challenge_id handed to the client)

    channel         TEXT        NOT NULL CHECK (channel IN ('email','sms')),
    destination     TEXT        NOT NULL,            -- where it was actually sent
    code_hash       BYTEA       NOT NULL,            -- hmac_sha256(code, salt)
    salt            BYTEA       NOT NULL,

    attempts_left   INTEGER     NOT NULL,            -- OTP_MAX_ATTEMPTS = 3
    expires_at      TIMESTAMPTZ NOT NULL,            -- OTP_TTL_SECONDS = 300
    consumed_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ON otp_challenges (user_id, created_at DESC);
```

`invalidate_challenges_for(email)` — issuing a new code kills outstanding ones —
becomes a `DELETE` (or `consumed_at = now()`) scoped by `user_id`.

Decrement `attempts_left` **in the same transaction as the comparison**, or two
concurrent requests both read 3 and you've turned a 3-guess limit into
unlimited guesses.

### Recovery tickets

```sql
CREATE TABLE recovery_tickets (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    ticket_ref      BYTEA       NOT NULL UNIQUE,     -- sha256(ticket_id)
    channel         TEXT        NOT NULL,
    expires_at      TIMESTAMPTZ NOT NULL,            -- TICKET_TTL_SECONDS = 600
    consumed_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Single-use by design — the ticket authorises exactly one follow-up action.
Enforce that with a conditional update, not a read-then-write:

```sql
UPDATE recovery_tickets SET consumed_at = now()
 WHERE ticket_ref = $1 AND consumed_at IS NULL AND expires_at > now()
RETURNING user_id;
```

No row returned means it was already used, expired, or fake — all the same
answer to the caller.

### Audit log

```sql
CREATE TABLE auth_events (
    id          BIGSERIAL PRIMARY KEY,
    user_id     UUID REFERENCES users(id) ON DELETE SET NULL,  -- survives deletion
    event       TEXT        NOT NULL,   -- signup, login_ok, login_fail, locked,
                                        -- otp_sent, otp_fail, password_reset, ...
    channel     TEXT,
    ip          INET,
    user_agent  TEXT,
    detail      JSONB,                  -- masked values only
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ON auth_events (user_id, created_at DESC);
CREATE INDEX ON auth_events (event, created_at DESC);
```

This is what lets you answer "is someone brute-forcing us" and "how did this
account get taken over". `ON DELETE SET NULL` keeps the security trail after an
account is removed, without keeping the person.

---

## 4. The sign library

Mirrors `detector/storage.py` exactly — `languages → signs → symbols →
symbol_views → samples`.

```sql
CREATE TABLE languages (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id        UUID REFERENCES users(id) ON DELETE CASCADE,  -- NULL = built-in
    name            TEXT        NOT NULL,
    description     TEXT,
    source          TEXT        NOT NULL DEFAULT 'user'
                    CHECK (source IN ('user','asl_dataset','imported')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- sharing (menu option 3, "browse online")
    visibility      TEXT        NOT NULL DEFAULT 'private'
                    CHECK (visibility IN ('private','unlisted','public')),
    published_at    TIMESTAMPTZ,
    forked_from_id  UUID REFERENCES languages(id) ON DELETE SET NULL,

    UNIQUE (owner_id, name)
);

CREATE TABLE signs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    language_id     UUID NOT NULL REFERENCES languages(id) ON DELETE CASCADE,
    name            TEXT        NOT NULL,
    has_phrases     BOOLEAN     NOT NULL DEFAULT FALSE,
    phrases         TEXT[]      NOT NULL DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (language_id, name)
);

CREATE TABLE symbols (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sign_id         UUID NOT NULL REFERENCES signs(id) ON DELETE CASCADE,
    name            TEXT        NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (sign_id, name)
);

CREATE TABLE symbol_views (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    symbol_id       UUID NOT NULL REFERENCES symbols(id) ON DELETE CASCADE,
    view            TEXT        NOT NULL,      -- front / left / right / top / bottom / custom

    sample_count    INTEGER     NOT NULL,
    landmarks       BYTEA       NOT NULL,      -- source of truth  (see below)
    features        BYTEA,                     -- derived cache, disposable
    feature_version INTEGER,                   -- which layout `features` was built with

    quality_spread  REAL,                      -- from trainer._spread()
    captured_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (symbol_id, view)
);

CREATE INDEX ON symbol_views (symbol_id);
```

### Store landmarks, not just feature vectors

The detector currently saves the finished 190-float feature vector. When the
feature layout changed to improve accuracy, every existing sample became
unusable and had to be retrained. That will recur every time the maths
improves.

The **raw landmarks** — 21 points × 3 coords × 2 hands = **126 floats** — are
the actual measurement; the feature vector is derived from them. Storing those:

- a future feature change **re-encodes** stored data server-side; nobody retrains
- it is **smaller** than the feature vector (504 vs 760 bytes/sample)
- `features` becomes a cache you can drop and rebuild at will

`feature_version` still matters: it tells you which cached blobs are stale and
need regenerating. It's what let the app say *"these samples are stale"*
instead of silently getting worse.

*This needs a small detector change — the camera thread currently publishes
only the encoded vector, so the landmarks would need to be passed through too.*

### Why samples are a blob, not a row each

Measured from the current library:

| | size |
| --- | --- |
| one sample | 760 B (features) / 504 B (landmarks) |
| one symbol, 3 views × 40 samples | ~89 KB |
| full ASL import, 2497 samples | 1.9 MB binary (2.7 MB as the JSON file) |

One row per sample means **2,497 rows for a single dataset import**, and
hundreds per user-trained symbol — for data never queried individually. The
interpreter never asks for one sample; it loads *every* sample in scope into
one matrix and compares in memory. A view is also exactly the unit you
capture, replace and delete.

Format: `float32`, little-endian, row-major, shape `(sample_count, 126)`.
`sample_count` makes the blob self-describing.

---

## 5. Sharing

```sql
CREATE TABLE language_installs (
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    language_id     UUID NOT NULL REFERENCES languages(id) ON DELETE CASCADE,
    installed_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, language_id)
);

CREATE TABLE language_reports (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    language_id     UUID NOT NULL REFERENCES languages(id) ON DELETE CASCADE,
    reporter_id     UUID REFERENCES users(id) ON DELETE SET NULL,
    reason          TEXT NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    resolved_at     TIMESTAMPTZ
);
```

The moment a language can be public, **the sign name and phrases become
user-generated content displayed to strangers.** Treat them as untrusted:
escape on render, length-limit on write, and have a takedown path — that's
what `language_reports` is for.

---

## 6. Usage history (optional)

Only if you want a "what did I sign" history in the UI. Cut it otherwise —
it's the highest-volume, lowest-value table here.

```sql
CREATE TABLE interpretation_sessions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    language_id     UUID REFERENCES languages(id) ON DELETE SET NULL,
    started_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    ended_at        TIMESTAMPTZ
);

CREATE TABLE interpretation_readings (
    id              BIGSERIAL PRIMARY KEY,
    session_id      UUID NOT NULL REFERENCES interpretation_sessions(id) ON DELETE CASCADE,
    symbol_id       UUID REFERENCES symbols(id) ON DELETE SET NULL,
    label           TEXT        NOT NULL,     -- denormalised, survives symbol deletion
    confidence      REAL        NOT NULL,
    matched_view    TEXT,
    recognised_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Store the *readings*, never the frames they came from.

```sql
CREATE TABLE user_preferences (
    user_id             UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    theme               TEXT,               -- the frontend already has a theme toggle
    camera_index        INTEGER DEFAULT 0,
    mirror_preview      BOOLEAN DEFAULT TRUE,
    min_confidence      REAL    DEFAULT 0.55,
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

---

## 7. Security that isn't in the schema

The tables can't enforce these on their own:

1. **Rate limiting.** Lockout protects one account; it does nothing against
   someone trying one password across ten thousand accounts. Limit per IP and
   per endpoint — Redis with a TTL is the usual home, not Postgres.
2. **Uniform responses.** "Email not found" vs "wrong password" is an account
   enumeration oracle. The existing `_decoy_hash()` already burns comparable CPU
   on unknown accounts so timing doesn't leak either — keep that behaviour when
   the store becomes a database, since a DB miss returns much faster than a hit.
3. **Cookies.** Session token in an `HttpOnly; Secure; SameSite=Lax` cookie, not
   `localStorage`, or any XSS on the page walks away with it.
4. **Authorisation on every content query.** Every read of a language, sign,
   symbol or view must be scoped by `owner_id` or a public-visibility check.
   The most common real-world bug in a schema like this is a valid session
   fetching *someone else's* `symbol_id` because the handler trusted the URL.
5. **TLS everywhere**, and secrets from the environment — `backend/config.py`
   already loads `.env` and keeps it out of git.
6. **Expiry is not deletion.** A nightly job should delete expired sessions,
   consumed challenges and used tickets. Rows that only *logically* expired
   still leak data if the table is dumped.

---

## 8. Privacy and retention

Hand landmark data describes a real person's body. Whether or not it's legally
biometric data where you operate, treat it as personal data — it's the right
default and it's a much better answer if anyone asks:

- **Deletion has to be real.** `ON DELETE CASCADE` from `users` down through
  `languages → signs → symbols → symbol_views` means one delete removes every
  sample. Verify this actually runs, including on backups you retain.
- **Soft delete is a trap here.** `users.deleted_at` is fine for reversing an
  accidental deletion within a grace period, but a scheduled job must hard-delete
  afterwards. "Deleted" rows that keep landmark blobs indefinitely are the worst
  of both worlds.
- **Publishing shares samples.** A public language exposes the owner's captured
  hand geometry to strangers. Say so explicitly at the moment they publish.
- **Never store frames.** Only the numeric landmarks — which is already true of
  the detector today, and worth keeping true.

---

## 9. If scope is tight

Ship in this order:

1. `users`, `sessions`, `otp_challenges`, `recovery_tickets` — replaces the
   in-memory store, everything else already works
2. `languages`, `signs`, `symbols`, `symbol_views` — the library syncs
3. `auth_events` — cheap, and you'll want it the first time something looks odd
4. `language_installs` / `language_reports` — when "browse online" ships
5. `interpretation_*`, `user_preferences` — nice to have

Nothing that can be computed gets stored: symbol counts, sample totals,
trained-view lists, per-language stats. All derived on read, so they can't
drift out of sync with the data.
