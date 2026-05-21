-- +goose Up
CREATE TABLE cycle_proposals (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    instance_id     UUID NOT NULL REFERENCES strategy_instances(id) ON DELETE CASCADE,
    -- Why the proposal was created.
    trigger_reason  TEXT NOT NULL,          -- "time" | "signals" | "evidence" | "manual"
    trigger_message TEXT NOT NULL,          -- human-readable explanation of trigger

    -- Snapshot context at proposal time (JSONB — all optional fields).
    evidence_count  INTEGER NOT NULL DEFAULT 0,
    signal_count    INTEGER NOT NULL DEFAULT 0,
    context_payload JSONB NOT NULL DEFAULT '{}',  -- evidence_summary, signal_summary, days_since_last_cycle

    -- Lifecycle.
    status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'approved', 'deferred', 'expired')),
    snooze_until    TIMESTAMPTZ,            -- set by defer; heartbeat skips until this passes
    approved_run_id UUID,                   -- orchestration run ID created on approval
    resolved_at     TIMESTAMPTZ,            -- when status changed from pending

    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX cycle_proposals_instance_pending_idx ON cycle_proposals(instance_id, status)
    WHERE status = 'pending';
CREATE INDEX cycle_proposals_instance_created_idx ON cycle_proposals(instance_id, created_at DESC);

-- +goose Down
DROP TABLE IF EXISTS cycle_proposals;
