-- Migration: Rename org_id to organization_id in documents table
-- Date: 2025-10-25
-- Description: Complete the organization_id standardization by renaming documents.org_id

-- Rename the column
ALTER TABLE kb.documents 
    RENAME COLUMN org_id TO organization_id;

-- Update the index name for consistency
ALTER INDEX IF EXISTS kb.idx_documents_org_id 
    RENAME TO idx_documents_organization_id;

-- Update any foreign key constraint names
DO $$
BEGIN
    -- Drop old foreign key if it exists with old name
    IF EXISTS (
        SELECT 1
        FROM information_schema.table_constraints
        WHERE constraint_schema = 'kb'
          AND table_name = 'documents'
          AND constraint_name = 'documents_org_id_fkey'
    ) THEN
        ALTER TABLE kb.documents 
            DROP CONSTRAINT documents_org_id_fkey;
        
        -- Recreate with new name
        ALTER TABLE kb.documents
            ADD CONSTRAINT documents_organization_id_fkey 
            FOREIGN KEY (organization_id) 
            REFERENCES kb.orgs(id) 
            ON DELETE CASCADE;
    END IF;
END $$;

-- Verify no more org_id columns exist
DO $$
DECLARE
    org_id_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO org_id_count
    FROM information_schema.columns
    WHERE table_schema = 'kb'
      AND column_name = 'org_id';
    
    IF org_id_count > 0 THEN
        RAISE WARNING 'Still have % tables with org_id column!', org_id_count;
    ELSE
        RAISE NOTICE 'Migration complete: All org_id columns renamed to organization_id';
    END IF;
END $$;
