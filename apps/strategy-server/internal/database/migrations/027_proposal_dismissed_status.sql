-- +goose Up
-- Allow proposals to be dismissed (hidden from the inbox permanently).
ALTER TABLE cycle_proposals
    DROP CONSTRAINT cycle_proposals_status_check,
    ADD CONSTRAINT cycle_proposals_status_check
        CHECK (status IN ('pending', 'approved', 'deferred', 'expired', 'dismissed'));

-- +goose Down
-- Revert dismissed proposals to expired before re-adding the old constraint.
UPDATE cycle_proposals SET status = 'expired' WHERE status = 'dismissed';
ALTER TABLE cycle_proposals
    DROP CONSTRAINT cycle_proposals_status_check,
    ADD CONSTRAINT cycle_proposals_status_check
        CHECK (status IN ('pending', 'approved', 'deferred', 'expired'));
