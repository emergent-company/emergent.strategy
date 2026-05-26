-- +goose Up
ALTER TABLE strategy_instances ADD COLUMN memory_content_hash TEXT;
COMMENT ON COLUMN strategy_instances.memory_content_hash IS 'MD5 hash of committed artifact payloads at last Memory ingest. Used to skip re-ingest when nothing changed.';

-- +goose Down
ALTER TABLE strategy_instances DROP COLUMN IF EXISTS memory_content_hash;
