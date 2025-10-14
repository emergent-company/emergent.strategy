-- Align extraction job status constraint with service enum
-- Ensures worker can transition jobs to the "running" state and supports requires_review flow
BEGIN;

-- Normalize legacy status values if any remain
UPDATE
    kb.object_extraction_jobs
SET
    status = 'running',
    updated_at = NOW()
WHERE
    status = 'processing';

-- Replace the status check constraint to match application enum
ALTER TABLE
    kb.object_extraction_jobs DROP CONSTRAINT IF EXISTS object_extraction_jobs_status_check;

ALTER TABLE
    kb.object_extraction_jobs
ADD
    CONSTRAINT object_extraction_jobs_status_check CHECK (
        status = ANY (
            ARRAY [
                'pending'::text,
                'running'::text,
                'completed'::text,
                'requires_review'::text,
                'failed'::text,
                'cancelled'::text
            ]
        )
    );

COMMIT;