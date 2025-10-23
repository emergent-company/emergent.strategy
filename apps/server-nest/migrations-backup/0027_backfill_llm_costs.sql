-- Migration: Backfill cost_usd for existing LLM calls with gemini-2.5-flash
-- Date: 2025-01-22
-- Reason: Model pricing was missing for gemini-2.5-flash, causing NULL costs
-- Update all gemini-2.5-flash calls that have NULL cost
UPDATE
    kb.llm_call_logs
SET
    cost_usd = (
        (input_tokens / 1000.0 * 0.000075) + (output_tokens / 1000.0 * 0.0003)
    )
WHERE
    model_name = 'gemini-2.5-flash'
    AND cost_usd IS NULL
    AND input_tokens IS NOT NULL
    AND output_tokens IS NOT NULL;

-- Show affected rows
SELECT
    COUNT(*) as updated_rows,
    SUM(cost_usd) as total_cost_backfilled
FROM
    kb.llm_call_logs
WHERE
    model_name = 'gemini-2.5-flash'
    AND cost_usd IS NOT NULL;