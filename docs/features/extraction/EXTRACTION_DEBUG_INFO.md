# Debug Info Feature - Implementation Summary

## Overview
Added debug information capture and display for extraction jobs to help developers understand LLM behavior, debug extraction issues, and improve prompts.

## Changes Made

### 1. Database Schema
**File:** `docs/migrations/010-extraction-jobs-debug-info.sql`
- Added `debug_info` JSONB column to `kb.object_extraction_jobs` table
- Created GIN index for efficient querying
- Status: ✅ Migration executed successfully

```sql
ALTER TABLE kb.object_extraction_jobs
ADD COLUMN debug_info JSONB NULL;

CREATE INDEX idx_object_extraction_jobs_debug_info 
ON kb.object_extraction_jobs USING GIN (debug_info)
WHERE debug_info IS NOT NULL;
```

### 2. Backend DTOs
**File:** `apps/server/src/modules/extraction-jobs/dto/extraction-job.dto.ts`
- Added `debug_info?: Record<string, any>` field to `UpdateExtractionJobDto`
- Added `debug_info?: Record<string, any>` field to `ExtractionJobDto` (response)
- Includes API documentation and validation decorators

### 3. Service Layer
**File:** `apps/server/src/modules/extraction-jobs/extraction-job.service.ts`
- Updated `updateJob()` to handle `debug_info` in SQL UPDATE queries
- Updated `markCompleted()` to accept `debug_info` parameter
- Updated row mapping to include `debug_info` field

### 4. LLM Provider Enhancement
**File:** `apps/server/src/modules/extraction-jobs/llm/langchain-gemini.provider.ts`
- Modified `extractEntities()` to collect per-type LLM call debug data
- Modified `extractEntitiesForType()` to return `{ entities, prompt, rawResponse }`
- Captures for each LLM call:
  - Input: document (truncated to 500 chars), prompt, allowed_types
  - Output: raw LLM response with entities
  - Metadata: duration_ms, timestamp, model, status (success/error)
- Returns debug data in `ExtractionResult.raw_response`

**Debug Info Structure:**
```typescript
{
  llm_calls: [
    {
      type: 'Requirement',  // Entity type extracted
      input: {
        document: 'First 500 chars...',
        prompt: 'Full extraction prompt',
        allowed_types: ['Requirement']
      },
      output: { entities: [...] },  // Raw LLM response
      entities_found: 5,
      duration_ms: 1234,
      timestamp: '2025-10-05T...',
      model: 'gemini-1.5-flash-latest',
      status: 'success'
    }
    // ... one entry per entity type (8 total)
  ],
  total_duration_ms: 9876,
  total_entities: 42,
  types_processed: 8
}
```

### 5. Worker Instrumentation
**File:** `apps/server/src/modules/extraction-jobs/extraction-worker.service.ts`
- Extracts debug info from `extractionResult.raw_response`
- Passes debug info to `markCompleted()` calls (both success and requires_review paths)
- Debug data stored in database upon job completion

### 6. Frontend API Client
**File:** `apps/admin/src/api/extraction-jobs.ts`
- Added `debug_info?: Record<string, any>` to `ExtractionJob` interface
- Type-safe access to debug information in UI components

### 7. UI Component
**File:** `apps/admin/src/components/molecules/DebugInfoPanel.tsx`
- New reusable molecule component for displaying debug information
- Features:
  - Summary statistics card (total calls, duration, entities, types)
  - Collapsible sections for each LLM call
  - Input display (document truncated, full prompt, allowed types)
  - Output display (formatted JSON of LLM response)
  - Error display (if call failed)
  - Color-coded badges (success/error)
  - Duration formatting (ms/seconds)
  - Timestamp display
- Responsive design using daisyUI components

### 8. Detail Page Integration
**File:** `apps/admin/src/pages/admin/pages/extraction-jobs/detail.tsx`
- Added `DebugInfoPanel` import
- Added "Debug Information" section after error details
- Only shows when `job.debug_info` exists
- Includes helpful description text

## Testing

### Backend Build
✅ Server builds successfully without TypeScript errors

### Frontend Build
✅ Admin app builds successfully without TypeScript errors
- All 209 modules transformed
- No compilation warnings or errors

## Usage

### For Developers
1. **View Debug Info**: Navigate to any extraction job detail page
2. **Expand LLM Calls**: Click on individual calls to see request/response details
3. **Analyze Prompts**: Review exact prompts sent to LLM for each entity type
4. **Inspect Responses**: See raw JSON responses from the model
5. **Measure Performance**: Check per-call and total duration metrics

### Debug Scenarios
- **Low Extraction Quality**: Check if prompt is clear and well-structured
- **Missing Entities**: Verify document content is being sent correctly
- **Wrong Entity Types**: Inspect what types were requested vs. what was returned
- **Performance Issues**: Identify slow LLM calls (high duration_ms)
- **Model Failures**: See error messages and understand failure patterns

## Data Flow

```
1. Document → Extraction Worker
2. Worker calls LLM Provider with content + prompt + types
3. LLM Provider loops through entity types (8 calls to Gemini)
4. Each call captured: input, output, duration, status
5. Debug data collected in raw_response
6. Worker stores debug_info in database
7. Frontend fetches job with debug_info
8. DebugInfoPanel displays collapsible debug sections
```

## Performance Considerations

- **Storage**: Debug info stored as JSONB with GIN index
- **Document Truncation**: Input documents truncated to 500 characters to save space
- **Optional Field**: Debug info only stored for jobs with LLM calls
- **Frontend**: Collapsible UI prevents overwhelming page load
- **Query Performance**: GIN index enables efficient JSONB queries

## Future Enhancements

1. **Token Counting**: Add per-call token usage from LangChain (currently returns 0)
2. **Search/Filter**: Add ability to search debug info across jobs
3. **Export**: Download debug data as JSON file
4. **Comparison**: Compare debug info across multiple job runs
5. **Highlighting**: Highlight differences between expected vs actual entities
6. **Prompt History**: Track prompt changes over time
7. **A/B Testing**: Compare different prompts side-by-side

## Files Modified

### Backend
1. `docs/migrations/010-extraction-jobs-debug-info.sql` (new)
2. `apps/server/src/modules/extraction-jobs/dto/extraction-job.dto.ts`
3. `apps/server/src/modules/extraction-jobs/extraction-job.service.ts`
4. `apps/server/src/modules/extraction-jobs/llm/langchain-gemini.provider.ts`
5. `apps/server/src/modules/extraction-jobs/extraction-worker.service.ts`

### Frontend
6. `apps/admin/src/api/extraction-jobs.ts`
7. `apps/admin/src/components/molecules/DebugInfoPanel.tsx` (new)
8. `apps/admin/src/pages/admin/pages/extraction-jobs/detail.tsx`

## Rollback Plan

If needed, the feature can be safely rolled back:

1. **Remove UI Component**: Delete imports and debug section from detail page
2. **Database**: Column is nullable, so no data issues if not populated
3. **Backend**: Remove debug_info handling from service/worker (non-breaking)
4. **Migration Rollback** (if necessary):
   ```sql
   DROP INDEX IF EXISTS idx_object_extraction_jobs_debug_info;
   ALTER TABLE kb.object_extraction_jobs DROP COLUMN debug_info;
   ```

## Notes

- Debug info is **not** displayed for jobs without LLM calls
- Document content is **truncated** to 500 characters in debug data
- Full prompts are stored (can be large, but necessary for debugging)
- Debug info is captured for **both successful and failed** LLM calls
- Error details remain separate from debug info (different use cases)
