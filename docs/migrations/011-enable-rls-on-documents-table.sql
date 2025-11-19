-- Migration: Enable Row-Level Security on Documents Table
-- Date: 2025-11-19
-- Issue: #048 - Document list returns empty intermittently
--
-- Background:
-- The documents table currently relies on application-level WHERE clause filtering
-- for multi-tenant isolation, while graph_objects and graph_relationships use RLS.
-- This inconsistency creates security risks and reliability issues.
--
-- This migration brings documents table in line with the graph tables by:
-- 1. Enabling RLS on kb.documents
-- 2. Creating policies that respect app.current_project_id session variable
-- 3. Allowing wildcard access when no project context is set (for system operations)
--
-- The policy predicate matches the pattern used for graph tables:
--   - Empty context = see all (system operations, migrations, admin tools)
--   - Project context set = see only that project's documents

-- Step 1: Enable Row-Level Security on documents table
ALTER TABLE kb.documents ENABLE ROW LEVEL SECURITY;

-- Step 2: Force RLS for all users including table owner
-- This ensures even superuser/owner respects policies (defense in depth)
ALTER TABLE kb.documents FORCE ROW LEVEL SECURITY;

-- Step 3: Create SELECT policy
-- Allow reading documents if:
--   - No project context is set (wildcard mode for system operations)
--   - OR document belongs to the current project context
CREATE POLICY documents_select_policy ON kb.documents
FOR SELECT
USING (
  COALESCE(current_setting('app.current_project_id', true), '') = ''
  OR project_id::text = current_setting('app.current_project_id', true)
);

-- Step 4: Create INSERT policy
-- Allow inserting documents if:
--   - No project context is set (wildcard mode)
--   - OR inserting into the current project context
CREATE POLICY documents_insert_policy ON kb.documents
FOR INSERT
WITH CHECK (
  COALESCE(current_setting('app.current_project_id', true), '') = ''
  OR project_id::text = current_setting('app.current_project_id', true)
);

-- Step 5: Create UPDATE policy
-- Allow updating documents if:
--   - No project context is set (wildcard mode)
--   - OR document belongs to the current project context
CREATE POLICY documents_update_policy ON kb.documents
FOR UPDATE
USING (
  COALESCE(current_setting('app.current_project_id', true), '') = ''
  OR project_id::text = current_setting('app.current_project_id', true)
)
WITH CHECK (
  COALESCE(current_setting('app.current_project_id', true), '') = ''
  OR project_id::text = current_setting('app.current_project_id', true)
);

-- Step 6: Create DELETE policy
-- Allow deleting documents if:
--   - No project context is set (wildcard mode)
--   - OR document belongs to the current project context
CREATE POLICY documents_delete_policy ON kb.documents
FOR DELETE
USING (
  COALESCE(current_setting('app.current_project_id', true), '') = ''
  OR project_id::text = current_setting('app.current_project_id', true)
);

-- Verification queries (run after migration):
-- SELECT tablename, policyname, cmd FROM pg_policies WHERE schemaname='kb' AND tablename='documents';
-- Expected output: 4 policies (SELECT, INSERT, UPDATE, DELETE)
