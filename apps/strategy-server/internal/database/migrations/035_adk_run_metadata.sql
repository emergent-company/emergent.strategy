-- +goose Up

-- adk_run_metadata is the cross-run record an ADK-backed orchestration engine
-- needs and ADK's own session store does not provide: which run is active for
-- a concurrency key, which run staged a given batch, and the run/step history
-- the run panel decodes. ADK session reconstruction remains how one run's own
-- paused position is resumed; this table answers questions that span runs.
--
-- Deliberately not orchestration_runs: that table is retired with the legacy
-- engine, and this one's row shape mirrors it only because both persist the
-- same orchestration.Run / orchestration.StepLog Go types, not because they
-- are the same data.
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
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- General lookup: list runs for an instance, newest first.
CREATE INDEX idx_adk_run_metadata_lookup
    ON adk_run_metadata (workflow_name, concurrency_key, created_at DESC);

-- One active run per (workflow, concurrency key), enforced by the database
-- rather than by a check-then-insert race. orchestration_runs never had this:
-- its equivalent index is not unique, so two concurrent StartRun calls could
-- both pass the "no active run" check before either inserted.
CREATE UNIQUE INDEX idx_adk_run_metadata_one_active
    ON adk_run_metadata (workflow_name, concurrency_key)
    WHERE status IN ('pending', 'running', 'awaiting_human');

-- +goose Down

DROP TABLE IF EXISTS adk_run_metadata;
