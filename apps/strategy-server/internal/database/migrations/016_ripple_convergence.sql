-- +goose Up

-- Add 'ripple_auto' to the source check constraint on strategy_mutations.
ALTER TABLE strategy_mutations DROP CONSTRAINT IF EXISTS strategy_mutations_source_check;
ALTER TABLE strategy_mutations ADD CONSTRAINT strategy_mutations_source_check
    CHECK (source IN ('mcp', 'web', 'import', 'system', 'ripple_auto'));

-- Ripple configuration per instance (authority thresholds, equilibrium, damping, tension baselines).
CREATE TABLE ripple_config (
    id          UUID PRIMARY KEY,
    instance_id UUID NOT NULL UNIQUE REFERENCES strategy_instances(id) ON DELETE CASCADE,
    config      JSONB NOT NULL DEFAULT '{}',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Authority tier on signals so we know which were autonomous vs gated.
ALTER TABLE ripple_signals ADD COLUMN authority_tier TEXT;

-- Convergence run history.
CREATE TABLE convergence_runs (
    id                  UUID PRIMARY KEY,
    instance_id         UUID NOT NULL REFERENCES strategy_instances(id) ON DELETE CASCADE,
    triggering_batch_id UUID,
    iterations          INT NOT NULL DEFAULT 0,
    auto_resolved       INT NOT NULL DEFAULT 0,
    escalated           INT NOT NULL DEFAULT 0,
    starting_score      NUMERIC(5,4),
    ending_score        NUMERIC(5,4),
    equilibrium_reached BOOLEAN NOT NULL DEFAULT FALSE,
    damping_reason      TEXT,
    summary             JSONB,
    version_id          UUID REFERENCES strategy_versions(id),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_convergence_runs_instance ON convergence_runs (instance_id, created_at DESC);

-- Version metadata enrichment for convergence-triggered snapshots.
ALTER TABLE strategy_versions ADD COLUMN source TEXT NOT NULL DEFAULT 'manual';
ALTER TABLE strategy_versions ADD COLUMN equilibrium_score NUMERIC(5,4);
ALTER TABLE strategy_versions ADD COLUMN convergence_meta JSONB;

-- +goose Down

ALTER TABLE strategy_versions DROP COLUMN IF EXISTS convergence_meta;
ALTER TABLE strategy_versions DROP COLUMN IF EXISTS equilibrium_score;
ALTER TABLE strategy_versions DROP COLUMN IF EXISTS source;
DROP TABLE IF EXISTS convergence_runs;
ALTER TABLE ripple_signals DROP COLUMN IF EXISTS authority_tier;
DROP TABLE IF EXISTS ripple_config;

-- Restore original source check constraint.
ALTER TABLE strategy_mutations DROP CONSTRAINT IF EXISTS strategy_mutations_source_check;
ALTER TABLE strategy_mutations ADD CONSTRAINT strategy_mutations_source_check
    CHECK (source IN ('mcp', 'web', 'import', 'system'));
