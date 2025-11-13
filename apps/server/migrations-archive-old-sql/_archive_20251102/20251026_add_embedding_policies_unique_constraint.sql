-- Add unique constraint on embedding_policies (project_id, object_type)
-- This ensures only one embedding policy per object type per project
-- 
-- Context: Test 'reject duplicate policy (same project + object type)' expects
-- database to reject duplicate policies with 500 error, but no constraint existed
--
-- Before: Multiple policies allowed for same (project_id, object_type)
-- After:  Only one policy per (project_id, object_type) combination
CREATE UNIQUE INDEX IF NOT EXISTS idx_embedding_policies_project_object_type ON kb.embedding_policies (project_id, object_type);