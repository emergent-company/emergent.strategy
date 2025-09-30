-- Tags table migration
-- Allows symbolic references to product versions (e.g., 'stable', 'latest', 'rc', 'LTS')
-- Per spec Section 5.8: Tags simply reference product_version_id; deleting a tag does not affect the snapshot
BEGIN;

CREATE TABLE IF NOT EXISTS kb.tags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NULL,
    project_id UUID NOT NULL,
    product_version_id UUID NOT NULL REFERENCES kb.product_versions(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT tags_project_name_unique UNIQUE (project_id, name)
);

-- Index for fast lookup by product version
CREATE INDEX IF NOT EXISTS idx_tags_product_version_id ON kb.tags(product_version_id);

-- Index for fast lookup by project
CREATE INDEX IF NOT EXISTS idx_tags_project_id ON kb.tags(project_id);

-- Index for case-insensitive name lookup within project
CREATE INDEX IF NOT EXISTS idx_tags_project_name_lower ON kb.tags(project_id, LOWER(name));

COMMENT ON TABLE kb.tags IS 'Symbolic tags pointing to product version snapshots (e.g., stable, latest, rc)';

COMMENT ON COLUMN kb.tags.name IS 'Unique tag name within project scope (e.g., stable, latest, v1.0-lts)';

COMMENT ON COLUMN kb.tags.product_version_id IS 'Reference to product version; CASCADE delete ensures orphan cleanup';

COMMIT;