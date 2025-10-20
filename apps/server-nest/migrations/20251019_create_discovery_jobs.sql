-- Migration: Create discovery jobs table
-- Date: 2025-10-19
-- Description: Background jobs for automatic discovery of object types and relationships
BEGIN;

-- Create discovery_jobs table
CREATE TABLE IF NOT EXISTS kb.discovery_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    organization_id UUID NOT NULL,
    project_id UUID NOT NULL REFERENCES kb.projects(id) ON DELETE CASCADE,
    -- Job metadata
    status TEXT NOT NULL CHECK (
        status IN (
            'pending',
            'analyzing_documents',
            'extracting_types',
            'refining_schemas',
            'creating_pack',
            'completed',
            'failed',
            'cancelled'
        )
    ),
    progress JSONB NOT NULL DEFAULT '{"current_step": 0, "total_steps": 0, "message": "Initializing..."}',
    -- Configuration
    config JSONB NOT NULL DEFAULT '{}',
    -- {document_ids, batch_size, min_confidence, include_relationships, max_iterations}
    kb_purpose TEXT NOT NULL,
    -- Snapshot of purpose at discovery time
    -- Results
    discovered_types JSONB DEFAULT '[]',
    -- Array of candidate types with schemas
    discovered_relationships JSONB DEFAULT '[]',
    -- Array of candidate relationships
    template_pack_id UUID REFERENCES kb.graph_template_packs(id) ON DELETE
    SET
        NULL,
        -- Error handling
        error_message TEXT,
        retry_count INT DEFAULT 0,
        -- Timestamps
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        started_at TIMESTAMPTZ,
        completed_at TIMESTAMPTZ,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_discovery_jobs_project ON kb.discovery_jobs(project_id);

CREATE INDEX IF NOT EXISTS idx_discovery_jobs_status ON kb.discovery_jobs(status)
WHERE
    status IN (
        'pending',
        'analyzing_documents',
        'extracting_types',
        'refining_schemas'
    );

CREATE INDEX IF NOT EXISTS idx_discovery_jobs_created ON kb.discovery_jobs(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_discovery_jobs_template_pack ON kb.discovery_jobs(template_pack_id)
WHERE
    template_pack_id IS NOT NULL;

-- Add table comment
COMMENT ON TABLE kb.discovery_jobs IS 'Background jobs for automatic discovery of object types and relationships from documents using LLM analysis. Each job analyzes a set of documents based on KB purpose and generates a custom template pack for review and installation.';

COMMENT ON COLUMN kb.discovery_jobs.config IS 'Job configuration including document_ids (array), batch_size (int), min_confidence (float 0-1), include_relationships (bool), max_iterations (int)';

COMMENT ON COLUMN kb.discovery_jobs.progress IS 'Current progress state: {current_step: number, total_steps: number, message: string}';

COMMENT ON COLUMN kb.discovery_jobs.discovered_types IS 'Array of discovered type candidates: [{type_name, description, confidence, properties, required_properties, examples, frequency}]';

COMMENT ON COLUMN kb.discovery_jobs.discovered_relationships IS 'Array of discovered relationships: [{source_type, target_type, relation_type, description, confidence, cardinality}]';

COMMIT;