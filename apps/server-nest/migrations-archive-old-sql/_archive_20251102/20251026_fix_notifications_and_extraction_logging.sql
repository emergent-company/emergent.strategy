-- Migration: Fix notifications and extraction logging schema
-- Date: 2025-10-26
-- Description: Adds missing columns to notifications table and creates/updates extraction logging infrastructure
-- =====================================================
-- 1. NOTIFICATIONS TABLE - Add missing columns
-- =====================================================
-- Add read_at timestamp to track when notification was read
ALTER TABLE
    kb.notifications
ADD
    COLUMN IF NOT EXISTS read_at TIMESTAMP WITH TIME ZONE;

-- Add subject_id to link notifications to their subjects
ALTER TABLE
    kb.notifications
ADD
    COLUMN IF NOT EXISTS subject_id UUID;

-- Add importance level for notification prioritization
ALTER TABLE
    kb.notifications
ADD
    COLUMN IF NOT EXISTS importance VARCHAR(20) DEFAULT 'normal';

-- Update existing unread notifications to have null read_at
-- (read=false should have read_at=null)
UPDATE
    kb.notifications
SET
    read_at = NULL
WHERE
    read = false
    AND read_at IS NOT NULL;

-- Update existing read notifications to have a read_at timestamp
-- (use created_at as fallback for historical data)
UPDATE
    kb.notifications
SET
    read_at = created_at
WHERE
    read = true
    AND read_at IS NULL;

-- Add check constraint for importance values
ALTER TABLE
    kb.notifications
ADD
    CONSTRAINT chk_notifications_importance CHECK (
        importance IN ('low', 'normal', 'high', 'urgent')
    );

-- Add index for common queries
CREATE INDEX IF NOT EXISTS idx_notifications_subject ON kb.notifications(subject_id)
WHERE
    subject_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_notifications_importance ON kb.notifications(importance);

CREATE INDEX IF NOT EXISTS idx_notifications_read_at ON kb.notifications(read_at)
WHERE
    read_at IS NOT NULL;

-- =====================================================
-- 2. EXTRACTION LOGGING - Create object_extraction_logs table
-- =====================================================
CREATE TABLE IF NOT EXISTS kb.object_extraction_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    extraction_job_id UUID NOT NULL,
    step VARCHAR(50) NOT NULL,
    status VARCHAR(20) NOT NULL,
    message TEXT,
    entity_count INTEGER DEFAULT 0,
    relationship_count INTEGER DEFAULT 0,
    error_details JSONB,
    started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    duration_ms INTEGER,
    -- Constraints
    CONSTRAINT fk_object_extraction_logs_job FOREIGN KEY (extraction_job_id) REFERENCES kb.object_extraction_jobs(id) ON DELETE CASCADE,
    CONSTRAINT chk_extraction_log_status CHECK (
        status IN (
            'pending',
            'running',
            'completed',
            'failed',
            'skipped'
        )
    )
);

-- Indexes for extraction logs
CREATE INDEX IF NOT EXISTS idx_extraction_logs_job ON kb.object_extraction_logs(extraction_job_id);

CREATE INDEX IF NOT EXISTS idx_extraction_logs_status ON kb.object_extraction_logs(status);

CREATE INDEX IF NOT EXISTS idx_extraction_logs_step ON kb.object_extraction_logs(step);

CREATE INDEX IF NOT EXISTS idx_extraction_logs_started ON kb.object_extraction_logs(started_at DESC);

-- =====================================================
-- 3. SYSTEM PROCESS LOGS - Add process_id column
-- =====================================================
-- Add process_id to link logs to specific extraction jobs or other processes
ALTER TABLE
    kb.system_process_logs
ADD
    COLUMN IF NOT EXISTS process_id UUID;

-- Add foreign key to extraction jobs (nullable, since not all processes are extraction jobs)
-- Note: This assumes process_id might reference extraction_job_id
CREATE INDEX IF NOT EXISTS idx_system_process_logs_process ON kb.system_process_logs(process_id)
WHERE
    process_id IS NOT NULL;

-- Add composite index for common queries
CREATE INDEX IF NOT EXISTS idx_system_process_logs_type_status ON kb.system_process_logs(process_type, status);

-- =====================================================
-- 4. COMMENTS AND DOCUMENTATION
-- =====================================================
COMMENT ON COLUMN kb.notifications.read_at IS 'Timestamp when the notification was marked as read';

COMMENT ON COLUMN kb.notifications.subject_id IS 'UUID of the subject entity this notification references';

COMMENT ON COLUMN kb.notifications.importance IS 'Priority level: low, normal, high, urgent';

COMMENT ON TABLE kb.object_extraction_logs IS 'Detailed logging for each step of object extraction jobs';

COMMENT ON COLUMN kb.object_extraction_logs.step IS 'Extraction step name (e.g., fetch_content, extract_entities, link_objects)';

COMMENT ON COLUMN kb.object_extraction_logs.duration_ms IS 'Duration of the step in milliseconds';

COMMENT ON COLUMN kb.system_process_logs.process_id IS 'Reference ID to specific process instance (e.g., extraction_job_id)';

-- =====================================================
-- 5. GRANT PERMISSIONS (if needed)
-- =====================================================
-- Ensure application role has access to new table
DO $$ BEGIN IF EXISTS (
    SELECT
        1
    FROM
        pg_roles
    WHERE
        rolname = 'app_user'
) THEN GRANT
SELECT
,
INSERT
,
UPDATE
,
    DELETE ON kb.object_extraction_logs TO app_user;

GRANT USAGE,
SELECT
    ON ALL SEQUENCES IN SCHEMA kb TO app_user;

END IF;

END $$;