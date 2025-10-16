-- Migration: Add integration source tracking metadata
-- Related: docs/spec/22-clickup-integration.md section 3.3.1
-- Description: Adds fields to track external source, ID, URL, and sync status for imported objects
BEGIN;

-- ============================================================================
-- 1. ADD SOURCE TRACKING COLUMNS TO GRAPH_OBJECTS
-- ============================================================================
-- These columns enable bidirectional sync, deduplication, and traceability for imported objects
ALTER TABLE
    kb.graph_objects
ADD
    COLUMN IF NOT EXISTS external_source TEXT,
ADD
    COLUMN IF NOT EXISTS external_id TEXT,
ADD
    COLUMN IF NOT EXISTS external_url TEXT,
ADD
    COLUMN IF NOT EXISTS external_parent_id TEXT,
ADD
    COLUMN IF NOT EXISTS synced_at TIMESTAMPTZ,
ADD
    COLUMN IF NOT EXISTS external_updated_at TIMESTAMPTZ;

-- ============================================================================
-- 2. CREATE INDEXES FOR EFFICIENT LOOKUPS
-- ============================================================================
-- Composite unique index to prevent duplicate imports from same source
CREATE UNIQUE INDEX IF NOT EXISTS idx_graph_objects_external_source_id ON kb.graph_objects(external_source, external_id)
WHERE
    external_source IS NOT NULL
    AND external_id IS NOT NULL
    AND deleted_at IS NULL;

-- Index for filtering by integration source
CREATE INDEX IF NOT EXISTS idx_graph_objects_external_source ON kb.graph_objects(external_source)
WHERE
    external_source IS NOT NULL
    AND deleted_at IS NULL;

-- Index for finding objects by external parent (hierarchical imports)
CREATE INDEX IF NOT EXISTS idx_graph_objects_external_parent ON kb.graph_objects(external_source, external_parent_id)
WHERE
    external_source IS NOT NULL
    AND external_parent_id IS NOT NULL
    AND deleted_at IS NULL;

-- Index for sync status tracking
CREATE INDEX IF NOT EXISTS idx_graph_objects_synced_at ON kb.graph_objects(external_source, synced_at DESC)
WHERE
    external_source IS NOT NULL
    AND deleted_at IS NULL;

-- ============================================================================
-- 3. ADD COMMENTS FOR DOCUMENTATION
-- ============================================================================
COMMENT ON COLUMN kb.graph_objects.external_source IS 'Integration name (e.g., "clickup", "jira") for objects imported from external systems';

COMMENT ON COLUMN kb.graph_objects.external_id IS 'Unique identifier from the source system (e.g., ClickUp task ID "9hz")';

COMMENT ON COLUMN kb.graph_objects.external_url IS 'Direct link to view the object in the source system (e.g., "https://app.clickup.com/t/9hz")';

COMMENT ON COLUMN kb.graph_objects.external_parent_id IS 'External ID of the parent object in hierarchical structures (e.g., list ID for a task)';

COMMENT ON COLUMN kb.graph_objects.synced_at IS 'Timestamp of last successful sync from the external source';

COMMENT ON COLUMN kb.graph_objects.external_updated_at IS 'Last modified timestamp from the external source system (for conflict detection)';

-- ============================================================================
-- 4. CREATE HELPER FUNCTION FOR UPSERT BY EXTERNAL ID
-- ============================================================================
CREATE
OR REPLACE FUNCTION kb.upsert_graph_object_from_external(
    p_org_id UUID,
    p_project_id UUID,
    p_branch_id UUID,
    p_type TEXT,
    p_external_source TEXT,
    p_external_id TEXT,
    p_external_url TEXT,
    p_external_parent_id TEXT,
    p_external_updated_at TIMESTAMPTZ,
    p_properties JSONB,
    p_labels TEXT [] DEFAULT '{}'
) RETURNS UUID AS $ $ DECLARE v_object_id UUID;

v_existing_id UUID;

BEGIN -- Check if object with this external source+id already exists
SELECT
    id INTO v_existing_id
FROM
    kb.graph_objects
WHERE
    external_source = p_external_source
    AND external_id = p_external_id
    AND deleted_at IS NULL
LIMIT
    1;

IF v_existing_id IS NOT NULL THEN -- Update existing object
UPDATE
    kb.graph_objects
SET
    properties = p_properties,
    labels = p_labels,
    external_url = p_external_url,
    external_parent_id = p_external_parent_id,
    external_updated_at = p_external_updated_at,
    synced_at = now()
WHERE
    id = v_existing_id;

v_object_id := v_existing_id;

ELSE -- Insert new object
INSERT INTO
    kb.graph_objects (
        org_id,
        project_id,
        branch_id,
        type,
        properties,
        labels,
        external_source,
        external_id,
        external_url,
        external_parent_id,
        external_updated_at,
        synced_at
    )
VALUES
    (
        p_org_id,
        p_project_id,
        p_branch_id,
        p_type,
        p_properties,
        p_labels,
        p_external_source,
        p_external_id,
        p_external_url,
        p_external_parent_id,
        p_external_updated_at,
        now()
    ) RETURNING id INTO v_object_id;

END IF;

RETURN v_object_id;

END;

$ $ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION kb.upsert_graph_object_from_external IS 'Inserts or updates a graph object from an external integration source. Prevents duplicates by matching on (external_source, external_id).';

-- ============================================================================
-- 5. CREATE VIEW FOR INTEGRATION SOURCE STATS
-- ============================================================================
CREATE
OR REPLACE VIEW kb.integration_source_stats AS
SELECT
    external_source,
    project_id,
    type,
    COUNT(*) as object_count,
    MAX(synced_at) as last_sync,
    MIN(synced_at) as first_sync,
    COUNT(*) FILTER (
        WHERE
            synced_at > now() - interval '24 hours'
    ) as synced_last_24h
FROM
    kb.graph_objects
WHERE
    external_source IS NOT NULL
    AND deleted_at IS NULL
GROUP BY
    external_source,
    project_id,
    type;

COMMENT ON VIEW kb.integration_source_stats IS 'Statistics on objects imported from each integration source, grouped by project and type';

COMMIT;