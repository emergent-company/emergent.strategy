-- Migration: Fix RLS policies to handle empty tenant context
-- Date: 2025-10-18
-- Issue: RLS policies with UUID casting fail when current_setting returns empty string
-- Solution: Allow empty context (system operations) OR tenant-scoped operations
-- ============================================================================
-- Fix object_extraction_jobs policies
-- ============================================================================
DROP POLICY IF EXISTS extraction_jobs_select_policy ON kb.object_extraction_jobs;

DROP POLICY IF EXISTS extraction_jobs_insert_policy ON kb.object_extraction_jobs;

DROP POLICY IF EXISTS extraction_jobs_update_policy ON kb.object_extraction_jobs;

DROP POLICY IF EXISTS extraction_jobs_delete_policy ON kb.object_extraction_jobs;

CREATE POLICY extraction_jobs_select_policy ON kb.object_extraction_jobs FOR
SELECT
    USING (
        (
            COALESCE(
                current_setting('app.current_organization_id', true),
                ''
            ) = ''
            AND COALESCE(
                current_setting('app.current_project_id', true),
                ''
            ) = ''
        )
        OR (
            organization_id :: text = current_setting('app.current_organization_id', true)
            AND project_id :: text = current_setting('app.current_project_id', true)
        )
    );

CREATE POLICY extraction_jobs_insert_policy ON kb.object_extraction_jobs FOR
INSERT
    WITH CHECK (
        (
            COALESCE(
                current_setting('app.current_organization_id', true),
                ''
            ) = ''
            AND COALESCE(
                current_setting('app.current_project_id', true),
                ''
            ) = ''
        )
        OR (
            organization_id :: text = current_setting('app.current_organization_id', true)
            AND project_id :: text = current_setting('app.current_project_id', true)
        )
    );

CREATE POLICY extraction_jobs_update_policy ON kb.object_extraction_jobs FOR
UPDATE
    USING (
        (
            COALESCE(
                current_setting('app.current_organization_id', true),
                ''
            ) = ''
            AND COALESCE(
                current_setting('app.current_project_id', true),
                ''
            ) = ''
        )
        OR (
            organization_id :: text = current_setting('app.current_organization_id', true)
            AND project_id :: text = current_setting('app.current_project_id', true)
        )
    );

CREATE POLICY extraction_jobs_delete_policy ON kb.object_extraction_jobs FOR DELETE USING (
    (
        COALESCE(
            current_setting('app.current_organization_id', true),
            ''
        ) = ''
        AND COALESCE(
            current_setting('app.current_project_id', true),
            ''
        ) = ''
    )
    OR (
        organization_id :: text = current_setting('app.current_organization_id', true)
        AND project_id :: text = current_setting('app.current_project_id', true)
    )
);

-- ============================================================================
-- Fix project_template_packs policies
-- ============================================================================
DROP POLICY IF EXISTS project_template_packs_select_policy ON kb.project_template_packs;

DROP POLICY IF EXISTS project_template_packs_insert_policy ON kb.project_template_packs;

DROP POLICY IF EXISTS project_template_packs_update_policy ON kb.project_template_packs;

DROP POLICY IF EXISTS project_template_packs_delete_policy ON kb.project_template_packs;

CREATE POLICY project_template_packs_select_policy ON kb.project_template_packs FOR
SELECT
    USING (
        (
            COALESCE(
                current_setting('app.current_organization_id', true),
                ''
            ) = ''
            AND COALESCE(
                current_setting('app.current_project_id', true),
                ''
            ) = ''
        )
        OR (
            organization_id :: text = current_setting('app.current_organization_id', true)
            AND project_id :: text = current_setting('app.current_project_id', true)
        )
    );

CREATE POLICY project_template_packs_insert_policy ON kb.project_template_packs FOR
INSERT
    WITH CHECK (
        (
            COALESCE(
                current_setting('app.current_organization_id', true),
                ''
            ) = ''
            AND COALESCE(
                current_setting('app.current_project_id', true),
                ''
            ) = ''
        )
        OR (
            organization_id :: text = current_setting('app.current_organization_id', true)
            AND project_id :: text = current_setting('app.current_project_id', true)
        )
    );

CREATE POLICY project_template_packs_update_policy ON kb.project_template_packs FOR
UPDATE
    USING (
        (
            COALESCE(
                current_setting('app.current_organization_id', true),
                ''
            ) = ''
            AND COALESCE(
                current_setting('app.current_project_id', true),
                ''
            ) = ''
        )
        OR (
            organization_id :: text = current_setting('app.current_organization_id', true)
            AND project_id :: text = current_setting('app.current_project_id', true)
        )
    );

CREATE POLICY project_template_packs_delete_policy ON kb.project_template_packs FOR DELETE USING (
    (
        COALESCE(
            current_setting('app.current_organization_id', true),
            ''
        ) = ''
        AND COALESCE(
            current_setting('app.current_project_id', true),
            ''
        ) = ''
    )
    OR (
        organization_id :: text = current_setting('app.current_organization_id', true)
        AND project_id :: text = current_setting('app.current_project_id', true)
    )
);

