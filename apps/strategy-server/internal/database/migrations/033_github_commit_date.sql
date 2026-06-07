-- +goose Up
-- Migration 033: store the authored date of the last synced commit per instance.
-- Populated during import/sync alongside github_commit_sha.

ALTER TABLE strategy_instances
    ADD COLUMN IF NOT EXISTS github_commit_date TIMESTAMPTZ;

-- +goose Down
ALTER TABLE strategy_instances
    DROP COLUMN IF EXISTS github_commit_date;
