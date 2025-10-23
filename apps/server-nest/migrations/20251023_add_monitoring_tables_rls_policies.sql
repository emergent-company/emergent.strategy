-- Migration: Add RLS policies for monitoring tables
-- Date: 2025-10-23
-- Purpose: Allow app_rls role to insert/update monitoring logs (llm_call_logs, system_process_logs)
-- Enable RLS on monitoring tables (if not already enabled)
ALTER TABLE
    kb.llm_call_logs ENABLE ROW LEVEL SECURITY;

ALTER TABLE
    kb.system_process_logs ENABLE ROW LEVEL SECURITY;

-- Policy for llm_call_logs: Allow app_rls to insert and update all rows
-- These tables are for monitoring/logging purposes and don't need tenant isolation
CREATE POLICY llm_call_logs_insert_policy ON kb.llm_call_logs FOR
INSERT
    TO app_rls WITH CHECK (true);

CREATE POLICY llm_call_logs_update_policy ON kb.llm_call_logs FOR
UPDATE
    TO app_rls USING (true) WITH CHECK (true);

CREATE POLICY llm_call_logs_select_policy ON kb.llm_call_logs FOR
SELECT
    TO app_rls USING (true);

-- Policy for system_process_logs: Allow app_rls to insert all rows
CREATE POLICY system_process_logs_insert_policy ON kb.system_process_logs FOR
INSERT
    TO app_rls WITH CHECK (true);

CREATE POLICY system_process_logs_select_policy ON kb.system_process_logs FOR
SELECT
    TO app_rls USING (true);

-- Note: These monitoring tables are intentionally permissive because they're for
-- operational logging and monitoring, not tenant-specific application data.
-- Project/org filtering is handled at the application layer via the stored org_id/project_id columns.