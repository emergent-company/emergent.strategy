# Extraction Log Improvements

**Date**: October 20, 2025  
**Issues Fixed**:
1. Duplicate `job_started` log entries
2. Missing "pending" status for long-running LLM calls

## Problems

### 1. Duplicate `job_started` Logs

**Issue**: Two identical `job_started` log entries appeared in the extraction logs UI with slightly different operation types.

**Root Cause**: The extraction worker was logging job start twice:
- First log: Line 291-297 with `operationType: 'validation'`
- Second log: Line 370-377 with `operationType: 'chunk_processing'`

**User Impact**: Confusion about why there were two start events with nearly identical data.

### 2. No "Pending" Status for LLM Calls

**Issue**: LLM extraction calls (which can take 15-60 seconds for large documents) only showed a log entry AFTER completion. Users couldn't see that extraction was actively running.

**Root Cause**: The log entry was created only after `llmProvider.extractEntities()` completed (success or error). There was no indication during the call.

**User Impact**: 
- No visual feedback during long LLM calls
- Couldn't distinguish between "waiting to start" vs "actively processing"
- Input data (prompt, document) only visible after completion

## Solutions Implemented

### 1. Removed Duplicate `job_started` Log

**Changed**: `apps/server/src/modules/extraction-jobs/extraction-worker.service.ts`

**Before**:
```typescript
// Line 291-297: First log
await this.extractionLogger.logStep({
    extractionJobId: job.id,
    stepIndex: this.stepCounter++,
    operationType: 'validation',
    operationName: 'job_started',
    status: 'success',
    inputData: job,
});

// ... 70 lines of code ...

// Line 370-377: Second log (DUPLICATE)
await this.extractionLogger.logStep({
    extractionJobId: job.id,
    stepIndex: this.stepCounter++,
    operationType: 'chunk_processing',
    operationName: 'job_started',
    inputData: job,
});
```

**After**:
```typescript
// Only one log entry at job start
await this.extractionLogger.logStep({
    extractionJobId: job.id,
    stepIndex: this.stepCounter++,
    operationType: 'validation',
    operationName: 'job_started',
    status: 'success',
    inputData: {
        source_type: job.source_type,
        source_id: job.source_id,
        project_id: job.project_id,
        organization_id: job.organization_id ?? job.org_id,
    },
});
// Second log removed
```

**Result**: Single, clean job start log with relevant metadata.

### 2. Implemented Pending → Complete Status Flow

**Changed**: 
- `apps/server/src/modules/extraction-jobs/extraction-logger.service.ts`
- `apps/server/src/modules/extraction-jobs/extraction-worker.service.ts`

#### A. Added "pending" Status Type

```typescript
// extraction-logger.service.ts
export type ExtractionLogStatus = 'pending' | 'success' | 'error' | 'warning';
```

#### B. Added Update Method to Logger

```typescript
// extraction-logger.service.ts
async updateLogStep(logId: string, updates: {
    status?: ExtractionLogStatus;
    outputData?: any;
    errorMessage?: string;
    errorStack?: string;
    durationMs?: number;
    tokensUsed?: number;
    metadata?: Record<string, any>;
}): Promise<void> {
    // Builds dynamic UPDATE query based on provided fields
    // Updates existing log entry in database
}
```

#### C. Changed LLM Call Logging Pattern

**Before** (log only after completion):
```typescript
// LLM call happens
const result = await llmProvider.extractEntities(...);

// Log created AFTER completion
await this.extractionLogger.logStep({
    operationType: 'llm_call',
    operationName: 'extract_entities',
    status: 'success',
    inputData: { ... },
    outputData: { ... },
});
```

**After** (pending → complete):
```typescript
// Create pending log BEFORE call
const llmLogId = await this.extractionLogger.logStep({
    operationType: 'llm_call',
    operationName: 'extract_entities',
    status: 'pending',
    inputData: {
        prompt: extractionPrompt,
        document_content: documentContent,
        content_length: documentContent.length,
        allowed_types: allowedTypes,
        schema_types: Object.keys(objectSchemas),
    },
    metadata: {
        provider: providerName,
        model: this.config.vertexAiModel,
    },
});

// LLM call happens (may take 15-60 seconds)
const result = await llmProvider.extractEntities(...);

// Update log to success
await this.extractionLogger.updateLogStep(llmLogId, {
    status: 'success',
    outputData: { ... },
    durationMs: Date.now() - llmCallStartTime,
    tokensUsed: result.usage?.total_tokens,
    metadata: { ... },
});
```

