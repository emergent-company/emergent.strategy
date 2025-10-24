-- Migration: Rename org_id to organization_id for consistency
-- Date: 2025-10-24
-- Description: Standardize on organization_id across all tables (org_id -> organization_id)
-- Step 1: Rename org_id to organization_id in invites table
ALTER TABLE
    kb.invites RENAME COLUMN org_id TO organization_id;

-- Update index name for consistency
ALTER INDEX IF EXISTS kb.idx_invites_org_id RENAME TO idx_invites_organization_id;

-- Step 2: Rename org_id to organization_id in organization_memberships table
ALTER TABLE
    kb.organization_memberships RENAME COLUMN org_id TO organization_id;

-- Update unique constraint index name for consistency
ALTER INDEX IF EXISTS kb.idx_org_membership_unique RENAME TO idx_organization_membership_unique;

-- Update foreign key constraint names for consistency (if they exist)
DO $ $ BEGIN -- Drop old foreign key if it exists with old name
IF EXISTS (
    SELECT
        1
    FROM
        information_schema.table_constraints
    WHERE
        constraint_schema = 'kb'
        AND table_name = 'organization_memberships'
        AND constraint_name = 'organization_memberships_org_id_fkey'
) THEN
ALTER TABLE
    kb.organization_memberships DROP CONSTRAINT organization_memberships_org_id_fkey;

-- Recreate with new name
ALTER TABLE
    kb.organization_memberships
ADD
    CONSTRAINT organization_memberships_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES kb.orgs(id) ON DELETE CASCADE;

END IF;

END $ $;

-- Verify the changes
DO $ $ DECLARE org_id_count INTEGER;

organization_id_count INTEGER;

BEGIN -- Count tables with org_id (should be 0)
SELECT
    COUNT(*) INTO org_id_count
FROM
    information_schema.columns
WHERE
    table_schema = 'kb'
    AND column_name = 'org_id';

-- Count tables with organization_id (should be 21 now)
SELECT
    COUNT(*) INTO organization_id_count
FROM
    information_schema.columns
WHERE
    table_schema = 'kb'
    AND column_name = 'organization_id';

RAISE NOTICE 'Migration complete:';

RAISE NOTICE '  - Tables with org_id: %',
org_id_count;

RAISE NOTICE '  - Tables with organization_id: %',
organization_id_count;

IF org_id_count > 0 THEN RAISE WARNING 'Still have % tables with org_id column!',
org_id_count;

END IF;

END $ $;