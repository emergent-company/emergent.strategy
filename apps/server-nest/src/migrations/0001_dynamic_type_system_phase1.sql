-- Phase 1: Dynamic Type Discovery & Smart Ingestion - Foundation
-- Related: spec/24-dynamic-type-discovery-and-ingestion.md
-- Description: Adds template packs, project type registry, extraction jobs, and type suggestions
BEGIN;

-- ============================================================================
-- 1. TEMPLATE PACKS - Global registry of reusable type collections
-- ============================================================================
-- Core template pack definitions (versioned, immutable)
CREATE TABLE IF NOT EXISTS kb.graph_template_packs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    version TEXT NOT NULL,
    description TEXT,
    -- Metadata
    author TEXT,
    license TEXT,
    repository_url TEXT,
    documentation_url TEXT,
    -- Content
    object_type_schemas JSONB NOT NULL DEFAULT '{}',
    -- map of type -> schema
    relationship_type_schemas JSONB NOT NULL DEFAULT '{}',
    -- map of type -> schema
    ui_configs JSONB NOT NULL DEFAULT '{}',
    -- UI hints per type
    extraction_prompts JSONB NOT NULL DEFAULT '{}',
    -- AI extraction prompts per type
    sql_views JSONB DEFAULT '[]',
    -- optional SQL views for analytics
    -- Security
    signature TEXT,
    -- Ed25519 signature for verification
    checksum TEXT,
    -- SHA256 of content
    -- Lifecycle
    published_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deprecated_at TIMESTAMPTZ,
    superseded_by UUID REFERENCES kb.graph_template_packs(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (name, version)
);

CREATE INDEX IF NOT EXISTS idx_template_packs_name ON kb.graph_template_packs(name);

CREATE INDEX IF NOT EXISTS idx_template_packs_published ON kb.graph_template_packs(published_at DESC)
WHERE
    deprecated_at IS NULL;

-- ============================================================================
-- 2. PROJECT TEMPLATE ASSIGNMENT - Which packs are installed per project
-- ============================================================================
CREATE TABLE IF NOT EXISTS kb.project_template_packs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    organization_id UUID NOT NULL,
    project_id UUID NOT NULL REFERENCES kb.projects(id) ON DELETE CASCADE,
    template_pack_id UUID NOT NULL REFERENCES kb.graph_template_packs(id) ON DELETE RESTRICT,
    -- Installation details
    installed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    installed_by UUID NOT NULL,
    -- user_id
    active BOOLEAN NOT NULL DEFAULT true,
    -- Customizations override template defaults
    customizations JSONB DEFAULT '{}',
    -- { enabledTypes, disabledTypes, schemaOverrides }
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (project_id, template_pack_id)
);

CREATE INDEX IF NOT EXISTS idx_project_template_packs_project ON kb.project_template_packs(project_id, active);

CREATE INDEX IF NOT EXISTS idx_project_template_packs_template ON kb.project_template_packs(template_pack_id);

CREATE INDEX IF NOT EXISTS idx_project_template_packs_org ON kb.project_template_packs(organization_id, project_id);

-- RLS for project_template_packs
ALTER TABLE
    kb.project_template_packs ENABLE ROW LEVEL SECURITY;

ALTER TABLE
    kb.project_template_packs FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS project_template_packs_select_policy ON kb.project_template_packs;

CREATE POLICY project_template_packs_select_policy ON kb.project_template_packs FOR
SELECT
    USING (
        organization_id = current_setting('app.current_organization_id', true) :: uuid
        AND project_id = current_setting('app.current_project_id', true) :: uuid
    );

DROP POLICY IF EXISTS project_template_packs_insert_policy ON kb.project_template_packs;

CREATE POLICY project_template_packs_insert_policy ON kb.project_template_packs FOR
INSERT
    WITH CHECK (
        organization_id = current_setting('app.current_organization_id', true) :: uuid
        AND project_id = current_setting('app.current_project_id', true) :: uuid
    );

DROP POLICY IF EXISTS project_template_packs_update_policy ON kb.project_template_packs;

CREATE POLICY project_template_packs_update_policy ON kb.project_template_packs FOR
UPDATE
    USING (
        organization_id = current_setting('app.current_organization_id', true) :: uuid
        AND project_id = current_setting('app.current_project_id', true) :: uuid
    );

DROP POLICY IF EXISTS project_template_packs_delete_policy ON kb.project_template_packs;

