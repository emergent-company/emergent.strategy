-- +goose Up
-- Organisations table: tenant containers for workspaces.

CREATE TABLE orgs (
    id         UUID        PRIMARY KEY,
    name       TEXT        NOT NULL,
    slug       TEXT        NOT NULL,
    created_by UUID        REFERENCES users (id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX orgs_slug_uidx ON orgs (slug) WHERE deleted_at IS NULL;

-- +goose Down
DROP TABLE IF EXISTS orgs;
