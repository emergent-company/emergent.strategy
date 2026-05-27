-- +goose Up
-- Add commit SHA and branch tracking to strategy_instances for smart import/sync.

ALTER TABLE strategy_instances
    ADD COLUMN github_commit_sha VARCHAR(40),
    ADD COLUMN github_branch     VARCHAR(255);

-- COMMENT: github_commit_sha is the HEAD SHA of the last imported/synced commit.
-- NULL means the instance has never been synced from GitHub (genesis or imported via CLI).
-- github_branch is the active branch the server tracks. NULL means default branch.

-- +goose Down
ALTER TABLE strategy_instances
    DROP COLUMN IF EXISTS github_commit_sha,
    DROP COLUMN IF EXISTS github_branch;
