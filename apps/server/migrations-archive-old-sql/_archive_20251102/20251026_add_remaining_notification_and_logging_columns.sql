-- Migration: Add remaining missing columns for notifications and logging
-- Date: 2025-10-26
-- Description: Adds cleared_at and snoozed_until to notifications, level to system_process_logs,
--              and additional columns to object_extraction_logs

-- =====================================================
-- 1. NOTIFICATIONS TABLE - Add remaining columns
-- =====================================================

-- Add cleared_at to track when notification was dismissed
ALTER TABLE kb.notifications 
ADD COLUMN IF NOT EXISTS cleared_at TIMESTAMP WITH TIME ZONE;

-- Add snoozed_until to track when notification is snoozed until
ALTER TABLE kb.notifications 
ADD COLUMN IF NOT EXISTS snoozed_until TIMESTAMP WITH TIME ZONE;

-- Add index for snoozed notifications queries
CREATE INDEX IF NOT EXISTS idx_notifications_snoozed 
ON kb.notifications(snoozed_until) 
WHERE snoozed_until IS NOT NULL;

-- Add index for cleared notifications queries
CREATE INDEX IF NOT EXISTS idx_notifications_cleared 
ON kb.notifications(cleared_at) 
WHERE cleared_at IS NOT NULL;

-- Add composite index for common unread/active notification queries
CREATE INDEX IF NOT EXISTS idx_notifications_active 
ON kb.notifications(subject_id, importance, read_at, cleared_at) 
WHERE read_at IS NULL AND cleared_at IS NULL;

-- =====================================================
-- 2. SYSTEM PROCESS LOGS - Add level and other missing columns
-- =====================================================

-- Add level column for log severity (info, warn, error, etc.)
ALTER TABLE kb.system_process_logs 
ADD COLUMN IF NOT EXISTS level VARCHAR(20) DEFAULT 'info';

-- Add message column for log messages
ALTER TABLE kb.system_process_logs 
ADD COLUMN IF NOT EXISTS message TEXT;

-- Add timestamp column for when log was created
ALTER TABLE kb.system_process_logs 
ADD COLUMN IF NOT EXISTS timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- Add organization_id for multi-tenant logging
ALTER TABLE kb.system_process_logs 
ADD COLUMN IF NOT EXISTS organization_id UUID;

-- Add check constraint for level values
ALTER TABLE kb.system_process_logs
ADD CONSTRAINT chk_system_process_logs_level 
CHECK (level IN ('debug', 'info', 'warn', 'error', 'fatal'));

-- Add index for level filtering
CREATE INDEX IF NOT EXISTS idx_system_process_logs_level 
ON kb.system_process_logs(level);

-- Add index for timestamp queries
CREATE INDEX IF NOT EXISTS idx_system_process_logs_timestamp 
ON kb.system_process_logs(timestamp DESC);

-- Add index for organization queries
CREATE INDEX IF NOT EXISTS idx_system_process_logs_org 
ON kb.system_process_logs(organization_id) 
WHERE organization_id IS NOT NULL;

-- =====================================================
-- 3. OBJECT EXTRACTION LOGS - Add missing columns
-- =====================================================

-- Add step_index to track order of extraction steps
ALTER TABLE kb.object_extraction_logs 
ADD COLUMN IF NOT EXISTS step_index INTEGER;

-- Add operation_type to categorize the type of extraction operation
ALTER TABLE kb.object_extraction_logs 
ADD COLUMN IF NOT EXISTS operation_type VARCHAR(50);

-- Add operation_name for more specific operation identification
ALTER TABLE kb.object_extraction_logs 
ADD COLUMN IF NOT EXISTS operation_name VARCHAR(100);

-- Add input_data to store the input parameters for the operation
ALTER TABLE kb.object_extraction_logs 
ADD COLUMN IF NOT EXISTS input_data JSONB;

-- Add output_data to store the results of the operation
ALTER TABLE kb.object_extraction_logs 
ADD COLUMN IF NOT EXISTS output_data JSONB;

-- Add error_message for short error descriptions
ALTER TABLE kb.object_extraction_logs 
ADD COLUMN IF NOT EXISTS error_message TEXT;

-- Add error_stack for full error stack traces
ALTER TABLE kb.object_extraction_logs 
ADD COLUMN IF NOT EXISTS error_stack TEXT;

-- Add tokens_used to track AI token consumption
ALTER TABLE kb.object_extraction_logs 
ADD COLUMN IF NOT EXISTS tokens_used INTEGER DEFAULT 0;

-- Rename metadata column if it doesn't exist (some might call it differently)
-- ALTER TABLE kb.object_extraction_logs 
-- ADD COLUMN IF NOT EXISTS metadata JSONB;

-- Add composite index for step ordering queries
CREATE INDEX IF NOT EXISTS idx_extraction_logs_job_step 
ON kb.object_extraction_logs(extraction_job_id, step_index);

-- Add index for operation type filtering
CREATE INDEX IF NOT EXISTS idx_extraction_logs_operation 
ON kb.object_extraction_logs(operation_type) 
WHERE operation_type IS NOT NULL;

-- =====================================================
-- 4. COMMENTS AND DOCUMENTATION
-- =====================================================

COMMENT ON COLUMN kb.notifications.cleared_at IS 'Timestamp when the notification was dismissed/cleared by user';
COMMENT ON COLUMN kb.notifications.snoozed_until IS 'Timestamp until which the notification is snoozed';

COMMENT ON COLUMN kb.system_process_logs.level IS 'Log severity level: debug, info, warn, error, fatal';
COMMENT ON COLUMN kb.system_process_logs.message IS 'Log message text';
COMMENT ON COLUMN kb.system_process_logs.timestamp IS 'When the log entry was created';
COMMENT ON COLUMN kb.system_process_logs.organization_id IS 'Organization this log belongs to (for multi-tenancy)';

COMMENT ON COLUMN kb.object_extraction_logs.step_index IS 'Sequential index of this step within the extraction job';
COMMENT ON COLUMN kb.object_extraction_logs.operation_type IS 'Type of extraction operation (e.g., fetch, parse, extract, link)';
COMMENT ON COLUMN kb.object_extraction_logs.operation_name IS 'Specific name of the operation being performed';
COMMENT ON COLUMN kb.object_extraction_logs.input_data IS 'Input parameters/data for this extraction step';
COMMENT ON COLUMN kb.object_extraction_logs.output_data IS 'Results/output from this extraction step';
COMMENT ON COLUMN kb.object_extraction_logs.error_message IS 'Short error description if step failed';
COMMENT ON COLUMN kb.object_extraction_logs.error_stack IS 'Full error stack trace if step failed';
COMMENT ON COLUMN kb.object_extraction_logs.tokens_used IS 'Number of AI tokens consumed in this step';
