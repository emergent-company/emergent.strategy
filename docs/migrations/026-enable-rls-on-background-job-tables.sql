-- Migration: Enable RLS on background job and cache tables
-- Created: 2025-11-19
-- Purpose: Enforce project-level isolation for job queues and cache

-- ============================================================================
-- kb.auth_introspection_cache - No project relationship, allow bypass only
-- This is a system-level cache for auth tokens across all users/projects
-- ============================================================================

ALTER TABLE kb.auth_introspection_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE kb.auth_introspection_cache FORCE ROW LEVEL SECURITY;

CREATE POLICY auth_introspection_cache_select_policy ON kb.auth_introspection_cache
FOR SELECT
USING (
  COALESCE(current_setting('app.current_project_id', true), '') = ''
);

CREATE POLICY auth_introspection_cache_insert_policy ON kb.auth_introspection_cache
FOR INSERT
WITH CHECK (
  COALESCE(current_setting('app.current_project_id', true), '') = ''
);

CREATE POLICY auth_introspection_cache_update_policy ON kb.auth_introspection_cache
FOR UPDATE
USING (
  COALESCE(current_setting('app.current_project_id', true), '') = ''
)
WITH CHECK (
  COALESCE(current_setting('app.current_project_id', true), '') = ''
);

CREATE POLICY auth_introspection_cache_delete_policy ON kb.auth_introspection_cache
FOR DELETE
USING (
  COALESCE(current_setting('app.current_project_id', true), '') = ''
);

-- ============================================================================
-- kb.graph_embedding_jobs - Filter via object_id JOIN to graph_objects
-- ============================================================================

ALTER TABLE kb.graph_embedding_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE kb.graph_embedding_jobs FORCE ROW LEVEL SECURITY;

CREATE POLICY graph_embedding_jobs_select_policy ON kb.graph_embedding_jobs
FOR SELECT
USING (
  COALESCE(current_setting('app.current_project_id', true), '') = ''
  OR
  EXISTS (
    SELECT 1 
    FROM kb.graph_objects 
    WHERE graph_objects.id = graph_embedding_jobs.object_id
      AND graph_objects.project_id::text = current_setting('app.current_project_id', true)
  )
);

CREATE POLICY graph_embedding_jobs_insert_policy ON kb.graph_embedding_jobs
FOR INSERT
WITH CHECK (
  COALESCE(current_setting('app.current_project_id', true), '') = ''
  OR
  EXISTS (
    SELECT 1 
    FROM kb.graph_objects 
    WHERE graph_objects.id = graph_embedding_jobs.object_id
      AND graph_objects.project_id::text = current_setting('app.current_project_id', true)
  )
);

CREATE POLICY graph_embedding_jobs_update_policy ON kb.graph_embedding_jobs
FOR UPDATE
USING (
  COALESCE(current_setting('app.current_project_id', true), '') = ''
  OR
  EXISTS (
    SELECT 1 
    FROM kb.graph_objects 
    WHERE graph_objects.id = graph_embedding_jobs.object_id
      AND graph_objects.project_id::text = current_setting('app.current_project_id', true)
  )
)
WITH CHECK (
  COALESCE(current_setting('app.current_project_id', true), '') = ''
  OR
  EXISTS (
    SELECT 1 
    FROM kb.graph_objects 
    WHERE graph_objects.id = graph_embedding_jobs.object_id
      AND graph_objects.project_id::text = current_setting('app.current_project_id', true)
  )
);

CREATE POLICY graph_embedding_jobs_delete_policy ON kb.graph_embedding_jobs
FOR DELETE
USING (
  COALESCE(current_setting('app.current_project_id', true), '') = ''
  OR
  EXISTS (
    SELECT 1 
    FROM kb.graph_objects 
    WHERE graph_objects.id = graph_embedding_jobs.object_id
      AND graph_objects.project_id::text = current_setting('app.current_project_id', true)
  )
);

-- ============================================================================
-- kb.clickup_sync_state - Filter via integration_id JOIN
-- ============================================================================

ALTER TABLE kb.clickup_sync_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE kb.clickup_sync_state FORCE ROW LEVEL SECURITY;

CREATE POLICY clickup_sync_state_select_policy ON kb.clickup_sync_state
FOR SELECT
USING (
  COALESCE(current_setting('app.current_project_id', true), '') = ''
  OR
  EXISTS (
    SELECT 1 
    FROM kb.integrations 
    WHERE integrations.id = clickup_sync_state.integration_id
      AND integrations.project_id::text = current_setting('app.current_project_id', true)
  )
);

CREATE POLICY clickup_sync_state_insert_policy ON kb.clickup_sync_state
FOR INSERT
WITH CHECK (
  COALESCE(current_setting('app.current_project_id', true), '') = ''
  OR
  EXISTS (
    SELECT 1 
    FROM kb.integrations 
    WHERE integrations.id = clickup_sync_state.integration_id
      AND integrations.project_id::text = current_setting('app.current_project_id', true)
  )
);

CREATE POLICY clickup_sync_state_update_policy ON kb.clickup_sync_state
FOR UPDATE
USING (
  COALESCE(current_setting('app.current_project_id', true), '') = ''
  OR
  EXISTS (
    SELECT 1 
    FROM kb.integrations 
    WHERE integrations.id = clickup_sync_state.integration_id
      AND integrations.project_id::text = current_setting('app.current_project_id', true)
  )
)
WITH CHECK (
  COALESCE(current_setting('app.current_project_id', true), '') = ''
  OR
  EXISTS (
    SELECT 1 
    FROM kb.integrations 
    WHERE integrations.id = clickup_sync_state.integration_id
      AND integrations.project_id::text = current_setting('app.current_project_id', true)
  )
);

CREATE POLICY clickup_sync_state_delete_policy ON kb.clickup_sync_state
FOR DELETE
USING (
  COALESCE(current_setting('app.current_project_id', true), '') = ''
  OR
  EXISTS (
    SELECT 1 
    FROM kb.integrations 
    WHERE integrations.id = clickup_sync_state.integration_id
      AND integrations.project_id::text = current_setting('app.current_project_id', true)
  )
);
