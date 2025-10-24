-- Migration: Create tags table
-- Description: Add tags table for product version tagging system
-- Date: 2025-10-24
-- ============================================================================
CREATE TABLE kb.tags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL,
    org_id UUID NOT NULL,
    product_version_id UUID,
    name TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- Foreign keys
    CONSTRAINT fk_tags_project FOREIGN KEY (project_id) REFERENCES kb.projects(id) ON DELETE CASCADE,
    CONSTRAINT fk_tags_organization FOREIGN KEY (org_id) REFERENCES kb.orgs(id) ON DELETE CASCADE,
    CONSTRAINT fk_tags_product_version FOREIGN KEY (product_version_id) REFERENCES kb.product_versions(id) ON DELETE CASCADE,
    -- Constraints
    CONSTRAINT check_tags_name_not_empty CHECK (length(trim(name)) > 0)
);

-- Indexes for performance
CREATE INDEX idx_tags_project_id ON kb.tags(project_id);

CREATE INDEX idx_tags_org_id ON kb.tags(org_id);

CREATE INDEX idx_tags_product_version_id ON kb.tags(product_version_id);

CREATE INDEX idx_tags_name ON kb.tags(name);

CREATE INDEX idx_tags_created_at ON kb.tags(created_at DESC);

-- Unique constraint to prevent duplicate tag names per project
CREATE UNIQUE INDEX idx_tags_project_name_unique ON kb.tags(project_id, LOWER(name));

-- Enable RLS
ALTER TABLE
    kb.tags ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY tags_isolation ON kb.tags USING (
    org_id :: text = current_setting('app.current_organization_id', TRUE)
);

CREATE POLICY tags_read ON kb.tags FOR
SELECT
    USING (
        org_id :: text = current_setting('app.current_organization_id', TRUE)
    );

CREATE POLICY tags_insert ON kb.tags FOR
INSERT
    WITH CHECK (
        org_id :: text = current_setting('app.current_organization_id', TRUE)
    );

CREATE POLICY tags_update ON kb.tags FOR
UPDATE
    USING (
        org_id :: text = current_setting('app.current_organization_id', TRUE)
    );

CREATE POLICY tags_delete ON kb.tags FOR DELETE USING (
    org_id :: text = current_setting('app.current_organization_id', TRUE)
);

-- Updated timestamp trigger
CREATE TRIGGER tags_updated_at_trigger BEFORE
UPDATE
    ON kb.tags FOR EACH ROW EXECUTE FUNCTION kb.update_updated_at_column();

-- Table comment
COMMENT ON TABLE kb.tags IS 'Tags for organizing and categorizing product versions';

COMMENT ON COLUMN kb.tags.id IS 'Unique identifier for the tag';

COMMENT ON COLUMN kb.tags.project_id IS 'Project this tag belongs to';

COMMENT ON COLUMN kb.tags.org_id IS 'Organization this tag belongs to (for RLS)';

COMMENT ON COLUMN kb.tags.product_version_id IS 'Optional product version this tag is associated with';

COMMENT ON COLUMN kb.tags.name IS 'Tag name (unique per project, case-insensitive)';

COMMENT ON COLUMN kb.tags.description IS 'Optional description of what this tag represents';