CREATE POLICY project_template_packs_delete_policy ON kb.project_template_packs FOR DELETE USING (
    organization_id = current_setting('app.current_organization_id', true) :: uuid
    AND project_id = current_setting('app.current_project_id', true) :: uuid
);

-- ============================================================================
-- 3. PROJECT TYPE REGISTRY - Active types per project (template + custom + discovered)
-- ============================================================================
CREATE TABLE IF NOT EXISTS kb.project_object_type_registry (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    organization_id UUID NOT NULL,
    project_id UUID NOT NULL REFERENCES kb.projects(id) ON DELETE CASCADE,
    -- Type definition
    type TEXT NOT NULL,
    -- e.g., "Requirement", "Feature"
    source TEXT NOT NULL,
    -- 'template' | 'custom' | 'discovered'
    template_pack_id UUID REFERENCES kb.graph_template_packs(id) ON DELETE CASCADE,
    -- Schema versioning
    schema_version INT NOT NULL DEFAULT 1,
    json_schema JSONB NOT NULL,
    -- JSON Schema for validation
    -- UI configuration
    ui_config JSONB DEFAULT '{}',
    -- { icon, color, formLayout, listView }
    -- Extraction configuration (for smart ingestion)
    extraction_config JSONB DEFAULT '{}',
    -- { prompts, examples, relationshipHints }
    -- Status
    enabled BOOLEAN NOT NULL DEFAULT true,
    discovery_confidence REAL,
    -- 0.0-1.0 for discovered types
    -- Metadata
    description TEXT,
    created_by UUID,
    -- user_id
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (project_id, type),
    CHECK (source IN ('template', 'custom', 'discovered')),
    CHECK (
        discovery_confidence IS NULL
        OR (
            discovery_confidence >= 0.0
            AND discovery_confidence <= 1.0
        )
    )
);

CREATE INDEX IF NOT EXISTS idx_project_type_registry_project ON kb.project_object_type_registry(project_id, enabled);

CREATE INDEX IF NOT EXISTS idx_project_type_registry_source ON kb.project_object_type_registry(source);

CREATE INDEX IF NOT EXISTS idx_project_type_registry_template ON kb.project_object_type_registry(template_pack_id)
WHERE
    template_pack_id IS NOT NULL;

-- RLS for project_object_type_registry
ALTER TABLE
    kb.project_object_type_registry ENABLE ROW LEVEL SECURITY;

ALTER TABLE
    kb.project_object_type_registry FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS project_type_registry_select_policy ON kb.project_object_type_registry;

CREATE POLICY project_type_registry_select_policy ON kb.project_object_type_registry FOR
SELECT
    USING (
        organization_id = current_setting('app.current_organization_id', true) :: uuid
        AND project_id = current_setting('app.current_project_id', true) :: uuid
    );

DROP POLICY IF EXISTS project_type_registry_insert_policy ON kb.project_object_type_registry;

CREATE POLICY project_type_registry_insert_policy ON kb.project_object_type_registry FOR
INSERT
    WITH CHECK (
        organization_id = current_setting('app.current_organization_id', true) :: uuid
        AND project_id = current_setting('app.current_project_id', true) :: uuid
    );

DROP POLICY IF EXISTS project_type_registry_update_policy ON kb.project_object_type_registry;

CREATE POLICY project_type_registry_update_policy ON kb.project_object_type_registry FOR
UPDATE
    USING (
        organization_id = current_setting('app.current_organization_id', true) :: uuid
        AND project_id = current_setting('app.current_project_id', true) :: uuid
    );

DROP POLICY IF EXISTS project_type_registry_delete_policy ON kb.project_object_type_registry;

CREATE POLICY project_type_registry_delete_policy ON kb.project_object_type_registry FOR DELETE USING (
    organization_id = current_setting('app.current_organization_id', true) :: uuid
    AND project_id = current_setting('app.current_project_id', true) :: uuid
);

