-- Migration: Automatic Object Extraction & Notifications
-- Description: Add auto-extraction configuration to projects and notifications system
-- Purpose: Enable automatic extraction job creation on document upload and user notifications
-- Date: 2025-10-04
-- Related: docs/spec/28-automatic-extraction-and-notifications.md
-- ============================================================================
-- Part 1: Auto-Extraction Configuration
-- ============================================================================
-- Add automatic extraction settings to projects table
ALTER TABLE
    kb.projects
ADD
    COLUMN IF NOT EXISTS auto_extract_objects BOOLEAN NOT NULL DEFAULT false,
ADD
    COLUMN IF NOT EXISTS auto_extract_config JSONB DEFAULT '{
    "enabled_types": null,
    "min_confidence": 0.7,
    "require_review": false,
    "notify_on_complete": true,
    "notification_channels": ["inbox"]
  }' :: jsonb;

-- Index for filtering projects with auto-extraction enabled
CREATE INDEX IF NOT EXISTS idx_projects_auto_extract ON kb.projects(id, auto_extract_objects)
WHERE
    auto_extract_objects = true;

-- Add comment
COMMENT ON COLUMN kb.projects.auto_extract_objects IS 'When true, automatically create extraction jobs when documents are uploaded to this project';

COMMENT ON COLUMN kb.projects.auto_extract_config IS 'Configuration for automatic extraction: enabled_types (string[] or null), min_confidence (0-1), require_review (bool), notify_on_complete (bool), notification_channels (string[])';

-- ============================================================================
-- Part 2: Notifications System (Update existing table)
-- ============================================================================
-- Note: kb.notifications table already exists with different schema
-- We'll add new columns and keep existing ones for compatibility
-- Add new columns for extraction notifications
ALTER TABLE
    kb.notifications
ADD
    COLUMN IF NOT EXISTS type TEXT,
ADD
    COLUMN IF NOT EXISTS severity TEXT DEFAULT 'info',
ADD
    COLUMN IF NOT EXISTS related_resource_type TEXT,
ADD
    COLUMN IF NOT EXISTS related_resource_id UUID,
ADD
    COLUMN IF NOT EXISTS read BOOLEAN DEFAULT false,
ADD
    COLUMN IF NOT EXISTS dismissed BOOLEAN DEFAULT false,
ADD
    COLUMN IF NOT EXISTS dismissed_at TIMESTAMPTZ,
ADD
    COLUMN IF NOT EXISTS actions JSONB DEFAULT '[]',
ADD
    COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

-- Update existing columns to ensure compatibility
ALTER TABLE
    kb.notifications
ALTER COLUMN
    organization_id
SET
    NOT NULL,
ALTER COLUMN
    project_id
SET
    NOT NULL,
ALTER COLUMN
    project_id
SET
    DEFAULT gen_random_uuid();

-- temp, will be overridden
-- Add project foreign key if not exists
DO $ $ BEGIN IF NOT EXISTS (
    SELECT
        1
    FROM
        pg_constraint
    WHERE
        conname = 'notifications_project_id_fkey'
) THEN
ALTER TABLE
    kb.notifications
ADD
    CONSTRAINT notifications_project_id_fkey FOREIGN KEY (project_id) REFERENCES kb.projects(id) ON DELETE CASCADE;

END IF;

END $ $;

-- Indexes for new columns
CREATE INDEX IF NOT EXISTS idx_notifications_type ON kb.notifications(type)
WHERE
    type IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_notifications_expires ON kb.notifications(expires_at)
WHERE
    expires_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_notifications_related_resource ON kb.notifications(related_resource_type, related_resource_id)
WHERE
    related_resource_type IS NOT NULL
    AND related_resource_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_notifications_read_new ON kb.notifications(user_id, read, created_at DESC)
WHERE
    read = false;

-- Add comments
COMMENT ON TABLE kb.notifications IS 'User notifications for extraction jobs, system events, and other activities (extended from original schema)';

COMMENT ON COLUMN kb.notifications.type IS 'Notification type for filtering and routing (extraction_complete, extraction_failed, review_required, etc.)';

