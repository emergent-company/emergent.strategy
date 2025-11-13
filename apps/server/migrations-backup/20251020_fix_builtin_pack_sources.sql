-- Migration: Fix built-in template pack sources
-- Date: 2025-10-20
-- Description: Update existing built-in packs to have source='system' 
--              (previous migration only updated NULL values, but they already had 'manual')
BEGIN;

-- Update the three built-in packs to have source='system'
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
    AND source != 'system';

-- Only update if not already system
COMMIT;