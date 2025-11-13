# Extraction Logs Schema Evolution

## Overview

This document explains the schema evolution for `kb.object_extraction_logs` and why the status values changed between the old and new database instances.

## Old Schema (spec-server-db-1)

### Status Column
- **Type**: `text` (no constraints)
- **Default**: `'success'`
- **No CHECK constraint** - any text value was allowed

### Status Values Used in Code
- `'success'` - for successful operations
- `'error'` - for failed operations  
- `'warning'` - for warnings/skipped items
- `'pending'` - for queued operations

### Column Names
- `logged_at` - timestamp when log was created
- `created_at` - duplicate timestamp
- `metadata` - JSONB column for additional data
- `status` - text column with no constraints

### Index
```sql
CREATE INDEX idx_extraction_logs_errors ON kb.object_extraction_logs(extraction_job_id) 
WHERE status = 'error'::text;
```

## New Schema (spec-server-2-db-1)

### Status Column
- **Type**: `varchar(20)` with CHECK constraint
- **No default** (explicitly set in code)
- **CHECK constraint** enforces specific values only

### CHECK Constraint
```sql
CONSTRAINT chk_extraction_log_status CHECK (
    status IN (
        'pending',
        'running',
        'completed',
        'failed',
        'skipped'
    )
)
```

### Status Values Mapping

| Old Value | New Value | Reason |
|-----------|-----------|--------|
| `'success'` | `'completed'` | More semantic - operation completed successfully |
| `'error'` | `'failed'` | More semantic - operation failed with error |
| `'warning'` | `'skipped'` | More accurate - operation was skipped/bypassed |
| `'pending'` | `'pending'` | No change - operation is queued |
| N/A | `'running'` | New state - operation is currently executing |

### Column Names (Changed)
- `logged_at` → `started_at` - when step started execution
- `created_at` → removed (redundant with `started_at`)
- `metadata` → removed (data moved to `output_data`)
- Added `completed_at` - when step finished
- Added `step` - step name/identifier (NOT NULL)
- Added `message` - human-readable message
- Added `entity_count` - count of entities processed
- Added `relationship_count` - count of relationships created
- Added `error_details` - structured error information (JSONB)

### Indexes (Improved)
```sql
CREATE INDEX idx_extraction_logs_job ON kb.object_extraction_logs(extraction_job_id);
CREATE INDEX idx_extraction_logs_status ON kb.object_extraction_logs(status);
CREATE INDEX idx_extraction_logs_step ON kb.object_extraction_logs(step);
CREATE INDEX idx_extraction_logs_started ON kb.object_extraction_logs(started_at DESC);
```

## Code Changes Required

### 1. TypeScript Type Definition

**Before (Old Schema):**
```typescript
export type ExtractionLogStatus = 'pending' | 'success' | 'error' | 'warning';
```

**After (New Schema):**
```typescript
export type ExtractionLogStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
```

### 2. Default Status Value

**Before:**
```typescript
status = 'success'
```

**After:**
```typescript
status = 'completed'
```

### 3. All Status References in Code

Updated in `extraction-worker.service.ts` and `extraction-logger.service.ts`:
- Job start success: `'success'` → `'completed'`
- LLM extraction success: `'success'` → `'completed'`
- Object creation success: `'success'` → `'completed'`
- Object merge success: `'success'` → `'completed'`
- LLM extraction failure: `'error'` → `'failed'`
- Object creation failure: `'error'` → `'failed'`
- Duplicate skip: `'warning'` → `'skipped'`

## Why This Change Was Needed

### 1. Database Constraint Enforcement
The new schema enforces valid status values at the database level, preventing invalid data from being inserted. This provides:
- **Data integrity** - only valid statuses can be stored
- **Query optimization** - database can optimize queries knowing the value set
- **Documentation** - schema itself documents valid values

### 2. More Semantic Status Names
The new status values are more descriptive:
- `'completed'` is clearer than `'success'`
- `'failed'` is clearer than `'error'`  
- `'skipped'` is more accurate than `'warning'`

### 3. Better State Modeling
The addition of `'running'` status allows tracking:
- When operations are currently in progress
- Long-running operations can be monitored
- More granular progress tracking

## Migration Path

### If You Need to Migrate Data

If you have logs in the old format that need migration:

```sql
-- Migrate status values from old to new
UPDATE kb.object_extraction_logs
SET status = CASE 
    WHEN status = 'success' THEN 'completed'
    WHEN status = 'error' THEN 'failed'
    WHEN status = 'warning' THEN 'skipped'
    WHEN status = 'pending' THEN 'pending'
    ELSE 'failed'  -- default for unknown values
END;
```

### Verification Query

```sql
-- Check that all status values are valid
SELECT DISTINCT status 
FROM kb.object_extraction_logs 
ORDER BY status;

-- Should only return: completed, failed, pending, running, skipped
```

## Testing

After the code changes:

```bash
# 1. Verify code compiles
npx nx run server:build

# 2. Check database accepts new values
docker exec spec-server-2-db-1 psql -U spec -d spec -c "
  SELECT step, status, message, started_at 
  FROM kb.object_extraction_logs 
  ORDER BY started_at DESC LIMIT 10;
"

# 3. Verify logs are being created
docker exec spec-server-2-db-1 psql -U spec -d spec -c "
  SELECT ej.id, ej.status, COUNT(el.id) as log_count 
  FROM kb.object_extraction_jobs ej 
  LEFT JOIN kb.object_extraction_logs el ON ej.id = el.extraction_job_id 
  GROUP BY ej.id, ej.status;
"
```

## Related Documentation

- `docs/EXTRACTION_LOGS_SCHEMA_COMPARISON.md` - Full side-by-side schema comparison
- `docs/EXTRACTION_LOGS_STATUS_FIX.md` - Details of the status value fix
- Migration: `apps/server/migrations/20251026_fix_notifications_and_extraction_logging.sql`

## Summary

The schema evolution from the old to new database required updating status values in the code to match the new CHECK constraint. The old code was **correct for the old schema**, and the new code is **correct for the new schema**. This was not a bug fix but rather a **schema migration** that required corresponding code changes.

**Status**: ✅ Code successfully updated to work with new schema
**Date**: October 26, 2025
