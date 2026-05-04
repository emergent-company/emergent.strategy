-- +goose Up
-- Strategy Server initial schema

-- workspaces: a GitHub user/org and their strategy instances
CREATE TABLE workspaces (
    id          UUID        PRIMARY KEY,
    github_owner TEXT       NOT NULL,
    display_name TEXT,
    created_by  UUID,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at  TIMESTAMPTZ
);

CREATE UNIQUE INDEX workspaces_github_owner_uidx ON workspaces (github_owner) WHERE deleted_at IS NULL;

-- strategy_instances: a versioned EPF instance within a workspace
CREATE TABLE strategy_instances (
    id               UUID        PRIMARY KEY,
    workspace_id     UUID        NOT NULL REFERENCES workspaces (id),
    name             TEXT        NOT NULL,
    description      TEXT,
    github_repo      TEXT,
    github_base_path TEXT,
    status           TEXT        NOT NULL DEFAULT 'draft'
                                  CHECK (status IN ('draft', 'active', 'archived')),
    created_by       UUID,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at       TIMESTAMPTZ
);

CREATE INDEX strategy_instances_workspace_id_idx ON strategy_instances (workspace_id);

-- strategy_mutations: append-only log of every strategy change
-- Current state is derived by reading the latest mutation per artifact_key.
CREATE TABLE strategy_mutations (
    id            UUID        PRIMARY KEY,
    instance_id   UUID        NOT NULL REFERENCES strategy_instances (id),
    batch_id      UUID,
    artifact_type TEXT        NOT NULL,
    artifact_key  TEXT        NOT NULL,
    action        TEXT        NOT NULL CHECK (action IN ('create', 'update', 'archive')),
    payload       JSONB       NOT NULL,
    status        TEXT        NOT NULL DEFAULT 'committed'
                               CHECK (status IN ('staged', 'committed', 'discarded')),
    source        TEXT        NOT NULL DEFAULT 'system'
                               CHECK (source IN ('mcp', 'web', 'import', 'system')),
    created_by    UUID,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX strategy_mutations_instance_id_idx ON strategy_mutations (instance_id);
CREATE INDEX strategy_mutations_artifact_key_idx ON strategy_mutations (instance_id, artifact_key, created_at DESC);
CREATE INDEX strategy_mutations_batch_id_idx ON strategy_mutations (batch_id) WHERE batch_id IS NOT NULL;

-- audit_log: all significant server-side events
CREATE TABLE audit_log (
    id          UUID        PRIMARY KEY,
    entity_type TEXT        NOT NULL,
    entity_id   UUID,
    action      TEXT        NOT NULL,
    source      TEXT        NOT NULL DEFAULT 'system',
    actor_id    UUID,
    details     JSONB,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX audit_log_entity_idx ON audit_log (entity_type, entity_id);
CREATE INDEX audit_log_created_at_idx ON audit_log (created_at DESC);

-- +goose Down
DROP TABLE IF EXISTS audit_log;
DROP TABLE IF EXISTS strategy_mutations;
DROP TABLE IF EXISTS strategy_instances;
DROP TABLE IF EXISTS workspaces;
