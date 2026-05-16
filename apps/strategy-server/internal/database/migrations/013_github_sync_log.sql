-- +goose Up
-- GitHub sync log: tracks sync attempts from strategy-server to GitHub repos.

CREATE TABLE github_sync_log (
    id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    instance_id    UUID        NOT NULL REFERENCES strategy_instances (id),
    version_id     UUID        REFERENCES strategy_versions (id),
    github_repo    TEXT        NOT NULL,
    branch_name    TEXT        NOT NULL,
    pr_number      INT,
    pr_url         TEXT,
    status         TEXT        NOT NULL DEFAULT 'pending'
                               CHECK (status IN ('pending', 'pushed', 'pr_created', 'merged', 'failed')),
    artifact_count INT         NOT NULL,
    error_message  TEXT,
    created_by     UUID,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX github_sync_log_instance_id_idx ON github_sync_log (instance_id);

-- +goose Down
DROP TABLE IF EXISTS github_sync_log;
