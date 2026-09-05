-- +goose Up

-- AIM moved from the ADK-backed engine (internal/aimadk) to a DBOS-backed
-- one (internal/aimdbos), per openspec/changes/adopt-dbos-dynamic-aim.
-- aim_cycle_runs (038) replaces adk_run_metadata's job — the cross-run
-- bookkeeping (which run is active for an instance, which run staged a
-- batch) that was always AIM-specific and has no other consumer.
--
-- adk_sessions / adk_session_events / adk_app_states / adk_user_states are
-- deliberately NOT dropped here, even though AIM was their only consumer
-- until now: they back internal/adk.SessionStore, a generic implementation
-- of ADK's session.Service interface that is not AIM-specific and is kept
-- available for whichever engine the authoring bot chooses (baseline open
-- question 6, still open — see adopt-dbos-dynamic-aim's proposal.md, Part
-- C6). Dropping them here would have silently broken
-- internal/adk/session_store_test.go's own ADK conformance suite, which
-- exercises SessionStore directly and has nothing to do with AIM.
--
-- This is a deliberate, unrecovered loss of any dev-only AIM run history in
-- adk_run_metadata — no production deployment exists yet, so there is
-- nothing to preserve. Matches 036's precedent for the legacy engine's own
-- orchestration_runs table.
DROP TABLE IF EXISTS adk_run_metadata;

-- +goose Down

-- Down recreates the empty table shape only (035's Up body, reproduced
-- verbatim). Row data dropped by the Up migration above is not
-- recoverable.

CREATE TABLE adk_run_metadata (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_name    TEXT NOT NULL,
    concurrency_key  TEXT NOT NULL,
    input            JSONB NOT NULL DEFAULT '{}',
    status           TEXT NOT NULL CHECK (status IN ('pending', 'running', 'awaiting_human', 'completed', 'aborted', 'failed')),
    current_step     TEXT,
    steps            JSONB NOT NULL DEFAULT '[]',
    error            TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    session_reaped_at TIMESTAMPTZ
);

CREATE INDEX idx_adk_run_metadata_lookup
    ON adk_run_metadata (workflow_name, concurrency_key, created_at DESC);

CREATE UNIQUE INDEX idx_adk_run_metadata_one_active
    ON adk_run_metadata (workflow_name, concurrency_key)
    WHERE status IN ('pending', 'running', 'awaiting_human');
