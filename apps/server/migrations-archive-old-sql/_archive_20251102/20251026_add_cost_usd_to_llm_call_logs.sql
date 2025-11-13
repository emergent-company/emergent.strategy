-- Migration: Add cost_usd column to llm_call_logs table
-- Date: 2025-10-26
-- Purpose: Track the cost (in USD) of each LLM API call for monitoring and billing purposes
-- Add cost_usd column to llm_call_logs
ALTER TABLE
    kb.llm_call_logs
ADD
    COLUMN IF NOT EXISTS cost_usd NUMERIC(10, 6);

-- Add comment explaining the column
COMMENT ON COLUMN kb.llm_call_logs.cost_usd IS 'Cost of the LLM API call in USD. Calculated based on token usage and model pricing.';

-- Add index for efficient cost aggregation queries
CREATE INDEX IF NOT EXISTS idx_llm_call_logs_cost_usd ON kb.llm_call_logs(cost_usd)
WHERE
    cost_usd IS NOT NULL;

-- Add index for efficient process-based cost queries (used by monitoring service)
CREATE INDEX IF NOT EXISTS idx_llm_call_logs_process ON kb.llm_call_logs(process_type, process_id, cost_usd)
WHERE
    process_type IS NOT NULL
    AND process_id IS NOT NULL;