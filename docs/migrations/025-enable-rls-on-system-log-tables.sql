-- Migration: Enable RLS on system and log tables
-- Created: 2025-11-19
-- Purpose: Enforce project-level isolation for audit and operational logs

-- ============================================================================
-- kb.audit_log - No project_id column, so we'll allow bypass for now
-- Note: In the future, this should be enhanced to filter by user_id or add project_id
-- ============================================================================

ALTER TABLE kb.audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE kb.audit_log FORCE ROW LEVEL SECURITY;

-- For now, audit logs are visible when no context is set (admin/monitoring use)
-- In production, enhance this to filter by user_id or add project_id column
CREATE POLICY audit_log_select_policy ON kb.audit_log
FOR SELECT
USING (
  COALESCE(current_setting('app.current_project_id', true), '') = ''
);

CREATE POLICY audit_log_insert_policy ON kb.audit_log
FOR INSERT
WITH CHECK (
  COALESCE(current_setting('app.current_project_id', true), '') = ''
);

CREATE POLICY audit_log_update_policy ON kb.audit_log
FOR UPDATE
USING (
  COALESCE(current_setting('app.current_project_id', true), '') = ''
)
WITH CHECK (
  COALESCE(current_setting('app.current_project_id', true), '') = ''
);

CREATE POLICY audit_log_delete_policy ON kb.audit_log
FOR DELETE
USING (
  COALESCE(current_setting('app.current_project_id', true), '') = ''
);

-- ============================================================================
-- kb.llm_call_logs - No project_id column, filter via process_id relationship
-- Note: Currently allows all access when no context set. Should enhance to JOIN
-- to parent tables (extraction_jobs, etc.) to filter by project
-- ============================================================================

ALTER TABLE kb.llm_call_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE kb.llm_call_logs FORCE ROW LEVEL SECURITY;

CREATE POLICY llm_call_logs_select_policy ON kb.llm_call_logs
FOR SELECT
USING (
  COALESCE(current_setting('app.current_project_id', true), '') = ''
);

CREATE POLICY llm_call_logs_insert_policy ON kb.llm_call_logs
FOR INSERT
WITH CHECK (
  COALESCE(current_setting('app.current_project_id', true), '') = ''
);

CREATE POLICY llm_call_logs_update_policy ON kb.llm_call_logs
FOR UPDATE
USING (
  COALESCE(current_setting('app.current_project_id', true), '') = ''
)
WITH CHECK (
  COALESCE(current_setting('app.current_project_id', true), '') = ''
);

CREATE POLICY llm_call_logs_delete_policy ON kb.llm_call_logs
FOR DELETE
USING (
  COALESCE(current_setting('app.current_project_id', true), '') = ''
);

-- ============================================================================
-- kb.object_extraction_logs - Filter via extraction_job_id JOIN
-- ============================================================================

ALTER TABLE kb.object_extraction_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE kb.object_extraction_logs FORCE ROW LEVEL SECURITY;

CREATE POLICY object_extraction_logs_select_policy ON kb.object_extraction_logs
FOR SELECT
USING (
  COALESCE(current_setting('app.current_project_id', true), '') = ''
  OR
  EXISTS (
    SELECT 1 
    FROM kb.object_extraction_jobs 
    WHERE object_extraction_jobs.id = object_extraction_logs.extraction_job_id
      AND object_extraction_jobs.project_id::text = current_setting('app.current_project_id', true)
  )
);

CREATE POLICY object_extraction_logs_insert_policy ON kb.object_extraction_logs
FOR INSERT
WITH CHECK (
  COALESCE(current_setting('app.current_project_id', true), '') = ''
  OR
  EXISTS (
    SELECT 1 
    FROM kb.object_extraction_jobs 
    WHERE object_extraction_jobs.id = object_extraction_logs.extraction_job_id
      AND object_extraction_jobs.project_id::text = current_setting('app.current_project_id', true)
  )
);

