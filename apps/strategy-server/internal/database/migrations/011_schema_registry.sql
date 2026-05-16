-- +goose Up
-- Schema registry: runtime distribution of EPF JSON schemas.
-- Lookup order: DB exact version+dialect → DB latest+standard → embedded fallback.

CREATE TABLE schema_registry (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    version     TEXT        NOT NULL,
    dialect     TEXT        NOT NULL DEFAULT 'standard',
    schema_name TEXT        NOT NULL,
    content     JSONB       NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (version, dialect, schema_name)
);

-- Track which schema version an instance was created with.
ALTER TABLE strategy_instances ADD COLUMN schema_version TEXT;
ALTER TABLE strategy_instances ADD COLUMN dialect TEXT NOT NULL DEFAULT 'standard';

-- +goose Down
ALTER TABLE strategy_instances DROP COLUMN IF EXISTS dialect;
ALTER TABLE strategy_instances DROP COLUMN IF EXISTS schema_version;
DROP TABLE IF EXISTS schema_registry;
