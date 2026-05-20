-- +goose Up
-- Add ON DELETE CASCADE to the 5 FK columns on strategy_instances that were
-- created without cascade in migrations 001, 002, 012, and 013. Without these,
-- a hard DELETE on strategy_instances raises a FK violation. With them, a
-- single DELETE on the parent cascades automatically to all child rows.
--
-- Tables already covered by ON DELETE CASCADE (no change needed):
--   installed_skills, strategy_apps, ripple_signals, ripple_config,
--   ripple_convergence_runs (migrations 003, 004, 015, 016).

ALTER TABLE strategy_mutations
    DROP CONSTRAINT IF EXISTS strategy_mutations_instance_id_fkey,
    ADD CONSTRAINT strategy_mutations_instance_id_fkey
        FOREIGN KEY (instance_id) REFERENCES strategy_instances (id) ON DELETE CASCADE;

ALTER TABLE strategy_artifacts
    DROP CONSTRAINT IF EXISTS strategy_artifacts_instance_id_fkey,
    ADD CONSTRAINT strategy_artifacts_instance_id_fkey
        FOREIGN KEY (instance_id) REFERENCES strategy_instances (id) ON DELETE CASCADE;

ALTER TABLE strategy_relationships
    DROP CONSTRAINT IF EXISTS strategy_relationships_instance_id_fkey,
    ADD CONSTRAINT strategy_relationships_instance_id_fkey
        FOREIGN KEY (instance_id) REFERENCES strategy_instances (id) ON DELETE CASCADE;

ALTER TABLE strategy_versions
    DROP CONSTRAINT IF EXISTS strategy_versions_instance_id_fkey,
    ADD CONSTRAINT strategy_versions_instance_id_fkey
        FOREIGN KEY (instance_id) REFERENCES strategy_instances (id) ON DELETE CASCADE;

ALTER TABLE github_sync_log
    DROP CONSTRAINT IF EXISTS github_sync_log_instance_id_fkey,
    ADD CONSTRAINT github_sync_log_instance_id_fkey
        FOREIGN KEY (instance_id) REFERENCES strategy_instances (id) ON DELETE CASCADE;

-- +goose Down
ALTER TABLE github_sync_log
    DROP CONSTRAINT IF EXISTS github_sync_log_instance_id_fkey,
    ADD CONSTRAINT github_sync_log_instance_id_fkey
        FOREIGN KEY (instance_id) REFERENCES strategy_instances (id);

ALTER TABLE strategy_versions
    DROP CONSTRAINT IF EXISTS strategy_versions_instance_id_fkey,
    ADD CONSTRAINT strategy_versions_instance_id_fkey
        FOREIGN KEY (instance_id) REFERENCES strategy_instances (id);

ALTER TABLE strategy_relationships
    DROP CONSTRAINT IF EXISTS strategy_relationships_instance_id_fkey,
    ADD CONSTRAINT strategy_relationships_instance_id_fkey
        FOREIGN KEY (instance_id) REFERENCES strategy_instances (id);

ALTER TABLE strategy_artifacts
    DROP CONSTRAINT IF EXISTS strategy_artifacts_instance_id_fkey,
    ADD CONSTRAINT strategy_artifacts_instance_id_fkey
        FOREIGN KEY (instance_id) REFERENCES strategy_instances (id);

ALTER TABLE strategy_mutations
    DROP CONSTRAINT IF EXISTS strategy_mutations_instance_id_fkey,
    ADD CONSTRAINT strategy_mutations_instance_id_fkey
        FOREIGN KEY (instance_id) REFERENCES strategy_instances (id);
