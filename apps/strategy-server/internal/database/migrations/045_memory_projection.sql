-- +goose Up
-- Memory projection manifest and ingest bookkeeping.
--
-- The emergent.memory graph is a derived projection of Postgres. This migration
-- records, per instance, which Memory keys make up the current projection, so
-- reads can treat everything outside it as absent, and tracks whether an
-- instance changed since its last ingest.
--
-- memory_generation   bumped by every successful ingest; 0 = never ingested under
--                     this scheme. Observability and ordering only: it is never
--                     written onto Memory objects (that would create a new version
--                     and re-embed every object on every ingest).
-- memory_dirty_since  oldest unprocessed change; the heartbeat uses it to find
--                     stale work.
-- memory_change_seq   incremented by every change. An ingest clears the dirty flag
--                     only if the sequence is unchanged since it started.
-- memory_purged_at    when the graph objects of a deleted instance were removed;
--                     NULL on a deleted, previously synced instance means the
--                     purge is still owed and the heartbeat retries it.
ALTER TABLE strategy_instances
    ADD COLUMN IF NOT EXISTS memory_generation  BIGINT      NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS memory_dirty_since TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS memory_change_seq  BIGINT      NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS memory_purged_at   TIMESTAMPTZ;

-- kind 'object': key is the scoped Memory object key.
-- kind 'relationship': key is '<type>|<from scoped key>|<to scoped key>'.
CREATE TABLE IF NOT EXISTS memory_projection (
    instance_id UUID NOT NULL REFERENCES strategy_instances (id) ON DELETE CASCADE,
    kind        TEXT NOT NULL CHECK (kind IN ('object', 'relationship')),
    key         TEXT NOT NULL,
    PRIMARY KEY (instance_id, kind, key)
);

-- Memory keys are prefixed with the first 8 hex characters of the instance UUID
-- and Memory enforces unique (project, type, key) regardless of namespace, so the
-- prefix must be unique. All rows count, soft-deleted ones included: a purge can
-- lag behind the soft delete and the old objects still carry the prefix. If two
-- existing instances collide this statement fails, which is intended.
CREATE UNIQUE INDEX IF NOT EXISTS strategy_instances_key_prefix_uq
    ON strategy_instances (left(id::text, 8));

-- Every active instance is re-ingested under the new scheme by the startup sweep,
-- which selects instances whose content hash is NULL.
UPDATE strategy_instances SET memory_content_hash = NULL WHERE deleted_at IS NULL;

-- +goose Down
DROP INDEX IF EXISTS strategy_instances_key_prefix_uq;
DROP TABLE IF EXISTS memory_projection;
ALTER TABLE strategy_instances
    DROP COLUMN IF EXISTS memory_purged_at,
    DROP COLUMN IF EXISTS memory_change_seq,
    DROP COLUMN IF EXISTS memory_dirty_since,
    DROP COLUMN IF EXISTS memory_generation;
