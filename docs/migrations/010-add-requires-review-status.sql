-- Migration 010: Add 'requires_review' status to object_extraction_jobs
-- Date: 2025-10-05
-- Issue: TypeScript enum includes 'requires_review' but database constraint doesn't
BEGIN;

-- Drop the old constraint
ALTER TABLE
    kb.object_extraction_jobs DROP CONSTRAINT IF EXISTS object_extraction_jobs_status_check;

-- Add the new constraint with 'requires_review' included
ALTER TABLE
    kb.object_extraction_jobs
ADD
    CONSTRAINT object_extraction_jobs_status_check CHECK (
        status IN (
            'pending',
            'running',
            'completed',
            'requires_review',
            'failed',
            'cancelled'
        )
    );

COMMIT;

-- Verification:
-- SELECT conname, pg_get_constraintdef(oid) 
-- FROM pg_constraint 
-- WHERE conname = 'object_extraction_jobs_status_check';