-- +goose Up

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

-- +goose Down

DROP TABLE IF EXISTS orchestration_runs;
