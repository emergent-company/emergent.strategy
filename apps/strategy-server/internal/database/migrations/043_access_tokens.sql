-- +goose Up
-- access_tokens: long-lived credentials for non-interactive MCP clients.
--
-- Why this table exists
-- ---------------------
-- Authentication today is Zitadel OIDC introspection only. That works for a
-- human in a browser, but an MCP client is a long-running process with no
-- interactive login and no refresh cycle, so there has been no way to hand
-- someone outside the org a connection to a single strategy instance. The
-- workaround in practice is ZITADEL_DEBUG_TOKEN, which is a total bypass:
-- it authenticates as a full user with access to everything. This table is
-- what replaces that for external access.
--
-- Storage shape
-- -------------
-- The token is shown to the user exactly once, at creation, and only a hash
-- is kept. A leaked database must not yield usable credentials, so token_hash
-- holds an Argon2id digest (encoded PHC string, carrying its own params and
-- salt) rather than the token.
--
-- That creates a lookup problem: a hash with a per-row salt cannot be used as
-- a WHERE key, so verifying a presented token would mean hashing it against
-- every row — O(n) Argon2id, which is a denial-of-service lever precisely
-- because Argon2id is deliberately slow. token_prefix solves it: the first 8
-- characters of the token are stored in clear and indexed, narrowing the
-- candidate set to ~1 row before any hashing happens. The prefix is not a
-- secret and is not sufficient to authenticate — it only selects candidates;
-- the Argon2id comparison still decides.
CREATE TABLE access_tokens (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id       UUID        NOT NULL REFERENCES orgs (id) ON DELETE CASCADE,

    -- The user who created the token. The token acts on behalf of a person,
    -- so audit entries have a real actor rather than an anonymous machine.
    -- ON DELETE CASCADE: if the creator is removed, their credentials must
    -- not outlive them.
    user_id      UUID        NOT NULL REFERENCES users (id) ON DELETE CASCADE,

    -- Human-readable label, so a user can tell their tokens apart when
    -- deciding which to revoke. Not unique: two clients may share a name.
    name         TEXT        NOT NULL,

    token_prefix TEXT        NOT NULL,
    token_hash   TEXT        NOT NULL,

    -- NOT NULL on purpose. A nullable expiry means "never expires" is
    -- expressible, and a credential that never expires is one that cannot be
    -- cleaned up by the passage of time — every leak is permanent until
    -- someone notices. Callers must choose a lifetime; the service caps it.
    expires_at   TIMESTAMPTZ NOT NULL,

    -- Updated on use, best-effort and asynchronously. Its purpose is letting
    -- a human answer "is this token still in use?" before revoking it, not
    -- precise accounting, so it is deliberately not on the critical path of
    -- authentication.
    last_used_at TIMESTAMPTZ,

    -- Revocation is a tombstone, not a DELETE: the row must survive so audit
    -- records referencing this token_id still resolve, and so a revoked
    -- token's prefix is never silently reused by a new token.
    revoked_at   TIMESTAMPTZ,

    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- The authentication hot path: prefix → candidate rows. Partial on
-- revoked_at IS NULL because revoked tokens must never become candidates,
-- and keeping them out of the index makes revocation effective at lookup
-- time rather than relying on a later check being remembered.
CREATE INDEX access_tokens_prefix_idx
    ON access_tokens (token_prefix)
    WHERE revoked_at IS NULL;

-- Listing and bulk-revoking a user's tokens.
CREATE INDEX access_tokens_user_idx ON access_tokens (user_id);
CREATE INDEX access_tokens_org_idx  ON access_tokens (org_id);

-- access_token_grants: which instances a token may reach, and how.
--
-- A grant is a separate table rather than columns on access_tokens because
-- the relationship is genuinely many-to-one — one token may cover several
-- instances — and because permission is a property of the *pairing*, not of
-- the token: the same token can be read-only on one instance and writable on
-- another.
--
-- Authority here is strictly narrowing. A grant never widens what the
-- underlying user may do; it intersects with org membership. An org_admin
-- using a read-scoped token is read-only, because the question asked at the
-- gate is "does this credential permit it?" as well as "does this user?".
CREATE TABLE access_token_grants (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    token_id    UUID NOT NULL REFERENCES access_tokens (id)     ON DELETE CASCADE,
    instance_id UUID NOT NULL REFERENCES strategy_instances (id) ON DELETE CASCADE,

    -- Enumerated in the database, not only in Go. This column is the last
    -- thing standing between a typo and a silent privilege change: an
    -- unrecognised value such as 'readonly' must fail loudly on write rather
    -- than fall through a Go comparison and be treated as not-write.
    permission  TEXT NOT NULL CHECK (permission IN ('read', 'write')),

    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One grant per (token, instance). Without this, a token could hold both a
-- 'read' and a 'write' row for the same instance and the effective
-- permission would depend on row order — a non-deterministic authorisation
-- outcome. Changing a permission is an UPDATE, not a second INSERT.
CREATE UNIQUE INDEX access_token_grants_uidx
    ON access_token_grants (token_id, instance_id);

-- Loading a token's grants during authentication.
CREATE INDEX access_token_grants_token_idx ON access_token_grants (token_id);

-- +goose Down
DROP TABLE IF EXISTS access_token_grants;
DROP TABLE IF EXISTS access_tokens;
