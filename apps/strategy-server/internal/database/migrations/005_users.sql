-- +goose Up
-- Users table: persisted on first Zitadel authentication.

CREATE TABLE users (
    id         UUID        PRIMARY KEY,
    sub        TEXT        NOT NULL,  -- Zitadel subject ID (unique per identity provider)
    email      TEXT        NOT NULL,
    name       TEXT,
    status     TEXT        NOT NULL DEFAULT 'active'
                            CHECK (status IN ('active', 'deleted')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX users_sub_uidx ON users (sub) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX users_email_uidx ON users (email) WHERE deleted_at IS NULL;

-- +goose Down
DROP TABLE IF EXISTS users;
