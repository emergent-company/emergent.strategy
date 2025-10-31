# Extraction Logs Schema Comparison

This document compares the `object_extraction_logs` table schema between the old and new database instances.

## Summary

The code has been updated to work with the **NEW schema** (spec-server-2-db-1). The old database (spec-server-db-1) is kept as a reference and will not be modified.

## Key Differences

### Columns in OLD schema but NOT in NEW:
- `logged_at` (timestamp) → renamed to `started_at` in new schema
- `created_at` (timestamp) → removed, `started_at` serves this purpose
- `metadata` (jsonb) → data now stored in `output_data` instead

### Columns in NEW schema but NOT in OLD:
- `step` (varchar(50), NOT NULL) - step name/identifier
- `message` (text) - human-readable message
- `entity_count` (integer) - count of entities processed
- `relationship_count` (integer) - count of relationships created
- `error_details` (jsonb) - structured error information
- `started_at` (timestamp, NOT NULL) - replaces `logged_at`
- `completed_at` (timestamp) - when step completed

### Type Changes:
- `operation_type`: `text` → `varchar(50)`
- `operation_name`: `text` → `varchar(100)`
- `status`: `text` → `varchar(20)` with CHECK constraint

### New Constraints:
- NEW schema has CHECK constraint on `status` values: pending, running, completed, failed, skipped
- OLD schema has no CHECK constraints on status

### Index Differences:
- OLD has `idx_extraction_logs_errors` (filtered index for status='error')
- NEW has `idx_extraction_logs_step` and `idx_extraction_logs_started`
- NEW has filtered indexes using `WHERE operation_type IS NOT NULL`

## Code Changes Made

The following files were updated to work with the NEW schema:

1. **extraction-logger.service.ts**
   - Updated `ExtractionLogRow` interface to match new schema
   - Updated `logStep()` INSERT to use new columns
   - Updated `updateLogStep()` to not use `metadata` column
   - Updated all SELECT queries (`getJobLogs`, `getLogsByType`, `getErrorLogs`)

2. **extraction-worker.service.ts**
   - Updated `updateLogStep()` calls to move metadata into `output_data`

## Database Files Created

- `old-database-schema-dump.sql` - Full schema dump of old database (spec-server-db-1)
- `old-vs-new-extraction-logs-schema.md` - Side-by-side comparison of extraction logs table

## Active Database

The application currently uses: **spec-server-2-db-1** (port 5437)
- This is the database with the NEW schema
- All code now works with this schema
- Extraction logs should now be created properly

## Old Database (Kept for Reference)

Database: **spec-server-db-1** (port 5432)
- Contains the OLD schema
- Kept as reference, will not be modified
- Can be compared against when needed

## Testing

After these changes:
1. Server is running and using the new database
2. Extraction jobs should now create logs in `kb.object_extraction_logs`
3. The `/admin/extraction-jobs/:id/logs` endpoint should return logs
4. The detailed logs modal in the UI should display logs

To verify logs are being created:
```sql
-- Connect to spec-server-2-db-1
SELECT COUNT(*) FROM kb.object_extraction_logs;

-- View recent logs
SELECT 
    step, 
    status, 
    message, 
    started_at,
    duration_ms
FROM kb.object_extraction_logs 
ORDER BY started_at DESC 
LIMIT 10;
```
