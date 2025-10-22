-- Add unique constraint on integration_id in clickup_sync_state
-- This ensures each integration has only one sync state record
ALTER TABLE
    kb.clickup_sync_state
ADD
    CONSTRAINT clickup_sync_state_integration_id_unique UNIQUE (integration_id);