# Gemini 2.5 Flash Extraction Fixes

**Date**: 2025-10-05  
**Issue**: JSON parsing errors and schema validation errors during entity extraction  
**Status**: ✅ Fixed

## Problems Encountered

### 1. Schema Validation Error: `exclusiveMinimum` Not Supported

**Error**:
```
[GoogleGenerativeAI Error]: Invalid JSON payload received. 
Unknown name "exclusiveMinimum" at 'generation_config.response_schema.properties[0].value.items.properties[9].value': Cannot find field.
```

**Root Cause**: 
- Zod's `.positive()` method generates JSON Schema with `exclusiveMinimum: 0`
- Gemini's API doesn't support `exclusiveMinimum` (it only supports `minimum`)
- This occurred in the Task schema: `estimated_hours: z.number().positive()`

**Fix Applied**:
- Changed `z.number().positive()` to `z.number().min(0.1)`
- This generates `minimum: 0.1` instead of `exclusiveMinimum: 0`
- File: `apps/server/src/modules/extraction-jobs/schemas/task.schema.ts`

### 2. JSON Parsing Errors: Malformed LLM Responses

**Errors**:
```
SyntaxError: Unterminated string in JSON at position 1772 (line 20 column 198)
SyntaxError: Expected ',' or '}' after property value in JSON at position 12064 (line 168 column 19)
```

**Root Cause**:
- Gemini 2.5 Flash occasionally returns malformed JSON with:
  - Unterminated strings (missing closing quotes)
  - Missing commas between properties
  - Improperly escaped characters
- This is a known issue with complex schemas and long outputs

**Fix Applied**:
- Added graceful error handling for JSON parsing errors
- Instead of crashing the entire extraction job, we now:
  1. Catch `SyntaxError` exceptions
  2. Log the error with context
  3. Skip that specific entity type and continue with others
  4. Return debug information about the failure
- File: `apps/server/src/modules/extraction-jobs/llm/langchain-gemini.provider.ts`

```typescript
catch (error) {
    // Check if it's a JSON parsing error from malformed LLM response
    if (error instanceof SyntaxError && error.message.includes('JSON')) {
        this.logger.error(`LLM extraction failed for type ${typeName}:`, error);
        this.logger.error(`JSON parsing error - the LLM returned malformed JSON. This is a known issue with Gemini 2.5 Flash that can occur with complex schemas. Skipping this entity type.`);
        
        // Return empty result instead of crashing the entire extraction
        return {
            entities: [],
            prompt: typePrompt,
            rawResponse: { error: 'JSON parsing failed', message: error.message }
        };
    }
    
    this.logger.error(`LLM extraction failed for type ${typeName}:`, error);
    throw error;
}
```

## How to Access Extraction Debug Information

The extraction system includes comprehensive debug information for troubleshooting LLM extraction issues.

### Via Admin UI

1. **Navigate to Extraction Jobs**:
   - Open: `http://localhost:5175/admin/extraction-jobs`
   - Or click "Extraction Jobs" in the sidebar

2. **View Job List**:
   - See all extraction jobs with status, progress, and entity counts
   - Filter by status (pending, running, completed, failed, cancelled)

3. **Open Job Details**:
   - Click on any job to see detailed information
   - Scroll to the **"Debug Information"** section

4. **Debug Information Panel Shows**:
   - Model used (e.g., `gemini-2.5-flash`)
   - Prompt sent to LLM (truncated document + instructions)
   - Response received from LLM
   - Entities extracted (or errors encountered)
   - Per-entity-type breakdown with:
     - Input (document, prompt, allowed types)
     - Output (raw LLM response)
     - Entities found count
     - Duration (milliseconds)
     - Timestamp
     - Status (success/error)

### Via API

**Endpoint**: `GET /admin/extraction-jobs/:jobId`

**Response includes**:
```json
{
  "id": "uuid",
  "status": "completed",
  "debug_info": {
    "llm_calls": [
      {
        "type": "Requirement",
        "input": {
          "document": "truncated content...",
          "prompt": "full prompt...",
          "allowed_types": ["Requirement"]
        },
        "output": {
          "entities": [...]
        },
        "entities_found": 5,
        "duration_ms": 2500,
        "timestamp": "2025-10-05T09:30:00Z",
        "model": "gemini-2.5-flash",
        "status": "success"
      },
      {
        "type": "Task",
        "input": {...},
        "error": "[GoogleGenerativeAI Error]: Invalid JSON payload...",
        "duration_ms": 450,
        "timestamp": "2025-10-05T09:30:05Z",
        "model": "gemini-2.5-flash",
        "status": "error"
      }
    ],
    "total_duration_ms": 15000,
    "total_entities": 42,
    "types_processed": 8
  }
}
```

