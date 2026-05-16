-- +goose Up

CREATE TABLE ripple_signals (
    id          UUID PRIMARY KEY,
    instance_id UUID NOT NULL REFERENCES strategy_instances(id) ON DELETE CASCADE,
    signal_type TEXT NOT NULL,    -- drift, propagation, tension, staleness, clustering, orphan
    severity    TEXT NOT NULL,    -- critical, warning, info
    status      TEXT NOT NULL DEFAULT 'active', -- active, acknowledged, resolved, dismissed
    source_key  TEXT NOT NULL,    -- artifact that caused the signal
    target_key  TEXT NOT NULL,    -- artifact that needs attention
    description TEXT NOT NULL,    -- human-readable explanation
    suggestion  TEXT,             -- suggested action or draft content
    metadata    JSONB,            -- signal-specific data (distances, paths, etc.)
    batch_id    UUID,             -- if resolved via a batch commit, which batch
    created_by  UUID REFERENCES users(id),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at TIMESTAMPTZ
);

CREATE INDEX idx_ripple_signals_instance_status ON ripple_signals (instance_id, status);
CREATE INDEX idx_ripple_signals_instance_target ON ripple_signals (instance_id, target_key);
CREATE INDEX idx_ripple_signals_instance_severity ON ripple_signals (instance_id, severity) WHERE status = 'active';

-- Add batch_metadata column to strategy_mutations for ripple batch context.
ALTER TABLE strategy_mutations ADD COLUMN batch_metadata JSONB;

-- +goose Down

ALTER TABLE strategy_mutations DROP COLUMN IF EXISTS batch_metadata;
DROP TABLE IF EXISTS ripple_signals;
