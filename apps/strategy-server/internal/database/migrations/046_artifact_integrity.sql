-- +goose Up
-- Content integrity: record when an artifact is unmodified canonical content
-- (a definition, template or packaged value model) rather than something the
-- company wrote. NULL integrity_class means authored; integrity_checked_with
-- tells "authored" from "never classified" and names the manifest used, so a
-- new canonical release can trigger reclassification.
ALTER TABLE strategy_artifacts
    ADD COLUMN IF NOT EXISTS integrity_class        TEXT,
    ADD COLUMN IF NOT EXISTS integrity_ref          TEXT,
    ADD COLUMN IF NOT EXISTS integrity_checked_with TEXT;

ALTER TABLE strategy_artifacts
    ADD CONSTRAINT strategy_artifacts_integrity_class_chk
    CHECK (integrity_class IS NULL OR integrity_class IN (
        'canonical_reference', 'unmodified_template', 'packaged_default',
        'template_values', 'near_canonical'));

CREATE INDEX strategy_artifacts_integrity_idx
    ON strategy_artifacts (instance_id, integrity_class)
    WHERE integrity_class IS NOT NULL;

-- +goose Down
DROP INDEX IF EXISTS strategy_artifacts_integrity_idx;
ALTER TABLE strategy_artifacts DROP CONSTRAINT IF EXISTS strategy_artifacts_integrity_class_chk;
ALTER TABLE strategy_artifacts
    DROP COLUMN IF EXISTS integrity_checked_with,
    DROP COLUMN IF EXISTS integrity_ref,
    DROP COLUMN IF EXISTS integrity_class;
