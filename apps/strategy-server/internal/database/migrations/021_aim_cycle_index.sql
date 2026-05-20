-- +goose Up
-- Add 'aim_cycle' as a valid source for strategy_versions (AIM cycle auto-snapshots).
-- Note: strategy_versions has no CHECK constraint on source — the column is a free-form TEXT.

-- Index for efficient AIM cycle history queries.
-- list_aim_cycles and snapshottedCalibrationCycle filter versions by
-- instance_id + source = 'aim_cycle'.
CREATE INDEX IF NOT EXISTS idx_strategy_versions_source
    ON strategy_versions (instance_id, source)
    WHERE source = 'aim_cycle';

-- +goose Down
DROP INDEX IF EXISTS idx_strategy_versions_source;