CREATE POLICY object_extraction_logs_update_policy ON kb.object_extraction_logs
FOR UPDATE
USING (
  COALESCE(current_setting('app.current_project_id', true), '') = ''
  OR
  EXISTS (
    SELECT 1 
    FROM kb.object_extraction_jobs 
    WHERE object_extraction_jobs.id = object_extraction_logs.extraction_job_id
      AND object_extraction_jobs.project_id::text = current_setting('app.current_project_id', true)
  )
)
WITH CHECK (
  COALESCE(current_setting('app.current_project_id', true), '') = ''
  OR
  EXISTS (
    SELECT 1 
    FROM kb.object_extraction_jobs 
    WHERE object_extraction_jobs.id = object_extraction_logs.extraction_job_id
      AND object_extraction_jobs.project_id::text = current_setting('app.current_project_id', true)
  )
);

CREATE POLICY object_extraction_logs_delete_policy ON kb.object_extraction_logs
FOR DELETE
USING (
  COALESCE(current_setting('app.current_project_id', true), '') = ''
  OR
  EXISTS (
    SELECT 1 
    FROM kb.object_extraction_jobs 
    WHERE object_extraction_jobs.id = object_extraction_logs.extraction_job_id
      AND object_extraction_jobs.project_id::text = current_setting('app.current_project_id', true)
  )
);

-- ============================================================================
-- kb.system_process_logs - No project relationship, allow bypass only
-- These are system-level logs not tied to specific projects
-- ============================================================================

ALTER TABLE kb.system_process_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE kb.system_process_logs FORCE ROW LEVEL SECURITY;

CREATE POLICY system_process_logs_select_policy ON kb.system_process_logs
FOR SELECT
USING (
  COALESCE(current_setting('app.current_project_id', true), '') = ''
);

CREATE POLICY system_process_logs_insert_policy ON kb.system_process_logs
FOR INSERT
WITH CHECK (
  COALESCE(current_setting('app.current_project_id', true), '') = ''
);

CREATE POLICY system_process_logs_update_policy ON kb.system_process_logs
FOR UPDATE
USING (
  COALESCE(current_setting('app.current_project_id', true), '') = ''
)
WITH CHECK (
  COALESCE(current_setting('app.current_project_id', true), '') = ''
);

CREATE POLICY system_process_logs_delete_policy ON kb.system_process_logs
FOR DELETE
USING (
  COALESCE(current_setting('app.current_project_id', true), '') = ''
);

-- ============================================================================
-- kb.clickup_import_logs - Filter via integration_id JOIN
-- ============================================================================

ALTER TABLE kb.clickup_import_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE kb.clickup_import_logs FORCE ROW LEVEL SECURITY;

CREATE POLICY clickup_import_logs_select_policy ON kb.clickup_import_logs
FOR SELECT
USING (
  COALESCE(current_setting('app.current_project_id', true), '') = ''
  OR
  EXISTS (
    SELECT 1 
    FROM kb.integrations 
    WHERE integrations.id = clickup_import_logs.integration_id
      AND integrations.project_id::text = current_setting('app.current_project_id', true)
  )
);

CREATE POLICY clickup_import_logs_insert_policy ON kb.clickup_import_logs
FOR INSERT
WITH CHECK (
  COALESCE(current_setting('app.current_project_id', true), '') = ''
  OR
  EXISTS (
    SELECT 1 
    FROM kb.integrations 
    WHERE integrations.id = clickup_import_logs.integration_id
      AND integrations.project_id::text = current_setting('app.current_project_id', true)
  )
);

CREATE POLICY clickup_import_logs_update_policy ON kb.clickup_import_logs
FOR UPDATE
USING (
  COALESCE(current_setting('app.current_project_id', true), '') = ''
  OR
  EXISTS (
    SELECT 1 
    FROM kb.integrations 
    WHERE integrations.id = clickup_import_logs.integration_id
      AND integrations.project_id::text = current_setting('app.current_project_id', true)
  )
)
WITH CHECK (
  COALESCE(current_setting('app.current_project_id', true), '') = ''
  OR
  EXISTS (
    SELECT 1 
    FROM kb.integrations 
    WHERE integrations.id = clickup_import_logs.integration_id
      AND integrations.project_id::text = current_setting('app.current_project_id', true)
  )
);

CREATE POLICY clickup_import_logs_delete_policy ON kb.clickup_import_logs
FOR DELETE
USING (
  COALESCE(current_setting('app.current_project_id', true), '') = ''
  OR
  EXISTS (
    SELECT 1 
    FROM kb.integrations 
    WHERE integrations.id = clickup_import_logs.integration_id
      AND integrations.project_id::text = current_setting('app.current_project_id', true)
  )
);