COMMENT ON COLUMN kb.notifications.actions IS 'Array of action objects: [{label: string, url?: string, action?: string, data?: any}]';

-- ============================================================================
-- Part 3: Row-Level Security for Notifications
-- ============================================================================
-- Note: RLS policies may already exist, using IF NOT EXISTS pattern
-- Enable RLS on notifications table (idempotent)
ALTER TABLE
    kb.notifications ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they conflict, then recreate
DO $ $ BEGIN -- Drop old policies if they exist
DROP POLICY IF EXISTS notifications_select_own ON kb.notifications;

DROP POLICY IF EXISTS notifications_update_own ON kb.notifications;

DROP POLICY IF EXISTS notifications_insert_system ON kb.notifications;

DROP POLICY IF EXISTS notifications_delete_own ON kb.notifications;

END $ $;

-- Policy: Users can view their own notifications
CREATE POLICY notifications_select_own ON kb.notifications FOR
SELECT
    USING (
        user_id :: text = current_setting('app.current_user_id', true)
    );

-- Policy: Users can update (mark as read/dismissed) their own notifications
CREATE POLICY notifications_update_own ON kb.notifications FOR
UPDATE
    USING (
        user_id :: text = current_setting('app.current_user_id', true)
    );

-- Policy: System can insert notifications (via service role)
CREATE POLICY notifications_insert_system ON kb.notifications FOR
INSERT
    WITH CHECK (true);

-- Policy: Users can delete (dismiss) their own notifications
CREATE POLICY notifications_delete_own ON kb.notifications FOR DELETE USING (
    user_id :: text = current_setting('app.current_user_id', true)
);

-- ============================================================================
-- Part 4: Update extraction_jobs to support notification metadata
-- ============================================================================
-- Note: extraction_jobs table doesn't exist yet in this codebase
-- These columns will be added when that table is created
-- Keeping as comments for reference
-- ALTER TABLE kb.extraction_jobs
--   ADD COLUMN IF NOT EXISTS result_summary JSONB DEFAULT '{}',
--   ADD COLUMN IF NOT EXISTS notification_sent BOOLEAN NOT NULL DEFAULT false,
--   ADD COLUMN IF NOT EXISTS notification_id UUID REFERENCES kb.notifications(id) ON DELETE SET NULL;
-- CREATE INDEX IF NOT EXISTS idx_extraction_jobs_notification
--   ON kb.extraction_jobs(notification_id)
--   WHERE notification_id IS NOT NULL;
-- COMMENT ON COLUMN kb.extraction_jobs.result_summary IS 
--   'Summary of extraction results for notification display: objects_created, objects_by_type, confidence, etc.';
-- COMMENT ON COLUMN kb.extraction_jobs.notification_sent IS 
--   'Whether completion notification has been sent for this job';
-- COMMENT ON COLUMN kb.extraction_jobs.notification_id IS 
--   'Reference to notification created for this extraction job';
-- ============================================================================
-- Part 5: Cleanup expired notifications (function for scheduled task)
-- ============================================================================
CREATE
OR REPLACE FUNCTION kb.cleanup_expired_notifications() RETURNS INTEGER LANGUAGE plpgsql AS $ $ DECLARE deleted_count INTEGER;

BEGIN
DELETE FROM
    kb.notifications
WHERE
    expires_at IS NOT NULL
    AND expires_at < now();

GET DIAGNOSTICS deleted_count = ROW_COUNT;

RETURN deleted_count;

END;

$ $;

COMMENT ON FUNCTION kb.cleanup_expired_notifications() IS 'Delete notifications past their expiration date. Call periodically via cron or scheduler.';

-- ============================================================================
-- Migration Complete
-- ============================================================================
-- Verification queries (commented out, for manual testing)
-- SELECT auto_extract_objects, auto_extract_config FROM kb.projects LIMIT 1;
-- SELECT COUNT(*) FROM kb.notifications;
-- SELECT COUNT(*) FROM pg_policies WHERE tablename = 'notifications';