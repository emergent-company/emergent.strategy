-- Migration: Extend template packs for discovery support
-- Date: 2025-10-19
-- Description: Add source tracking and pending review flag for discovered template packs
BEGIN;

-- Add new columns to template packs
ALTER TABLE
    kb.graph_template_packs
ADD
    COLUMN IF NOT EXISTS source TEXT DEFAULT 'manual' CHECK (
        source IN ('manual', 'discovered', 'imported', 'system')
    ),
ADD
    COLUMN IF NOT EXISTS discovery_job_id UUID REFERENCES kb.discovery_jobs(id) ON DELETE
SET
    NULL,
ADD
    COLUMN IF NOT EXISTS pending_review BOOLEAN DEFAULT FALSE;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_template_packs_source ON kb.graph_template_packs(source);

CREATE INDEX IF NOT EXISTS idx_template_packs_pending_review ON kb.graph_template_packs(pending_review)
WHERE
    pending_review = TRUE;

CREATE INDEX IF NOT EXISTS idx_template_packs_discovery_job ON kb.graph_template_packs(discovery_job_id)
WHERE
    discovery_job_id IS NOT NULL;

-- Add column comments
COMMENT ON COLUMN kb.graph_template_packs.source IS 'Origin of the template pack: manual (user-created), discovered (auto-discovery), imported (from file/marketplace), system (built-in)';

COMMENT ON COLUMN kb.graph_template_packs.discovery_job_id IS 'Reference to the discovery job that created this pack (if source=discovered)';

COMMENT ON COLUMN kb.graph_template_packs.pending_review IS 'Whether this pack needs user review before installation. Set to true for discovered packs until reviewed and edited.';

-- Update existing packs to have proper source
-- Note: Using source != 'system' instead of source IS NULL because
-- the ALTER TABLE ADD COLUMN with DEFAULT 'manual' sets existing rows to 'manual'
UPDATE
    kb.graph_template_packs
SET
    source = 'system'
WHERE
    name IN (
        'Extraction Demo Pack',
        'TOGAF Enterprise Architecture',
        'Meeting & Decision Management'
    )
    AND (
        source IS NULL
        OR source != 'system'
    );

COMMIT;