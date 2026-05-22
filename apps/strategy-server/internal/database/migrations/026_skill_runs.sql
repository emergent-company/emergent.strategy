-- +goose Up
-- skill_runs: persistent ledger for autonomous skill executions.
-- Each run tracks a multi-chunk LLM-driven skill execution from start to
-- completion, including per-chunk progress, token usage, and trigger context.
CREATE TABLE IF NOT EXISTS skill_runs (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    instance_id         UUID        NOT NULL REFERENCES strategy_instances(id) ON DELETE CASCADE,
    skill_name          TEXT        NOT NULL,
    status              TEXT        NOT NULL DEFAULT 'running',    -- running, completed, failed
    trigger             TEXT        NOT NULL DEFAULT 'manual',     -- manual, ripple, aim_cycle
    trigger_context     JSONB       NOT NULL DEFAULT '{}'::jsonb,
    started_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at        TIMESTAMPTZ,
    chunk_count         INT         NOT NULL DEFAULT 0,
    chunks_completed    INT         NOT NULL DEFAULT 0,
    total_input_tokens  INT         NOT NULL DEFAULT 0,
    total_output_tokens INT         NOT NULL DEFAULT 0,
    model               TEXT        NOT NULL DEFAULT '',
    batch_id            UUID,
    error               TEXT,
    chunk_log           JSONB       NOT NULL DEFAULT '[]'::jsonb,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_skill_runs_instance_status
    ON skill_runs (instance_id, status);

CREATE INDEX IF NOT EXISTS idx_skill_runs_instance_created
    ON skill_runs (instance_id, created_at DESC);

-- +goose Down
DROP TABLE IF EXISTS skill_runs;
