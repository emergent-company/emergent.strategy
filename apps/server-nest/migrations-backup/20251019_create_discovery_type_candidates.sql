-- Migration: Create discovery type candidates table
-- Date: 2025-10-19
-- Description: Working memory for type candidates during discovery process
BEGIN;

-- Create discovery_type_candidates table
CREATE TABLE IF NOT EXISTS kb.discovery_type_candidates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID NOT NULL REFERENCES kb.discovery_jobs(id) ON DELETE CASCADE,
    batch_number INT NOT NULL,
    -- Which batch discovered this type
    -- Type information
    type_name TEXT NOT NULL,
    description TEXT,
    confidence REAL NOT NULL CHECK (
        confidence >= 0
        AND confidence <= 1
    ),
    -- Schema
    inferred_schema JSONB NOT NULL,
    example_instances JSONB DEFAULT '[]',
    -- Sample extracted objects
    frequency INT DEFAULT 1,
    -- How many instances found
    -- Relationships
    proposed_relationships JSONB DEFAULT '[]',
    -- Array of {target_type, relation_type, description}
    -- Evidence
    source_document_ids UUID [] DEFAULT '{}',
    extraction_context TEXT,
    -- Snippet showing where type was discovered
    -- Refinement tracking
    refinement_iteration INT DEFAULT 1,
    merged_from UUID [],
    -- If this type was merged from others
    -- Status
    status TEXT NOT NULL DEFAULT 'candidate' CHECK (
        status IN ('candidate', 'approved', 'rejected', 'merged')
    ),
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_discovery_candidates_job ON kb.discovery_type_candidates(job_id);

CREATE INDEX IF NOT EXISTS idx_discovery_candidates_status ON kb.discovery_type_candidates(job_id, status);

CREATE INDEX IF NOT EXISTS idx_discovery_candidates_confidence ON kb.discovery_type_candidates(job_id, confidence DESC);

CREATE INDEX IF NOT EXISTS idx_discovery_candidates_batch ON kb.discovery_type_candidates(job_id, batch_number);

-- Add table comment
COMMENT ON TABLE kb.discovery_type_candidates IS 'Working memory for type candidates during the discovery process. Stores intermediate results from each batch analysis before refinement and merging into final discovered_types.';

COMMENT ON COLUMN kb.discovery_type_candidates.inferred_schema IS 'JSON Schema inferred from document analysis: {type: "object", properties: {...}, required: [...]}';

COMMENT ON COLUMN kb.discovery_type_candidates.example_instances IS 'Array of 2-5 sample instances extracted from documents, used for schema validation and user preview';

COMMENT ON COLUMN kb.discovery_type_candidates.extraction_context IS 'Text snippet showing where this type was identified in the source documents, for provenance and debugging';

COMMIT;