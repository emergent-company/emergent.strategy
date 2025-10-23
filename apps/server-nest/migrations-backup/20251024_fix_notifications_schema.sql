-- Migration: Fix Notifications Schema
-- Description: Add missing columns to notifications table that the code expects
-- Purpose: Fix 500 errors caused by missing read_at, importance, cleared_at, snoozed_until, user_id columns
-- Date: 2025-10-24
-- ============================================================================

-- Add missing columns to notifications table
ALTER TABLE kb.notifications
  ADD COLUMN IF NOT EXISTS user_id TEXT,
  ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS importance TEXT DEFAULT 'other' CHECK (importance IN ('important', 'other')),
  ADD COLUMN IF NOT EXISTS cleared_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS snoozed_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS category TEXT;

-- Migrate subject_id to user_id for backwards compatibility
UPDATE kb.notifications
SET user_id = subject_id
WHERE user_id IS NULL AND subject_id IS NOT NULL;

-- Migrate existing data: if read=true, set read_at to updated_at
UPDATE kb.notifications
SET read_at = updated_at
WHERE read IS TRUE AND read_at IS NULL;

-- Add indexes for the new columns
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON kb.notifications(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_notifications_read_at ON kb.notifications(read_at) WHERE read_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_notifications_importance ON kb.notifications(importance);
CREATE INDEX IF NOT EXISTS idx_notifications_cleared_at ON kb.notifications(cleared_at) WHERE cleared_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_notifications_snoozed_until ON kb.notifications(snoozed_until) WHERE snoozed_until IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_notifications_category ON kb.notifications(category) WHERE category IS NOT NULL;

-- Add composite index for common query patterns
CREATE INDEX IF NOT EXISTS idx_notifications_unread_importance 
  ON kb.notifications(user_id, importance, created_at DESC)
  WHERE read_at IS NULL AND cleared_at IS NULL;

-- Comments
COMMENT ON COLUMN kb.notifications.user_id IS 'User ID who should receive this notification (migrated from subject_id)';
COMMENT ON COLUMN kb.notifications.read_at IS 'Timestamp when notification was read (NULL = unread)';
COMMENT ON COLUMN kb.notifications.importance IS 'Notification importance level: important or other';
COMMENT ON COLUMN kb.notifications.cleared_at IS 'Timestamp when notification was cleared/dismissed';
COMMENT ON COLUMN kb.notifications.snoozed_until IS 'Timestamp until which notification is snoozed';
COMMENT ON COLUMN kb.notifications.category IS 'Notification category for filtering and routing';

-- Note: We keep the old 'read' and 'subject_id' columns for backwards compatibility
-- They can be removed in a future migration after verifying all code uses the new columns
