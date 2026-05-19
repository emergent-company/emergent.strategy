-- +goose Up
ALTER TABLE strategy_instances
    ADD COLUMN IF NOT EXISTS memory_decomposed_object_count INT,
    ADD COLUMN IF NOT EXISTS memory_decomposed_edge_count   INT;

-- +goose Down
ALTER TABLE strategy_instances
    DROP COLUMN IF EXISTS memory_decomposed_object_count,
    DROP COLUMN IF EXISTS memory_decomposed_edge_count;
