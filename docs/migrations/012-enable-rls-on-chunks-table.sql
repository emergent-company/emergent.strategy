-- Migration: Enable Row-Level Security on Chunks Table
-- Date: 2025-11-19
-- Issue: #050 - Chunks endpoint lacks project-level filtering
--
-- Background:
-- The chunks table currently relies on application-level WHERE clause filtering
-- for multi-tenant isolation, while documents and graph tables use RLS.
-- This inconsistency creates security risks - chunks endpoint allows
-- cross-project data leakage when no documentId filter is provided.
--
-- This migration brings chunks table in line with documents and graph tables by:
-- 1. Enabling RLS on kb.chunks
-- 2. Creating policies that respect app.current_project_id via documents table
-- 3. Allowing wildcard access when no project context is set (for system operations)
--
-- The policy predicate matches the pattern used for documents table:
--   - Empty context = see all (system operations, migrations, admin tools)
--   - Project context set = see only chunks from that project's documents

-- Step 1: Enable Row-Level Security on chunks table
ALTER TABLE kb.chunks ENABLE ROW LEVEL SECURITY;

-- Step 2: Force RLS for all users including table owner
-- This ensures even superuser/owner respects policies (defense in depth)
ALTER TABLE kb.chunks FORCE ROW LEVEL SECURITY;

-- Step 3: Create SELECT policy
-- Allow reading chunks if:
--   - No project context is set (wildcard mode for system operations)
--   - OR chunk's document belongs to the current project context
CREATE POLICY chunks_select_policy ON kb.chunks
FOR SELECT
USING (
  COALESCE(current_setting('app.current_project_id', true), '') = ''
  OR EXISTS (
    SELECT 1 FROM kb.documents d
    WHERE d.id = chunks.document_id
    AND d.project_id::text = current_setting('app.current_project_id', true)
  )
);

-- Step 4: Create INSERT policy
-- Allow inserting chunks if:
--   - No project context is set (wildcard mode)
--   - OR inserting into a document that belongs to the current project context
CREATE POLICY chunks_insert_policy ON kb.chunks
FOR INSERT
WITH CHECK (
  COALESCE(current_setting('app.current_project_id', true), '') = ''
  OR EXISTS (
    SELECT 1 FROM kb.documents d
    WHERE d.id = chunks.document_id
    AND d.project_id::text = current_setting('app.current_project_id', true)
  )
);

-- Step 5: Create UPDATE policy
-- Allow updating chunks if:
--   - No project context is set (wildcard mode)
--   - OR chunk's document belongs to the current project context
CREATE POLICY chunks_update_policy ON kb.chunks
FOR UPDATE
USING (
  COALESCE(current_setting('app.current_project_id', true), '') = ''
  OR EXISTS (
    SELECT 1 FROM kb.documents d
    WHERE d.id = chunks.document_id
    AND d.project_id::text = current_setting('app.current_project_id', true)
  )
)
WITH CHECK (
  COALESCE(current_setting('app.current_project_id', true), '') = ''
  OR EXISTS (
    SELECT 1 FROM kb.documents d
    WHERE d.id = chunks.document_id
    AND d.project_id::text = current_setting('app.current_project_id', true)
  )
);

-- Step 6: Create DELETE policy
-- Allow deleting chunks if:
--   - No project context is set (wildcard mode)
--   - OR chunk's document belongs to the current project context
CREATE POLICY chunks_delete_policy ON kb.chunks
FOR DELETE
USING (
  COALESCE(current_setting('app.current_project_id', true), '') = ''
  OR EXISTS (
    SELECT 1 FROM kb.documents d
    WHERE d.id = chunks.document_id
    AND d.project_id::text = current_setting('app.current_project_id', true)
  )
);

-- Verification queries (run after migration):
-- SELECT tablename, policyname, cmd FROM pg_policies WHERE schemaname='kb' AND tablename='chunks';
-- Expected output: 4 policies (SELECT, INSERT, UPDATE, DELETE)
