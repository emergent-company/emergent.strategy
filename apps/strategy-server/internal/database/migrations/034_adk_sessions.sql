-- +goose Up
-- ADK Go v2 session persistence.
--
-- Backs google.golang.org/adk/v2/session.Service so workflow runs (the AIM
-- cycle) survive a server restart and can resume from their last position.
--
-- State is split across three tables because ADK scopes it three ways, keyed by
-- a prefix on the state key:
--   "app:"  -> adk_app_states    (shared by every user and session of an app)
--   "user:" -> adk_user_states   (shared by every session of one user)
--   "temp:" -> never persisted   (invocation-scoped only)
--   (none)  -> adk_sessions.state
-- Prefixes are stripped on write and re-applied when the merged view is read.

CREATE TABLE adk_sessions (
    app_name    TEXT        NOT NULL,
    user_id     TEXT        NOT NULL,
    id          TEXT        NOT NULL,
    state       JSONB       NOT NULL DEFAULT '{}'::jsonb,
    create_time TIMESTAMPTZ NOT NULL DEFAULT now(),
    update_time TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (app_name, user_id, id)
);

-- Events are stored as whole JSONB documents rather than decomposed columns:
-- session.Event round-trips losslessly through JSON (guarded by a test), and
-- nothing queries an individual event field. Only the ordering key is promoted
-- to a column.
CREATE TABLE adk_session_events (
    app_name   TEXT        NOT NULL,
    user_id    TEXT        NOT NULL,
    session_id TEXT        NOT NULL,
    id         TEXT        NOT NULL,
    timestamp  TIMESTAMPTZ NOT NULL,
    event      JSONB       NOT NULL,
    PRIMARY KEY (app_name, user_id, session_id, id),
    FOREIGN KEY (app_name, user_id, session_id)
        REFERENCES adk_sessions (app_name, user_id, id) ON DELETE CASCADE
);

-- Serves the ordered replay used to reconstruct run state, and the
-- NumRecentEvents / After filters on Get.
CREATE INDEX idx_adk_session_events_replay
    ON adk_session_events (app_name, user_id, session_id, timestamp);

CREATE TABLE adk_app_states (
    app_name    TEXT        PRIMARY KEY,
    state       JSONB       NOT NULL DEFAULT '{}'::jsonb,
    update_time TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE adk_user_states (
    app_name    TEXT        NOT NULL,
    user_id     TEXT        NOT NULL,
    state       JSONB       NOT NULL DEFAULT '{}'::jsonb,
    update_time TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (app_name, user_id)
);

-- +goose Down
DROP TABLE IF EXISTS adk_user_states;
DROP TABLE IF EXISTS adk_app_states;
DROP TABLE IF EXISTS adk_session_events;
DROP TABLE IF EXISTS adk_sessions;