-- ============================================================================
-- Fix project_object_type_registry policies
-- ============================================================================
DROP POLICY IF EXISTS project_type_registry_select_policy ON kb.project_object_type_registry;

DROP POLICY IF EXISTS project_type_registry_insert_policy ON kb.project_object_type_registry;

DROP POLICY IF EXISTS project_type_registry_update_policy ON kb.project_object_type_registry;

DROP POLICY IF EXISTS project_type_registry_delete_policy ON kb.project_object_type_registry;

CREATE POLICY project_type_registry_select_policy ON kb.project_object_type_registry FOR
SELECT
    USING (
        (
            COALESCE(
                current_setting('app.current_organization_id', true),
                ''
            ) = ''
            AND COALESCE(
                current_setting('app.current_project_id', true),
                ''
            ) = ''
        )
        OR (
            organization_id :: text = current_setting('app.current_organization_id', true)
            AND project_id :: text = current_setting('app.current_project_id', true)
        )
    );

CREATE POLICY project_type_registry_insert_policy ON kb.project_object_type_registry FOR
INSERT
    WITH CHECK (
        (
            COALESCE(
                current_setting('app.current_organization_id', true),
                ''
            ) = ''
            AND COALESCE(
                current_setting('app.current_project_id', true),
                ''
            ) = ''
        )
        OR (
            organization_id :: text = current_setting('app.current_organization_id', true)
            AND project_id :: text = current_setting('app.current_project_id', true)
        )
    );

CREATE POLICY project_type_registry_update_policy ON kb.project_object_type_registry FOR
UPDATE
    USING (
        (
            COALESCE(
                current_setting('app.current_organization_id', true),
                ''
            ) = ''
            AND COALESCE(
                current_setting('app.current_project_id', true),
                ''
            ) = ''
        )
        OR (
            organization_id :: text = current_setting('app.current_organization_id', true)
            AND project_id :: text = current_setting('app.current_project_id', true)
        )
    );

CREATE POLICY project_type_registry_delete_policy ON kb.project_object_type_registry FOR DELETE USING (
    (
        COALESCE(
            current_setting('app.current_organization_id', true),
            ''
        ) = ''
        AND COALESCE(
            current_setting('app.current_project_id', true),
            ''
        ) = ''
    )
    OR (
        organization_id :: text = current_setting('app.current_organization_id', true)
        AND project_id :: text = current_setting('app.current_project_id', true)
    )
);

-- ============================================================================
-- Fix object_type_suggestions policies
-- ============================================================================
DROP POLICY IF EXISTS type_suggestions_select_policy ON kb.object_type_suggestions;

DROP POLICY IF EXISTS type_suggestions_insert_policy ON kb.object_type_suggestions;

DROP POLICY IF EXISTS type_suggestions_update_policy ON kb.object_type_suggestions;

DROP POLICY IF EXISTS type_suggestions_delete_policy ON kb.object_type_suggestions;

CREATE POLICY type_suggestions_select_policy ON kb.object_type_suggestions FOR
SELECT
    USING (
        (
            COALESCE(
                current_setting('app.current_organization_id', true),
                ''
            ) = ''
            AND COALESCE(
                current_setting('app.current_project_id', true),
                ''
            ) = ''
        )
        OR (
            organization_id :: text = current_setting('app.current_organization_id', true)
            AND project_id :: text = current_setting('app.current_project_id', true)
        )
    );

CREATE POLICY type_suggestions_insert_policy ON kb.object_type_suggestions FOR
INSERT
    WITH CHECK (
        (
            COALESCE(
                current_setting('app.current_organization_id', true),
                ''
            ) = ''
            AND COALESCE(
                current_setting('app.current_project_id', true),
                ''
            ) = ''
        )
        OR (
            organization_id :: text = current_setting('app.current_organization_id', true)
            AND project_id :: text = current_setting('app.current_project_id', true)
        )
    );

CREATE POLICY type_suggestions_update_policy ON kb.object_type_suggestions FOR
UPDATE
    USING (
        (
            COALESCE(
                current_setting('app.current_organization_id', true),
                ''
            ) = ''
            AND COALESCE(
                current_setting('app.current_project_id', true),
                ''
            ) = ''
        )
        OR (
            organization_id :: text = current_setting('app.current_organization_id', true)
            AND project_id :: text = current_setting('app.current_project_id', true)
        )
    );

CREATE POLICY type_suggestions_delete_policy ON kb.object_type_suggestions FOR DELETE USING (
    (
        COALESCE(
            current_setting('app.current_organization_id', true),
            ''
        ) = ''
        AND COALESCE(
            current_setting('app.current_project_id', true),
            ''
        ) = ''
    )
    OR (
        organization_id :: text = current_setting('app.current_organization_id', true)
        AND project_id :: text = current_setting('app.current_project_id', true)
    )
);