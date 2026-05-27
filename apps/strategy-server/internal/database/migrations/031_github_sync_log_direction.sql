-- +goose Up
-- Add direction and source columns to github_sync_log for import tracking.

ALTER TABLE github_sync_log
    ADD COLUMN direction VARCHAR(10) NOT NULL DEFAULT 'export'
        CHECK (direction IN ('export', 'import')),
    ADD COLUMN source    VARCHAR(30) NOT NULL DEFAULT 'manual'
        CHECK (source IN ('manual', 'aim_cycle'));

-- Allow 'closed' as a sync status (PR closed without merge).
ALTER TABLE github_sync_log
    DROP CONSTRAINT IF EXISTS github_sync_log_status_check;

ALTER TABLE github_sync_log
    ADD CONSTRAINT github_sync_log_status_check
        CHECK (status IN ('pending', 'pushed', 'pr_created', 'merged', 'closed', 'failed'));

-- +goose Down
ALTER TABLE github_sync_log
    DROP COLUMN IF EXISTS direction,
    DROP COLUMN IF EXISTS source;

ALTER TABLE github_sync_log
    DROP CONSTRAINT IF EXISTS github_sync_log_status_check;

ALTER TABLE github_sync_log
    ADD CONSTRAINT github_sync_log_status_check
        CHECK (status IN ('pending', 'pushed', 'pr_created', 'merged', 'failed'));
