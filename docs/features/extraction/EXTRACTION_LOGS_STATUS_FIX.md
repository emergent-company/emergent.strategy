# Extraction Logs Status Value Fix

## Problem

Extraction logs were not being created because the code was using invalid status values that violated the database CHECK constraint.

### Root Cause

The `object_extraction_logs` table has a CHECK constraint that only allows these status values:
- `pending`
- `running`
- `completed`
- `failed`
- `skipped`

However, the TypeScript code was using **old status values**:
- `success` (should be `completed`)
- `error` (should be `failed`)
- `warning` (should be `skipped`)

This caused PostgreSQL to reject the INSERT statements with error:
```
new row for relation "object_extraction_logs" violates check constraint "chk_extraction_log_status"
```

## Files Changed

### 1. `extraction-logger.service.ts`

**Updated TypeScript type definition:**
```typescript
// Before
export type ExtractionLogStatus = 'pending' | 'success' | 'error' | 'warning';

// After
export type ExtractionLogStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
```

**Updated default status parameter:**
```typescript
// Before
async logStep(params: LogExtractionStepParams): Promise<string> {
    const { ..., status = 'success', ... } = params;
    
// After
async logStep(params: LogExtractionStepParams): Promise<string> {
    const { ..., status = 'completed', ... } = params;
```

**Updated message generation:**
```typescript
// Before
const message = errorMessage || (status === 'success' ? `${operationType} completed successfully` : `${operationType} ${status}`);

// After
const message = errorMessage || (status === 'completed' ? `${operationType} completed successfully` : `${operationType} ${status}`);
```

### 2. `extraction-worker.service.ts`

**Changed all occurrences of status values:**

| Location (approx line) | Operation | Before | After |
|---|---|---|---|
| 326 | Job started | `'success'` | `'completed'` |
| 584 | LLM extraction completed | `'success'` | `'completed'` |
| 617 | LLM extraction error | `'error'` | `'failed'` |
| 869 | Object creation success | `'success'` | `'completed'` |
| 919 | Skip duplicate object | `'warning'` | `'skipped'` |
| 1042 | Object merge success | `'success'` | `'completed'` |
| 1101 | Object creation error | `'error'` | `'failed'` |

**Also removed invalid `metadata` parameter** from the skipped object log (line ~931), since metadata column was removed in the new schema.

## Testing

After fixing:

1. **Compilation**: Server builds successfully with no TypeScript errors
2. **Database constraints**: All INSERT statements now use valid status values
3. **Log creation**: Extraction logs are now being created successfully

```sql
-- Verify logs are being created
SELECT id, step, status, message, started_at 
FROM kb.object_extraction_logs 
ORDER BY started_at DESC 
LIMIT 10;

-- Result: 3 rows found with 'completed' and 'pending' statuses ✅
```

4. **Job logs count**: Extraction jobs now have associated logs
```sql
SELECT ej.id, ej.status, COUNT(el.id) as log_count 
FROM kb.object_extraction_jobs ej 
LEFT JOIN kb.object_extraction_logs el ON ej.id = el.extraction_job_id 
GROUP BY ej.id, ej.status;

-- Result: Job a1fac90a has 2 logs ✅
```

## Status Values Reference

For future development, use these status values when working with extraction logs:

| Status | When to Use |
|---|---|
| `pending` | Step is queued but not yet started |
| `running` | Step is currently executing |
| `completed` | Step finished successfully |
| `failed` | Step encountered an error |
| `skipped` | Step was skipped (e.g., duplicate object) |

## Related Documentation

- `docs/EXTRACTION_LOGS_SCHEMA_COMPARISON.md` - Full schema comparison between old and new databases
- `docs/old-vs-new-extraction-logs-schema.md` - Side-by-side schema comparison
- `old-database-schema-dump.sql` - Complete old database schema reference

## Server Restart

After all fixes were applied, the server auto-reloaded via ts-node-dev and extraction jobs resumed processing with proper log creation.

**Date Fixed**: October 26, 2025
**Status**: ✅ RESOLVED
