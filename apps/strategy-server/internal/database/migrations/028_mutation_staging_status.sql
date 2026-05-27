-- +goose Up
-- Allow mutations to use "staging" status during chunked skill execution.
-- Staging mutations are invisible to the review UI and committable only after
-- all chunks complete and are promoted to "staged" atomically.
ALTER TABLE strategy_mutations
    DROP CONSTRAINT strategy_mutations_status_check,
    ADD CONSTRAINT strategy_mutations_status_check
        CHECK (status IN ('staged', 'committed', 'discarded', 'staging'));

-- +goose Down
-- Promote any staging mutations to staged before reverting the constraint.
UPDATE strategy_mutations SET status = 'staged' WHERE status = 'staging';
ALTER TABLE strategy_mutations
    DROP CONSTRAINT strategy_mutations_status_check,
    ADD CONSTRAINT strategy_mutations_status_check
        CHECK (status IN ('staged', 'committed', 'discarded'));
