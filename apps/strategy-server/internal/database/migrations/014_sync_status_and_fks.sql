-- +goose Up
-- Track last Memory ingestion point on each instance.
ALTER TABLE strategy_instances ADD COLUMN memory_sync_status TEXT;
ALTER TABLE strategy_instances ADD COLUMN memory_last_synced_at TIMESTAMPTZ;

-- Add FK constraints on created_by columns now that the users table exists.
-- These are soft — NULL is allowed (system-created entities have no actor).
ALTER TABLE workspaces
    ADD CONSTRAINT workspaces_created_by_fk
    FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE SET NULL;

ALTER TABLE strategy_instances
    ADD CONSTRAINT strategy_instances_created_by_fk
    FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE SET NULL;

ALTER TABLE strategy_mutations
    ADD CONSTRAINT strategy_mutations_created_by_fk
    FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE SET NULL;

-- +goose Down
ALTER TABLE strategy_mutations DROP CONSTRAINT IF EXISTS strategy_mutations_created_by_fk;
ALTER TABLE strategy_instances DROP CONSTRAINT IF EXISTS strategy_instances_created_by_fk;
ALTER TABLE workspaces DROP CONSTRAINT IF EXISTS workspaces_created_by_fk;
ALTER TABLE strategy_instances DROP COLUMN IF EXISTS memory_last_synced_at;
ALTER TABLE strategy_instances DROP COLUMN IF EXISTS memory_sync_status;
