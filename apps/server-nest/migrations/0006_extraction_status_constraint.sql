-- Migration: Align object_extraction_jobs status constraint with service enum
-- Date: 2025-10-14
-- Purpose: Allow 'running' and 'requires_review' statuses used by ExtractionJobService/Worker
BEGIN;

ALTER TABLE
    kb.object_extraction_jobs DROP CONSTRAINT IF EXISTS object_extraction_jobs_status_check;

ALTER TABLE
    kb.object_extraction_jobs
ADD
    CONSTRAINT object_extraction_jobs_status_check CHECK (
        status IN (
            'pending',
            'running',
            'processing',
            'completed',
            'requires_review',
            'failed',
            'cancelled'
        )
    );

COMMIT;