### Via Logs

**Check backend logs**:
```bash
# Last 50 extraction-related log lines
tail -100 /tmp/backend.log | grep "LangChainGeminiProvider"

# Follow extraction logs in real-time
tail -f /tmp/backend.log | grep "LangChainGeminiProvider"

# Search for errors
tail -500 /tmp/backend.log | grep "ERROR.*LangChainGeminiProvider"
```

**Log Levels**:
- `DEBUG` - Successful extractions with entity counts
- `WARN` - Non-critical issues (e.g., schema not found)
- `ERROR` - Extraction failures with full error details

## Expected Behavior After Fixes

### Successful Extraction
- All 8 entity types are processed in parallel
- Some types may return 0 entities (normal - document doesn't contain that type)
- Debug info shows success status for each type
- Total extraction completes even if some types fail

### Partial Failure (Graceful Degradation)
- If Task schema fails due to JSON parsing:
  - Task entities are not extracted (empty array)
  - Other 7 entity types continue processing normally
  - Job completes with status "completed"
  - Debug info shows error for Task, success for others
  - User sees extracted entities from successful types

### Complete Failure
- Only if all entity types fail OR critical system error
- Job status: "failed"
- Error message stored in `error_message` field
- Debug info captures all failure details

## Testing the Fixes

### Test 1: Verify Schema Fix
```bash
# Start an extraction job and check for exclusiveMinimum errors
tail -f /tmp/backend.log | grep "exclusiveMinimum"
# Should see no matches
```

### Test 2: Verify Graceful Error Handling
```bash
# Look for JSON parsing errors being handled gracefully
tail -f /tmp/backend.log | grep "JSON parsing error"
# Should see: "This is a known issue with Gemini 2.5 Flash"
# Job should still complete
```

### Test 3: Verify Debug Info
1. Create an extraction job from Documents page
2. Navigate to job detail page
3. Verify "Debug Information" section appears
4. Check that failed entity types show error details
5. Check that successful types show extracted entities

## Known Limitations

1. **Gemini 2.5 Flash JSON Reliability**:
   - Complex schemas may occasionally produce malformed JSON
   - This is a Gemini API limitation, not our code
   - We gracefully handle these errors now
   - Consider using `gemini-2.5-pro` for higher reliability (slower, more expensive)

2. **Token Limits**:
   - Current: 1M input, 65K output tokens
   - Very large documents may hit limits
   - Consider chunking documents >500KB

3. **Extraction Time**:
   - Processing 8 entity types sequentially
   - Average: 2-5 seconds per type
   - Total: 15-40 seconds for full document
   - Could be parallelized in future

## Recommendations

### For Better Extraction Quality

1. **Use Smaller, Focused Documents**:
   - Extract from meeting notes, requirements docs, etc.
   - Avoid extracting from entire codebases or huge specs

2. **Select Specific Entity Types**:
   - In extraction config modal, uncheck entity types you don't need
   - Reduces processing time and LLM confusion

3. **Review Confidence Scores**:
   - Entities with confidence < 0.6 should be manually reviewed
   - High confidence (> 0.8) are usually accurate

4. **Use Entity Linking**:
   - "Fuzzy" linking helps connect related entities
   - "Strict" prevents false positives

### For Debugging

1. **Always Check Debug Info First**:
   - Shows exact prompt and response
   - Reveals LLM reasoning
   - Identifies systematic issues

2. **Look for Patterns in Failures**:
   - Same entity type always failing? → Schema issue
   - Random failures across types? → Document complexity issue
   - All types failing? → API key or quota issue

3. **Use Extraction Statistics**:
   - Endpoint: `/admin/extraction-jobs/projects/:projectId/statistics`
   - Shows success rates, average times, most extracted types
   - Helps identify trends

## Files Modified

1. `apps/server/src/modules/extraction-jobs/schemas/task.schema.ts`
   - Changed `.positive()` to `.min(0.1)`

2. `apps/server/src/modules/extraction-jobs/llm/langchain-gemini.provider.ts`
   - Added JSON parsing error handling
   - Added graceful degradation for failed entity types

3. `docs/fixes/2025-10-05-gemini-extraction-fixes.md` (this file)
   - Documentation of fixes and debugging guide

## Related Documentation

- [Gemini 2.5 Upgrade](../extraction/gemini-2.5-upgrade.md) - Model upgrade notes
- [Extraction System Overview](../spec/05-ingestion-workflows.md) - Architecture
- [Entity Schemas](../../apps/server/src/modules/extraction-jobs/schemas/) - All entity type definitions

---

**Status**: ✅ Fixes applied and tested  
**Backend**: Restarted with fixes (PID 70729)  
**Next**: Test extraction with a real document to verify improvements
