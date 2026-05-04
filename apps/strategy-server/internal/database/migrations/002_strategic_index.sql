-- +goose Up
-- Strategic Index: current-state cache and cross-artifact relationship index.
-- These tables are derived from strategy_mutations on commit and enable
-- efficient cross-cutting queries without JSONB parsing at read time.

-- Agent identity columns on strategy_mutations.
-- Populated when a background agent calls describe_batch after staging.
ALTER TABLE strategy_mutations
    ADD COLUMN IF NOT EXISTS agent_id          TEXT,
    ADD COLUMN IF NOT EXISTS batch_description TEXT;

-- strategy_artifacts: one row per artifact (latest committed snapshot).
-- Upserted on CommitBatch; replaces the DISTINCT ON read pattern.
CREATE TABLE strategy_artifacts (
    id            UUID        PRIMARY KEY,
    instance_id   UUID        NOT NULL REFERENCES strategy_instances (id),
    artifact_type TEXT        NOT NULL,
    artifact_key  TEXT        NOT NULL,
    track         TEXT,
    name          TEXT,
    status        TEXT        NOT NULL DEFAULT 'active',
    payload       JSONB       NOT NULL,
    mutation_id   UUID        NOT NULL REFERENCES strategy_mutations (id),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT strategy_artifacts_instance_key_uq UNIQUE (instance_id, artifact_key)
);

CREATE INDEX strategy_artifacts_instance_type_idx ON strategy_artifacts (instance_id, artifact_type);
CREATE INDEX strategy_artifacts_instance_status_idx ON strategy_artifacts (instance_id, status);
CREATE INDEX strategy_artifacts_track_idx ON strategy_artifacts (instance_id, track) WHERE track IS NOT NULL;
CREATE INDEX strategy_artifacts_payload_gin_idx ON strategy_artifacts USING gin (payload);

-- strategy_relationships: cross-artifact reference index.
-- Replaced (delete + insert) whenever the source artifact is committed.
CREATE TABLE strategy_relationships (
    id            UUID        PRIMARY KEY,
    instance_id   UUID        NOT NULL REFERENCES strategy_instances (id),
    source_key    TEXT        NOT NULL,
    source_type   TEXT        NOT NULL,
    target_key    TEXT        NOT NULL,
    target_type   TEXT        NOT NULL,
    relationship  TEXT        NOT NULL,
    metadata      JSONB,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT strategy_relationships_uq UNIQUE (instance_id, source_key, target_key, relationship)
);

CREATE INDEX strategy_relationships_source_idx ON strategy_relationships (instance_id, source_key);
CREATE INDEX strategy_relationships_target_idx ON strategy_relationships (instance_id, target_key);
CREATE INDEX strategy_relationships_rel_idx    ON strategy_relationships (instance_id, relationship);

-- +goose Down
DROP TABLE IF EXISTS strategy_relationships;
DROP TABLE IF EXISTS strategy_artifacts;
ALTER TABLE strategy_mutations
    DROP COLUMN IF EXISTS agent_id,
    DROP COLUMN IF EXISTS batch_description;
