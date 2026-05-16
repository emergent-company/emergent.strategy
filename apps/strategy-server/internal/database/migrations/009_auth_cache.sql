-- +goose Up
-- Token introspection cache: stores Zitadel introspection results
-- to avoid round-trips on every request.

CREATE TABLE auth_introspection_cache (
    id         UUID        PRIMARY KEY,
    token_hash TEXT        NOT NULL,
    result     JSONB       NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX auth_cache_token_hash_uidx ON auth_introspection_cache (token_hash);
CREATE INDEX auth_cache_expires_at_idx ON auth_introspection_cache (expires_at);

-- +goose Down
DROP TABLE IF EXISTS auth_introspection_cache;
