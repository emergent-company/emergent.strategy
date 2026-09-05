-- +goose Up

-- DBOS Transact Go's own system schema. DBOS creates and migrates its own
-- tables within it on dbos.Launch() — this migration only ensures the
-- schema exists and is writable by the app role; it does not create or
-- manage DBOS's internal tables (workflow_status, operation_outputs,
-- notifications, etc.), matching the precedent in sequence's ADR-057
-- ("Library migrates tables on Launch").
CREATE SCHEMA IF NOT EXISTS dbos;

-- aim_cycle_runs is the cross-run record a DBOS-backed orchestration engine
-- needs and DBOS's own workflow_status table does not provide: which run is
-- active for an AIM instance, which run staged a given batch, and the
-- run/step history the run panel already knows how to render.
--
-- Deliberately mirrors adk_run_metadata's shape (035, dropped by 039): both
-- persist the same orchestration.Run / orchestration.StepLog Go types, and
-- the id column doubles as the DBOS workflow ID (passed to RunWorkflow via
-- WithWorkflowID) — confirmed by direct probe that a caller-supplied
-- workflow ID is retrievable from any process via RetrieveWorkflow, so no
-- separate mapping table is needed between an AIM run and its DBOS
-- identity.
CREATE TABLE aim_cycle_runs (
    id               UUID PRIMARY KEY,
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
CREATE INDEX idx_aim_cycle_runs_lookup
    ON aim_cycle_runs (workflow_name, concurrency_key, created_at DESC);

-- One active run per (workflow, concurrency key), enforced by the database
-- rather than a check-then-insert race — same reasoning as
-- adk_run_metadata's equivalent index (035).
CREATE UNIQUE INDEX idx_aim_cycle_runs_one_active
    ON aim_cycle_runs (workflow_name, concurrency_key)
    WHERE status IN ('pending', 'running', 'awaiting_human');

-- +goose Down

DROP TABLE IF EXISTS aim_cycle_runs;
DROP SCHEMA IF EXISTS dbos CASCADE;
