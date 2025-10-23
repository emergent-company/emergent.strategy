-- Migration: Create Notifications Table
-- Description: Create the base kb.notifications table that other migrations expect
-- Purpose: Fix missing notifications table that 0005 migration tried to ALTER
-- Date: 2025-10-24
-- ============================================================================

CREATE TABLE IF NOT EXISTS kb.notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL,
    project_id UUID NOT NULL,
    subject_id TEXT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_notifications_org_project ON kb.notifications(organization_id, project_id);
CREATE INDEX IF NOT EXISTS idx_notifications_subject ON kb.notifications(subject_id);
CREATE INDEX IF NOT EXISTS idx_notifications_created ON kb.notifications(created_at DESC);

-- Comments
COMMENT ON TABLE kb.notifications IS 'User notifications for various system events';
COMMENT ON COLUMN kb.notifications.organization_id IS 'Organization this notification belongs to';
COMMENT ON COLUMN kb.notifications.project_id IS 'Project this notification is related to';
COMMENT ON COLUMN kb.notifications.subject_id IS 'User who should receive this notification';
COMMENT ON COLUMN kb.notifications.title IS 'Short notification title';
COMMENT ON COLUMN kb.notifications.message IS 'Full notification message';
