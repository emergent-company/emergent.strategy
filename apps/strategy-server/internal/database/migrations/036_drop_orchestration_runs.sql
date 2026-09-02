-- +goose Up

-- orchestration_runs was the legacy engine's run-metadata table
-- (022_orchestration_runs.sql). adk_run_metadata (035) replaced it once
-- ADKEngine reached parity with the legacy pg-backed engine, and the legacy
-- engine itself is now deleted.
--
-- This is a deliberate, unrecovered loss of any historical legacy-engine run
-- data still in this table: cutover means ADK is the only engine going
-- forward, and nothing reads this table's rows once handler_versions.go's
-- cycle-run-link lookup is repointed at adk_run_metadata (same migration
-- that repoints it, same commit).
DROP TABLE IF EXISTS orchestration_runs;

-- +goose Down

CREATE TABLE orchestration_runs (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_name    TEXT NOT NULL,
    concurrency_key  TEXT NOT NULL,
    input            JSONB NOT NULL DEFAULT '{}',
    status           TEXT NOT NULL CHECK (status IN ('pending', 'running', 'awaiting_human', 'completed', 'aborted', 'failed')),
    current_step     TEXT,
    steps            JSONB NOT NULL DEFAULT '[]',
    error            TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_orchestration_runs_lookup
    ON orchestration_runs (workflow_name, concurrency_key, status);

-- Down recreates the empty table shape only. Row data dropped by the Up
-- migration is not recoverable.