-- ============================================================================
-- 4. EXTRACTION JOBS - Track document processing for object extraction
-- ============================================================================
CREATE TABLE IF NOT EXISTS kb.object_extraction_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    organization_id UUID NOT NULL,
    project_id UUID NOT NULL REFERENCES kb.projects(id) ON DELETE CASCADE,
    -- Scope
    document_id UUID REFERENCES kb.documents(id) ON DELETE CASCADE,
    chunk_id UUID REFERENCES kb.chunks(id) ON DELETE CASCADE,
    -- optional, chunk-level
    -- Job configuration
    job_type TEXT NOT NULL DEFAULT 'full_extraction',
    -- 'full_extraction' | 'type_discovery' | 'reprocessing'
    status TEXT NOT NULL DEFAULT 'pending',
    -- 'pending' | 'processing' | 'completed' | 'failed'
    -- Type configuration
    enabled_types TEXT [] DEFAULT '{}',
    -- Which types to extract
    extraction_config JSONB DEFAULT '{}',
    -- { minConfidence, requireReview, extractRelationships }
    -- Results
    objects_created INT DEFAULT 0,
    relationships_created INT DEFAULT 0,
    suggestions_created INT DEFAULT 0,
    -- Execution tracking
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    error_message TEXT,
    retry_count INT DEFAULT 0,
    max_retries INT DEFAULT 3,
    -- Provenance
    created_by UUID,
    -- user_id or NULL for system
    reprocessing_of UUID REFERENCES kb.object_extraction_jobs(id),
    -- for re-runs
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (
        job_type IN (
            'full_extraction',
            'type_discovery',
            'reprocessing'
        )
    ),
    CHECK (
        status IN (
            'pending',
            'processing',
            'completed',
            'failed',
            'cancelled'
        )
    ),
    CHECK (retry_count >= 0),
    CHECK (retry_count <= max_retries)
);

CREATE INDEX IF NOT EXISTS idx_extraction_jobs_project_status ON kb.object_extraction_jobs(project_id, status);

CREATE INDEX IF NOT EXISTS idx_extraction_jobs_document ON kb.object_extraction_jobs(document_id)
WHERE
    document_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_extraction_jobs_status_created ON kb.object_extraction_jobs(status, created_at)
WHERE
    status IN ('pending', 'processing');

-- RLS for object_extraction_jobs
ALTER TABLE
    kb.object_extraction_jobs ENABLE ROW LEVEL SECURITY;

ALTER TABLE
    kb.object_extraction_jobs FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS extraction_jobs_select_policy ON kb.object_extraction_jobs;

CREATE POLICY extraction_jobs_select_policy ON kb.object_extraction_jobs FOR
SELECT
    USING (
        organization_id = current_setting('app.current_organization_id', true) :: uuid
        AND project_id = current_setting('app.current_project_id', true) :: uuid
    );

DROP POLICY IF EXISTS extraction_jobs_insert_policy ON kb.object_extraction_jobs;

CREATE POLICY extraction_jobs_insert_policy ON kb.object_extraction_jobs FOR
INSERT
    WITH CHECK (
        organization_id = current_setting('app.current_organization_id', true) :: uuid
        AND project_id = current_setting('app.current_project_id', true) :: uuid
    );

DROP POLICY IF EXISTS extraction_jobs_update_policy ON kb.object_extraction_jobs;

CREATE POLICY extraction_jobs_update_policy ON kb.object_extraction_jobs FOR
UPDATE
    USING (
        organization_id = current_setting('app.current_organization_id', true) :: uuid
        AND project_id = current_setting('app.current_project_id', true) :: uuid
    );

-- ============================================================================
-- 5. TYPE SUGGESTIONS - AI-discovered new object types
-- ============================================================================
CREATE TABLE IF NOT EXISTS kb.object_type_suggestions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    organization_id UUID NOT NULL,
    project_id UUID NOT NULL REFERENCES kb.projects(id) ON DELETE CASCADE,
    -- Suggestion details
    suggested_type TEXT NOT NULL,
    -- Proposed type name
    description TEXT,
    -- Discovery context
    source TEXT NOT NULL DEFAULT 'pattern_analysis',
    -- 'pattern_analysis' | 'user_feedback' | 'import'
    confidence REAL NOT NULL,
    -- 0.0-1.0
    -- Schema inference
    inferred_schema JSONB NOT NULL,
    example_instances JSONB DEFAULT '[]',
    -- Sample extracted objects
    frequency INT DEFAULT 1,
    -- How often this pattern appears
    -- Evidence
    source_document_ids UUID [] DEFAULT '{}',
    source_chunk_ids UUID [] DEFAULT '{}',
    similar_to_types TEXT [],
    -- Existing types this resembles
    -- Review status
    status TEXT NOT NULL DEFAULT 'pending',
    -- 'pending' | 'accepted' | 'rejected' | 'merged'
    reviewed_by UUID,
    reviewed_at TIMESTAMPTZ,
    review_notes TEXT,
    -- If accepted/merged
    accepted_as_type TEXT,
    merged_into_type TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (
        source IN ('pattern_analysis', 'user_feedback', 'import')
    ),
    CHECK (
        confidence >= 0.0
        AND confidence <= 1.0
    ),
    CHECK (
        status IN ('pending', 'accepted', 'rejected', 'merged')
    ),
    CHECK (frequency >= 1)
);

