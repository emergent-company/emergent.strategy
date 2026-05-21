-- +goose Up
-- strategy_activities: append-only activity stream for the continuous loop.
-- Every significant system event (proposal created, cycle approved, assessment
-- committed, etc.) is recorded here. Used by the SSE fanout to push real-time
-- updates keyed by instance_id.
CREATE TABLE IF NOT EXISTS strategy_activities (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    instance_id UUID        NOT NULL REFERENCES strategy_instances(id) ON DELETE CASCADE,
    actor       TEXT        NOT NULL DEFAULT 'system', -- 'system' | user sub
    event_type  TEXT        NOT NULL,                  -- e.g. 'proposal.created', 'cycle.approved'
    payload     JSONB       NOT NULL DEFAULT '{}',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_strategy_activities_instance_created
    ON strategy_activities (instance_id, created_at DESC);

-- +goose Down
DROP TABLE IF EXISTS strategy_activities;
