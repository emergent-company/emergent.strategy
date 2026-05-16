-- +goose Up
-- Strategy versions: atomic JSONB snapshots of all artifacts and relationships.

CREATE TABLE strategy_versions (
    id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    instance_id       UUID        NOT NULL REFERENCES strategy_instances (id),
    version           INT         NOT NULL,
    label             TEXT,
    description       TEXT,
    status            TEXT        NOT NULL DEFAULT 'published'
                                  CHECK (status IN ('published', 'superseded', 'restored')),
    parent_version_id UUID        REFERENCES strategy_versions (id),
    snapshot          JSONB       NOT NULL,
    published_by      UUID,
    published_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (instance_id, version)
);

CREATE INDEX strategy_versions_instance_id_idx ON strategy_versions (instance_id);

-- +goose Down
DROP TABLE IF EXISTS strategy_versions;