CREATE INDEX IF NOT EXISTS idx_type_suggestions_project_status ON kb.object_type_suggestions(project_id, status);

CREATE INDEX IF NOT EXISTS idx_type_suggestions_confidence ON kb.object_type_suggestions(confidence DESC)
WHERE
    status = 'pending';

CREATE INDEX IF NOT EXISTS idx_type_suggestions_created ON kb.object_type_suggestions(created_at DESC);

-- RLS for object_type_suggestions
ALTER TABLE
    kb.object_type_suggestions ENABLE ROW LEVEL SECURITY;

ALTER TABLE
    kb.object_type_suggestions FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS type_suggestions_select_policy ON kb.object_type_suggestions;

CREATE POLICY type_suggestions_select_policy ON kb.object_type_suggestions FOR
SELECT
    USING (
        organization_id = current_setting('app.current_organization_id', true) :: uuid
        AND project_id = current_setting('app.current_project_id', true) :: uuid
    );

DROP POLICY IF EXISTS type_suggestions_insert_policy ON kb.object_type_suggestions;

CREATE POLICY type_suggestions_insert_policy ON kb.object_type_suggestions FOR
INSERT
    WITH CHECK (
        organization_id = current_setting('app.current_organization_id', true) :: uuid
        AND project_id = current_setting('app.current_project_id', true) :: uuid
    );

DROP POLICY IF EXISTS type_suggestions_update_policy ON kb.object_type_suggestions;

CREATE POLICY type_suggestions_update_policy ON kb.object_type_suggestions FOR
UPDATE
    USING (
        organization_id = current_setting('app.current_organization_id', true) :: uuid
        AND project_id = current_setting('app.current_project_id', true) :: uuid
    );

-- ============================================================================
-- 6. ENHANCE GRAPH_OBJECTS - Add extraction provenance
-- ============================================================================
-- Add extraction tracking columns to existing graph_objects table
ALTER TABLE
    kb.graph_objects
ADD
    COLUMN IF NOT EXISTS extraction_job_id UUID REFERENCES kb.object_extraction_jobs(id) ON DELETE
SET
    NULL,
ADD
    COLUMN IF NOT EXISTS extraction_confidence REAL CHECK (
        extraction_confidence IS NULL
        OR (
            extraction_confidence >= 0.0
            AND extraction_confidence <= 1.0
        )
    ),
ADD
    COLUMN IF NOT EXISTS needs_review BOOLEAN DEFAULT false,
ADD
    COLUMN IF NOT EXISTS reviewed_by UUID,
ADD
    COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_graph_objects_extraction_job ON kb.graph_objects(extraction_job_id)
WHERE
    extraction_job_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_graph_objects_needs_review ON kb.graph_objects(project_id, needs_review)
WHERE
    needs_review = true;

CREATE INDEX IF NOT EXISTS idx_graph_objects_confidence ON kb.graph_objects(extraction_confidence DESC)
WHERE
    extraction_confidence IS NOT NULL;

-- ============================================================================
-- 7. HELPER FUNCTIONS
-- ============================================================================
-- Function to get active types for a project (merges template + custom + discovered)
CREATE
OR REPLACE FUNCTION kb.get_project_active_types(p_project_id UUID) RETURNS TABLE (
    type TEXT,
    source TEXT,
    json_schema JSONB,
    ui_config JSONB,
    extraction_config JSONB
) AS $ $ BEGIN RETURN QUERY
SELECT
    ptr.type,
    ptr.source,
    ptr.json_schema,
    ptr.ui_config,
    ptr.extraction_config
FROM
    kb.project_object_type_registry ptr
WHERE
    ptr.project_id = p_project_id
    AND ptr.enabled = true
ORDER BY
    ptr.type;

END;

$ $ LANGUAGE plpgsql STABLE SECURITY DEFINER;

COMMIT;