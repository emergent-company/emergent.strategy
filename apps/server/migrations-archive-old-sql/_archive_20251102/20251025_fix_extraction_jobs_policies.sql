-- Migration: Add RLS policies for object_extraction_jobs table
-- Date: 2025-10-25
-- Description: Create RLS policies that were missing due to org_id → organization_id rename
-- The original 0001_init.sql policies reference org_id which no longer exists
-- Enable RLS on object_extraction_jobs (should already be enabled, but ensure it)
ALTER TABLE
    kb.object_extraction_jobs ENABLE ROW LEVEL SECURITY;

-- SELECT policy: Users can see extraction jobs for projects they have access to
CREATE POLICY extraction_jobs_select_policy ON kb.object_extraction_jobs FOR
SELECT
    USING (
        project_id IN (
            SELECT
                p.id
            FROM
                kb.projects p
                JOIN kb.orgs o ON (p.organization_id = o.id)
            WHERE
                p.id = object_extraction_jobs.project_id
        )
    );

-- INSERT policy: Users can create extraction jobs for projects they have access to
CREATE POLICY extraction_jobs_insert_policy ON kb.object_extraction_jobs FOR
INSERT
    WITH CHECK (
        project_id IN (
            SELECT
                p.id
            FROM
                kb.projects p
                JOIN kb.orgs o ON (p.organization_id = o.id)
            WHERE
                p.id = object_extraction_jobs.project_id
        )
    );

-- UPDATE policy: Users can update extraction jobs for projects they have access to
CREATE POLICY extraction_jobs_update_policy ON kb.object_extraction_jobs FOR
UPDATE
    USING (
        project_id IN (
            SELECT
                p.id
            FROM
                kb.projects p
                JOIN kb.orgs o ON (p.organization_id = o.id)
            WHERE
                p.id = object_extraction_jobs.project_id
        )
    );

-- DELETE policy: Users can delete extraction jobs for projects they have access to
CREATE POLICY extraction_jobs_delete_policy ON kb.object_extraction_jobs FOR DELETE USING (
    project_id IN (
        SELECT
            p.id
        FROM
            kb.projects p
            JOIN kb.orgs o ON (p.organization_id = o.id)
        WHERE
            p.id = object_extraction_jobs.project_id
    )
);

-- Verify policies were created
DO $$ DECLARE policy_count INTEGER;

BEGIN
SELECT
    COUNT(*) INTO policy_count
FROM
    pg_policies
WHERE
    schemaname = 'kb'
    AND tablename = 'object_extraction_jobs';

IF policy_count = 4 THEN RAISE NOTICE 'Migration complete: 4 RLS policies created for object_extraction_jobs';

ELSE RAISE WARNING 'Expected 4 policies, found %',
policy_count;

END IF;

END $$;