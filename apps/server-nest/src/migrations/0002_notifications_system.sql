-- Notification System Migration
-- Implements centralized notification inbox for admin users
-- See spec/35-admin-notification-inbox.md for complete specification
BEGIN;

-- =====================================================
-- Notifications Table
-- =====================================================
CREATE TABLE IF NOT EXISTS kb.notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    organization_id UUID,
    project_id UUID,
    -- Recipient
    user_id UUID NOT NULL REFERENCES kb.users(id) ON DELETE CASCADE,
    -- Notification classification
    category TEXT NOT NULL,
    -- 'import.completed', 'extraction.failed', etc.
    importance TEXT NOT NULL DEFAULT 'other',
    -- 'important' or 'other'
    -- Content
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    details JSONB,
    -- Source tracking
    source_type TEXT,
    -- 'integration', 'extraction_job', 'graph_object', 'user'
    source_id UUID,
    -- Integration ID, job ID, object ID, etc.
    -- Actions
    action_url TEXT,
    -- Deep link to relevant page
    action_label TEXT,
    -- "Review Import", "View Object", etc.
    -- State
    read_at TIMESTAMPTZ,
    cleared_at TIMESTAMPTZ,
    snoozed_until TIMESTAMPTZ,
    -- Grouping
    group_key TEXT,
    -- Group related notifications (e.g., sync_job_xyz)
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_notifications_user ON kb.notifications(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_unread ON kb.notifications(user_id)
WHERE
    read_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_notifications_important ON kb.notifications(user_id, importance)
WHERE
    cleared_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_notifications_snoozed ON kb.notifications(snoozed_until)
WHERE
    snoozed_until IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_notifications_group ON kb.notifications(group_key, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_cleared ON kb.notifications(user_id, cleared_at)
WHERE
    cleared_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_notifications_category ON kb.notifications(user_id, category);

-- =====================================================
-- User Notification Preferences Table
-- =====================================================
CREATE TABLE IF NOT EXISTS kb.user_notification_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES kb.users(id) ON DELETE CASCADE,
    -- Category-specific preferences
    category TEXT NOT NULL,
    -- 'import', 'extraction', 'mention', etc.
    -- Delivery channels
    in_app_enabled BOOLEAN DEFAULT true,
    email_enabled BOOLEAN DEFAULT false,
    email_digest BOOLEAN DEFAULT false,
    -- Daily digest instead of immediate
    -- Importance override
    force_important BOOLEAN DEFAULT false,
    force_other BOOLEAN DEFAULT false,
    -- Auto-actions
    auto_mark_read BOOLEAN DEFAULT false,
    auto_clear_after_days INTEGER,
    -- Auto-clear after X days
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(user_id, category)
);

CREATE INDEX IF NOT EXISTS idx_notif_prefs_user ON kb.user_notification_preferences(user_id);

-- =====================================================
-- Cleanup Function
-- Auto-delete cleared notifications older than 30 days
-- =====================================================
CREATE
OR REPLACE FUNCTION kb.delete_old_cleared_notifications() RETURNS void AS $ $ BEGIN
DELETE FROM
    kb.notifications
WHERE
    cleared_at IS NOT NULL
    AND cleared_at < now() - interval '30 days';

END;

$ $ LANGUAGE plpgsql;

-- =====================================================
-- Auto-snooze Wake-up Function
-- Trigger to wake up snoozed notifications
-- =====================================================
CREATE
OR REPLACE FUNCTION kb.wakeup_snoozed_notifications() RETURNS void AS $ $ BEGIN
UPDATE
    kb.notifications
SET
    snoozed_until = NULL
WHERE
    snoozed_until IS NOT NULL
    AND snoozed_until < now();

END;

$ $ LANGUAGE plpgsql;

COMMIT;

-- Note: Schedule these functions via cron or application scheduler:
-- SELECT cron.schedule('cleanup-notifications', '0 2 * * *', $$SELECT kb.delete_old_cleared_notifications()$$);
-- SELECT cron.schedule('wakeup-notifications', '*/5 * * * *', $$SELECT kb.wakeup_snoozed_notifications()$$);