**Error Path**:
```typescript
catch (error) {
    // Update log to error
    await this.extractionLogger.updateLogStep(llmLogId, {
        status: 'error',
        errorMessage: message,
        errorStack: error.stack,
        durationMs: Date.now() - llmCallStartTime,
        outputData: responseMetadata ? { ... } : undefined,
    });
}
```

## User Experience Improvements

### Before

**Extraction Logs UI**:
```
2:17:48 PM  job_started    success  N/A
2:17:48 PM  job_started    success  N/A  (duplicate, confusing)
[Long wait... no indication of what's happening]
2:18:35 PM  extract_entities  success  47 seconds
```

**Issues**:
- ❌ Two identical start logs (why?)
- ❌ No feedback during 47-second LLM call
- ❌ Input data only visible after completion

### After

**Extraction Logs UI**:
```
2:17:48 PM  job_started        success  N/A
2:17:49 PM  extract_entities   pending  (shows input: prompt, doc length, types)
[User sees "pending" status with input data visible]
2:18:35 PM  extract_entities   success  47 seconds (updated same entry)
```

**Improvements**:
- ✅ Single clean job start log
- ✅ Immediate visual feedback when LLM call starts
- ✅ Input data visible while processing (can see what's being sent)
- ✅ Same log entry transitions from pending → success/error
- ✅ Clear progression: start → processing → complete

## Technical Details

### Database Schema Support

The `kb.object_extraction_logs` table already supports this pattern:
- `status` column accepts any string (no enum constraint)
- `id` column (UUID primary key) allows updates by ID
- All columns nullable except core identifiers

### Update Query Pattern

The `updateLogStep` method builds dynamic SQL:

```sql
UPDATE kb.object_extraction_logs 
SET status = $1, 
    output_data = $2, 
    duration_ms = $3, 
    tokens_used = $4,
    metadata = $5
WHERE id = $6
```

Only provided fields are included in the UPDATE statement.

### Log Entry Lifecycle

1. **Create**: Insert with `status: 'pending'` and `inputData`
2. **Process**: LLM call executes (may take seconds to minutes)
3. **Update**: Same entry updated with:
   - `status: 'success'` or `status: 'error'`
   - `outputData`: Results or error details
   - `durationMs`: Actual processing time
   - `tokensUsed`: Token consumption

### Frontend Compatibility

The frontend extraction logs UI should handle status values:

```typescript
// Status badge rendering
if (status === 'pending') {
    return <Badge variant="warning">Processing...</Badge>;
} else if (status === 'success') {
    return <Badge variant="success">Complete</Badge>;
} else if (status === 'error') {
    return <Badge variant="error">Failed</Badge>;
}
```

**Data Visibility**:
- `inputData`: Always present (visible during pending)
- `outputData`: Null during pending, populated after completion
- `durationMs`: Null during pending, populated after completion

## Testing

### 1. Verify No Duplicate `job_started`

Run extraction, check logs:

```sql
SELECT operation_name, COUNT(*) 
FROM kb.object_extraction_logs 
WHERE extraction_job_id = '<job-id>' 
    AND operation_name = 'job_started'
GROUP BY operation_name;
```

**Expected**: COUNT = 1 (no duplicates)

### 2. Verify Pending Status Appears

Monitor logs in real-time during extraction:

```sql
SELECT status, input_data IS NOT NULL as has_input, output_data IS NOT NULL as has_output
FROM kb.object_extraction_logs 
WHERE extraction_job_id = '<job-id>' 
    AND operation_name = 'extract_entities'
ORDER BY logged_at DESC 
LIMIT 1;
```

**During extraction**: `status = 'pending', has_input = true, has_output = false`  
**After completion**: `status = 'success', has_input = true, has_output = true`

### 3. Verify Status Transition

Check log entry before and after LLM call completes:

```sql
-- Query during extraction
SELECT id, status, duration_ms, tokens_used
FROM kb.object_extraction_logs 
WHERE operation_name = 'extract_entities'
ORDER BY logged_at DESC LIMIT 1;

-- Same query after extraction completes
-- Should show SAME id with updated status, duration_ms, tokens_used
```

### 4. Test Error Path

Trigger an extraction error (e.g., invalid schema), verify:

```sql
SELECT status, error_message, output_data
FROM kb.object_extraction_logs 
WHERE operation_name = 'extract_entities'
    AND extraction_job_id = '<job-id>';
```

**Expected**: `status = 'error'`, `error_message` populated, `output_data` contains error context

## Benefits

### User Benefits
1. **Clear Feedback**: Immediate indication when extraction starts processing
2. **No Confusion**: Single job start log (no duplicates)
3. **Transparency**: See input data while extraction runs
4. **Status Clarity**: Distinguish between waiting and actively processing

### Developer Benefits
1. **Better Debugging**: Can inspect input data during processing
2. **Performance Monitoring**: Can see which extractions are currently running
3. **Cleaner Code**: Single responsibility per log entry (one operation = one entry)
4. **Extensible Pattern**: Can apply pending → complete to other long operations

### System Benefits
1. **Database Efficiency**: Update existing entry instead of creating new one
2. **Log Consistency**: One log entry per operation (easier querying)
3. **Audit Trail**: Same UUID tracks operation from start to finish

## Migration Notes

### No Migration Required

This change is **backward compatible**:
- Old log entries (without pending status) still work
- Frontend should gracefully handle unknown status values
- Database schema doesn't need changes (status is varchar)

### Frontend Updates (Recommended)

Update extraction logs UI to:
1. Display pending status with distinct styling
2. Show input data immediately (don't wait for output)
3. Handle status transitions gracefully (same log ID, updated data)
4. Poll for updates while status = 'pending'

### Monitoring Queries

Track pending operations:

```sql
-- Find currently running extractions
SELECT 
    extraction_job_id,
    operation_name,
    logged_at,
    EXTRACT(EPOCH FROM (NOW() - logged_at)) as seconds_running
FROM kb.object_extraction_logs
WHERE status = 'pending'
ORDER BY logged_at DESC;
```

## Future Enhancements

### 1. Real-time Status Updates (WebSocket)

Stream log updates to frontend:
- Emit event when status changes from pending → complete
- Frontend updates UI without polling
- Ideal for long-running extractions (> 30 seconds)

### 2. Progress Percentage

For chunked extractions, show progress:

```typescript
// During chunk 2 of 5
await this.extractionLogger.updateLogStep(llmLogId, {
    metadata: {
        progress: {
            current_chunk: 2,
            total_chunks: 5,
            percentage: 40
        }
    }
});
```

UI shows: "Processing chunk 2 of 5 (40%)"

### 3. Estimated Time Remaining

Based on historical data:

```typescript
metadata: {
    estimated_completion: '2025-10-20T14:30:00Z',
    estimated_duration_ms: 45000
}
```

### 4. Cancellation Support

Allow cancelling pending operations:

```typescript
// User clicks "Cancel"
await this.extractionLogger.updateLogStep(llmLogId, {
    status: 'cancelled',
    errorMessage: 'Cancelled by user'
});
```

## Related Documentation

- **Chunking Implementation**: `docs/EXTRACTION_CHUNKING_IMPLEMENTATION.md`
- **Enhanced Error Logging**: `docs/EXTRACTION_JOB_43E7FED5_INVESTIGATION.md`
- **Extraction Logger**: `apps/server/src/modules/extraction-jobs/extraction-logger.service.ts`
- **Extraction Worker**: `apps/server/src/modules/extraction-jobs/extraction-worker.service.ts`

## Summary

✅ **Removed**: Duplicate `job_started` log entries  
✅ **Added**: Pending status for long-running operations  
✅ **Implemented**: Log entry update mechanism  
✅ **Improved**: User visibility into extraction progress  
✅ **Maintained**: Backward compatibility with existing logs

**Result**: Cleaner, more informative extraction logs with real-time status visibility.
