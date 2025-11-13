-- Migration: Add process_id and process_type columns to llm_call_logs
-- Date: 2025-10-26
-- Purpose: Restore columns from old schema that are needed by MonitoringService
--          to link LLM calls to extraction jobs
-- Add process_type column (identifies what type of process made the call)
ALTER TABLE
    kb.llm_call_logs
ADD
    COLUMN IF NOT EXISTS process_type TEXT;

-- Add process_id column (identifies the specific process instance)
ALTER TABLE
    kb.llm_call_logs
ADD
    COLUMN IF NOT EXISTS process_id TEXT;

-- Add index for efficient queries by process
CREATE INDEX IF NOT EXISTS idx_llm_call_logs_process ON kb.llm_call_logs (process_type, process_id, cost_usd)
WHERE
    cost_usd IS NOT NULL;

-- Add comment explaining the columns
COMMENT ON COLUMN kb.llm_call_logs.process_type IS 'Type of process that made the LLM call (e.g., extraction_job, chat_conversation)';

COMMENT ON COLUMN kb.llm_call_logs.process_id IS 'Identifier of the specific process instance (e.g., extraction job ID)';