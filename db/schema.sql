-- SignTalk schema. Run against the `signtalk` database (not `postgres`).
--
--   psql -U postgres -d signtalk -f db/schema.sql
--
-- Safe to re-run: every object is created IF NOT EXISTS, and nothing here
-- drops or rewrites existing data.
--
-- See db/SCHEMA.md for the reasoning behind each decision.

BEGIN;

-- citext gives case-insensitive UNIQUE on email/username, matching
-- normalize_email() and the username.lower() index in backend/auth/store.py.
-- gen_random_uuid() is built into Postgres 13+, so pgcrypto is not needed.
CREATE EXTENSION IF NOT EXISTS citext;


-- ---------------------------------------------------------------------------
-- bookkeeping
-- ---------------------------------------------------------------------------

-- Not app data - it records which migration has been applied, so later
-- changes can be sequenced instead of guessed at.
CREATE TABLE IF NOT EXISTS schema_migrations (
    version     INTEGER     PRIMARY KEY,
    name        TEXT        NOT NULL,
    applied_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Keeps updated_at honest without relying on every code path to remember.
CREATE OR REPLACE FUNCTION touch_updated_at() RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- ===========================================================================
-- 1. IDENTITY
-- ===========================================================================

CREATE TABLE IF NOT EXISTS users (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    email               CITEXT      NOT NULL UNIQUE,
    username            CITEXT      NOT NULL UNIQUE,
    phone               TEXT        UNIQUE,
    -- Full Argon2id encoding; salt and parameters live inside the string, so
    -- needs_rehash() can upgrade it in place on the next sign-in.
    password_hash       TEXT        NOT NULL,

    email_verified_at   TIMESTAMPTZ,
    phone_verified_at   TIMESTAMPTZ,

    -- AuthService: MAX_FAILED_ATTEMPTS = 5, LOCKOUT_SECONDS = 300.
    -- On the row, not in memory, so a restart cannot clear a lockout.
    failed_attempts     INTEGER     NOT NULL DEFAULT 0,
    locked_until        TIMESTAMPTZ,

    last_login_at       TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at          TIMESTAMPTZ,

    -- Cast to text explicitly: citext's regex operators are case-sensitive and
    -- resolve through an implicit cast, so spell it out rather than rely on it.
    CONSTRAINT users_email_shape    CHECK (email::text ~ '^[^@[:space:]]+@[^@[:space:]]+\.[A-Za-z]{2,}$'),
    CONSTRAINT users_username_shape CHECK (username::text ~ '^[A-Za-z0-9._-]{3,20}$'),
    CONSTRAINT users_phone_e164     CHECK (phone IS NULL OR phone ~ '^\+[1-9][0-9]{7,14}$'),
    CONSTRAINT users_attempts_sane  CHECK (failed_attempts >= 0)
);

DROP TRIGGER IF EXISTS users_touch ON users;
CREATE TRIGGER users_touch BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- Partial index: the app almost always filters live accounts.
CREATE INDEX IF NOT EXISTS users_active_idx ON users (created_at DESC)
    WHERE deleted_at IS NULL;


-- ===========================================================================
-- 2. AUTHENTICATION
-- ===========================================================================

CREATE TABLE IF NOT EXISTS sessions (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    -- sha256(token), never the token itself. The token is a bearer credential;
    -- stored raw, a table dump lets anyone impersonate every logged-in user.
    token_hash      BYTEA       NOT NULL UNIQUE,
    method          TEXT        NOT NULL,

    issued_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at      TIMESTAMPTZ NOT NULL,          -- SESSION_TTL_MINUTES = 30
    last_seen_at    TIMESTAMPTZ,
    revoked_at      TIMESTAMPTZ,

    ip              INET,
    user_agent      TEXT,

    CONSTRAINT sessions_method    CHECK (method IN ('password', 'recovery_code')),
    CONSTRAINT sessions_token_len CHECK (octet_length(token_hash) = 32),
    CONSTRAINT sessions_window    CHECK (expires_at > issued_at)
);

CREATE INDEX IF NOT EXISTS sessions_live_idx ON sessions (user_id)
    WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS sessions_expiry_idx ON sessions (expires_at);


CREATE TABLE IF NOT EXISTS otp_challenges (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    challenge_ref   BYTEA       NOT NULL UNIQUE,   -- sha256(challenge_id)

    channel         TEXT        NOT NULL,
    destination     TEXT        NOT NULL,
    code_hash       BYTEA       NOT NULL,          -- hmac_sha256(code, salt)
    salt            BYTEA       NOT NULL,

    attempts_left   INTEGER     NOT NULL,          -- OTP_MAX_ATTEMPTS = 3
    expires_at      TIMESTAMPTZ NOT NULL,          -- OTP_TTL_SECONDS = 300
    consumed_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT otp_channel  CHECK (channel IN ('email', 'sms')),
    CONSTRAINT otp_attempts CHECK (attempts_left >= 0),
    CONSTRAINT otp_ref_len  CHECK (octet_length(challenge_ref) = 32)
);

CREATE INDEX IF NOT EXISTS otp_user_idx ON otp_challenges (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS otp_expiry_idx ON otp_challenges (expires_at);


CREATE TABLE IF NOT EXISTS recovery_tickets (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    ticket_ref      BYTEA       NOT NULL UNIQUE,   -- sha256(ticket_id)
    channel         TEXT        NOT NULL,
    expires_at      TIMESTAMPTZ NOT NULL,          -- TICKET_TTL_SECONDS = 600
    consumed_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT ticket_channel CHECK (channel IN ('email', 'sms')),
    CONSTRAINT ticket_ref_len CHECK (octet_length(ticket_ref) = 32)
);

CREATE INDEX IF NOT EXISTS ticket_user_idx ON recovery_tickets (user_id);
CREATE INDEX IF NOT EXISTS ticket_expiry_idx ON recovery_tickets (expires_at);


CREATE TABLE IF NOT EXISTS auth_events (
    id          BIGSERIAL   PRIMARY KEY,
    -- SET NULL, not CASCADE: the security trail must outlive the account.
    user_id     UUID        REFERENCES users(id) ON DELETE SET NULL,
    event       TEXT        NOT NULL,
    channel     TEXT,
    ip          INET,
    user_agent  TEXT,
    detail      JSONB,                             -- masked values only
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS auth_events_user_idx ON auth_events (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS auth_events_type_idx ON auth_events (event, created_at DESC);


-- ===========================================================================
-- 3. SIGN LIBRARY   (mirrors detector/storage.py)
-- ===========================================================================

CREATE TABLE IF NOT EXISTS languages (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id        UUID        REFERENCES users(id) ON DELETE CASCADE,  -- NULL = built-in
    name            TEXT        NOT NULL,
    description     TEXT,
    source          TEXT        NOT NULL DEFAULT 'user',

    visibility      TEXT        NOT NULL DEFAULT 'private',
    published_at    TIMESTAMPTZ,
    forked_from_id  UUID        REFERENCES languages(id) ON DELETE SET NULL,

    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT languages_name_len   CHECK (char_length(name) BETWEEN 1 AND 80),
    CONSTRAINT languages_source     CHECK (source IN ('user', 'asl_dataset', 'imported')),
    CONSTRAINT languages_visibility CHECK (visibility IN ('private', 'unlisted', 'public')),
    -- Anything not private must record when it was published.
    CONSTRAINT languages_published  CHECK (visibility = 'private' OR published_at IS NOT NULL),
    CONSTRAINT languages_no_self_fork CHECK (forked_from_id IS DISTINCT FROM id)
);

-- Case-insensitive uniqueness per owner. A plain UNIQUE(owner_id, name) would
-- let NULL owner rows duplicate freely, so built-ins get their own index.
CREATE UNIQUE INDEX IF NOT EXISTS languages_owner_name_idx
    ON languages (owner_id, lower(name)) WHERE owner_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS languages_builtin_name_idx
    ON languages (lower(name)) WHERE owner_id IS NULL;
CREATE INDEX IF NOT EXISTS languages_public_idx
    ON languages (published_at DESC) WHERE visibility = 'public';

DROP TRIGGER IF EXISTS languages_touch ON languages;
CREATE TRIGGER languages_touch BEFORE UPDATE ON languages
    FOR EACH ROW EXECUTE FUNCTION touch_updated_at();


CREATE TABLE IF NOT EXISTS signs (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    language_id     UUID        NOT NULL REFERENCES languages(id) ON DELETE CASCADE,
    name            TEXT        NOT NULL,
    has_phrases     BOOLEAN     NOT NULL DEFAULT FALSE,
    phrases         TEXT[]      NOT NULL DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT signs_name_len CHECK (char_length(name) BETWEEN 1 AND 80),
    -- has_phrases and the array must not disagree.
    CONSTRAINT signs_phrases_agree CHECK (has_phrases OR cardinality(phrases) = 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS signs_language_name_idx
    ON signs (language_id, lower(name));

DROP TRIGGER IF EXISTS signs_touch ON signs;
CREATE TRIGGER signs_touch BEFORE UPDATE ON signs
    FOR EACH ROW EXECUTE FUNCTION touch_updated_at();


CREATE TABLE IF NOT EXISTS symbols (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    sign_id         UUID        NOT NULL REFERENCES signs(id) ON DELETE CASCADE,
    name            TEXT        NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT symbols_name_len CHECK (char_length(name) BETWEEN 1 AND 80)
);

CREATE UNIQUE INDEX IF NOT EXISTS symbols_sign_name_idx
    ON symbols (sign_id, lower(name));

DROP TRIGGER IF EXISTS symbols_touch ON symbols;
CREATE TRIGGER symbols_touch BEFORE UPDATE ON symbols
    FOR EACH ROW EXECUTE FUNCTION touch_updated_at();


CREATE TABLE IF NOT EXISTS symbol_views (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    symbol_id       UUID        NOT NULL REFERENCES symbols(id) ON DELETE CASCADE,
    view            TEXT        NOT NULL,

    sample_count    INTEGER     NOT NULL,
    -- Source of truth: float32, little-endian, row-major (sample_count, 126).
    -- Raw landmarks survive a feature-layout change; feature vectors do not.
    landmarks       BYTEA       NOT NULL,
    -- Derived cache, safe to drop and rebuild.
    features        BYTEA,
    feature_version INTEGER,

    quality_spread  REAL,                          -- trainer._spread()
    captured_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT views_view_len   CHECK (char_length(view) BETWEEN 1 AND 40),
    CONSTRAINT views_count      CHECK (sample_count > 0),
    -- 126 float32 per sample; catches a truncated or mis-encoded blob on write.
    CONSTRAINT views_blob_size  CHECK (octet_length(landmarks) = sample_count * 126 * 4),
    -- A cached feature blob is meaningless without the version that built it.
    CONSTRAINT views_cache_pair CHECK ((features IS NULL) = (feature_version IS NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS symbol_views_symbol_view_idx
    ON symbol_views (symbol_id, lower(view));
CREATE INDEX IF NOT EXISTS symbol_views_symbol_idx ON symbol_views (symbol_id);
-- Finds cache entries needing a re-encode after a feature change.
CREATE INDEX IF NOT EXISTS symbol_views_stale_idx ON symbol_views (feature_version);

DROP TRIGGER IF EXISTS symbol_views_touch ON symbol_views;
CREATE TRIGGER symbol_views_touch BEFORE UPDATE ON symbol_views
    FOR EACH ROW EXECUTE FUNCTION touch_updated_at();


-- ===========================================================================
-- 4. SHARING
-- ===========================================================================

CREATE TABLE IF NOT EXISTS language_installs (
    user_id         UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    language_id     UUID        NOT NULL REFERENCES languages(id) ON DELETE CASCADE,
    installed_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, language_id)
);

CREATE INDEX IF NOT EXISTS installs_language_idx ON language_installs (language_id);


CREATE TABLE IF NOT EXISTS language_reports (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    language_id     UUID        NOT NULL REFERENCES languages(id) ON DELETE CASCADE,
    reporter_id     UUID        REFERENCES users(id) ON DELETE SET NULL,
    reason          TEXT        NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    resolved_at     TIMESTAMPTZ,

    CONSTRAINT reports_reason_len CHECK (char_length(reason) BETWEEN 1 AND 2000)
);

CREATE INDEX IF NOT EXISTS reports_open_idx ON language_reports (created_at DESC)
    WHERE resolved_at IS NULL;


-- ===========================================================================
-- 5. USAGE
-- ===========================================================================

CREATE TABLE IF NOT EXISTS interpretation_sessions (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    language_id     UUID        REFERENCES languages(id) ON DELETE SET NULL,
    started_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    ended_at        TIMESTAMPTZ,

    CONSTRAINT interp_window CHECK (ended_at IS NULL OR ended_at >= started_at)
);

CREATE INDEX IF NOT EXISTS interp_user_idx
    ON interpretation_sessions (user_id, started_at DESC);


CREATE TABLE IF NOT EXISTS interpretation_readings (
    id              BIGSERIAL   PRIMARY KEY,
    session_id      UUID        NOT NULL REFERENCES interpretation_sessions(id) ON DELETE CASCADE,
    symbol_id       UUID        REFERENCES symbols(id) ON DELETE SET NULL,
    -- Denormalised so history stays readable after a symbol is deleted.
    label           TEXT        NOT NULL,
    confidence      REAL        NOT NULL,
    matched_view    TEXT,
    recognised_at   TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT readings_confidence CHECK (confidence >= 0 AND confidence <= 1)
);

CREATE INDEX IF NOT EXISTS readings_session_idx
    ON interpretation_readings (session_id, recognised_at);


CREATE TABLE IF NOT EXISTS user_preferences (
    user_id         UUID        PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    theme           TEXT,
    camera_index    INTEGER     NOT NULL DEFAULT 0,
    mirror_preview  BOOLEAN     NOT NULL DEFAULT TRUE,
    min_confidence  REAL        NOT NULL DEFAULT 0.55,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT prefs_camera     CHECK (camera_index >= 0),
    CONSTRAINT prefs_confidence CHECK (min_confidence >= 0 AND min_confidence <= 1)
);

DROP TRIGGER IF EXISTS user_preferences_touch ON user_preferences;
CREATE TRIGGER user_preferences_touch BEFORE UPDATE ON user_preferences
    FOR EACH ROW EXECUTE FUNCTION touch_updated_at();


-- ===========================================================================
-- 6. HOUSEKEEPING
-- ===========================================================================

-- Expiry is not deletion: an expired row still leaks if the table is dumped.
-- Call this on a schedule (pg_cron, or a nightly job from the backend).
CREATE OR REPLACE FUNCTION purge_expired_auth(grace INTERVAL DEFAULT INTERVAL '7 days')
RETURNS TABLE (sessions_removed BIGINT, challenges_removed BIGINT, tickets_removed BIGINT)
AS $$
DECLARE
    s BIGINT; c BIGINT; t BIGINT;
BEGIN
    DELETE FROM sessions
     WHERE expires_at < now() - grace OR revoked_at < now() - grace;
    GET DIAGNOSTICS s = ROW_COUNT;

    DELETE FROM otp_challenges
     WHERE expires_at < now() - grace OR consumed_at < now() - grace;
    GET DIAGNOSTICS c = ROW_COUNT;

    DELETE FROM recovery_tickets
     WHERE expires_at < now() - grace OR consumed_at < now() - grace;
    GET DIAGNOSTICS t = ROW_COUNT;

    RETURN QUERY SELECT s, c, t;
END;
$$ LANGUAGE plpgsql;


INSERT INTO schema_migrations (version, name)
VALUES (1, 'initial schema')
ON CONFLICT (version) DO NOTHING;


-- ===========================================================================
-- MIGRATION 2: trainer configuration and symbol output
-- ===========================================================================
-- Added after the first release, so these are ALTERs rather than edits to the
-- CREATE TABLE above - an existing database has to reach the same shape.

-- How many hands a language is signed with. Purely descriptive on the model
-- side (features.py always encodes both slots), but the trainer uses it to
-- tell the user what to hold up, and to refuse samples that clearly do not
-- match what the language declared.
ALTER TABLE languages ADD COLUMN IF NOT EXISTS hand_control TEXT NOT NULL DEFAULT 'both';

-- Frames one capture collects. Default matches DEFAULT_SAMPLES in
-- detector/trainer.py; raising it trades recording time for a tighter model.
ALTER TABLE languages ADD COLUMN IF NOT EXISTS sample_target INTEGER NOT NULL DEFAULT 40;

DO $$
BEGIN
    ALTER TABLE languages ADD CONSTRAINT languages_hand_control
        CHECK (hand_control IN ('left', 'right', 'both'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    ALTER TABLE languages ADD CONSTRAINT languages_sample_target
        CHECK (sample_target BETWEEN 5 AND 500);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- What the translator emits when it recognises this symbol.
--
--   text   the symbol's own name, or a phrase        "hello", "thank you"
--   space  a single space, so words can be separated  -
--   key    one named key                              Enter, Backspace, Tab
--   combo  a key combination                          Ctrl+C
--
-- Kept per symbol rather than per sign because a single vocabulary mixes
-- letters, words and controls freely - an alphabet needs a space key as much
-- as it needs the letters.
ALTER TABLE symbols ADD COLUMN IF NOT EXISTS output_kind TEXT NOT NULL DEFAULT 'text';
ALTER TABLE symbols ADD COLUMN IF NOT EXISTS output_value TEXT NOT NULL DEFAULT '';

DO $$
BEGIN
    ALTER TABLE symbols ADD CONSTRAINT symbols_output_kind
        CHECK (output_kind IN ('text', 'space', 'key', 'combo'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    -- 'space' carries no value; the others must say what they emit, except
    -- 'text', which falls back to the symbol's name when left blank.
    ALTER TABLE symbols ADD CONSTRAINT symbols_output_value
        CHECK (output_kind IN ('text', 'space') OR char_length(output_value) > 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

INSERT INTO schema_migrations (version, name)
VALUES (2, 'trainer configuration and symbol output')
ON CONFLICT (version) DO NOTHING;

COMMIT;
