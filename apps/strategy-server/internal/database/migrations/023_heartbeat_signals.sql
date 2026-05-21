-- +goose Up
CREATE TABLE heartbeat_signals (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    instance_id     UUID NOT NULL REFERENCES strategy_instances(id) ON DELETE CASCADE,
    reason          TEXT NOT NULL,       -- "time" | "signals"
    message         TEXT NOT NULL,       -- human-readable explanation
    acknowledged_at TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX heartbeat_signals_instance_id_idx ON heartbeat_signals(instance_id);
CREATE INDEX heartbeat_signals_unacked_idx      ON heartbeat_signals(instance_id, created_at)
    WHERE acknowledged_at IS NULL;

-- +goose Down
DROP TABLE IF EXISTS heartbeat_signals;
