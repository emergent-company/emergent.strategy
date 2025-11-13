-- Migration 007: Fix extraction jobs to use subject_id with foreign key
-- 
-- Problem: created_by TEXT stores external auth IDs without referential integrity
-- Solution: Rename to subject_id UUID with FK to core.user_profiles
--
-- This aligns extraction jobs with the rest of the system where all user
-- references use subject_id UUID with proper foreign keys.
BEGIN;

-- Step 1: Add new subject_id column with proper type and FK
ALTER TABLE
    kb.object_extraction_jobs
ADD
    COLUMN subject_id UUID REFERENCES core.user_profiles(subject_id) ON DELETE
SET
    NULL;

-- Step 2: Migrate existing data
-- Note: We cannot reliably convert external auth IDs to UUIDs, so we'll
-- set subject_id to NULL for existing records. This is acceptable since
-- created_by was optional and many records are already NULL.
UPDATE
    kb.object_extraction_jobs
SET
    subject_id = NULL
WHERE
    created_by IS NOT NULL;

-- Step 3: Drop old created_by column
ALTER TABLE
    kb.object_extraction_jobs DROP COLUMN created_by;

-- Step 4: Add index for common query patterns
CREATE INDEX IF NOT EXISTS idx_extraction_jobs_subject_id ON kb.object_extraction_jobs(subject_id)
WHERE
    subject_id IS NOT NULL;

-- Step 5: Update comments
COMMENT ON COLUMN kb.object_extraction_jobs.subject_id IS 'Canonical internal user ID who created this extraction job. References core.user_profiles.';

COMMIT;