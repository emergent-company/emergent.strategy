# Extraction File Logging Implementation

**Date**: 2025-01-20  
**Status**: ✅ Complete

## Overview

Implemented comprehensive file-based logging for extraction jobs. Each extraction job now generates a detailed JSON log file containing full inputs, outputs, and database operations.

## What Was Implemented

### 1. ExtractionLoggerService (`extraction-logger.service.ts`)

Created a new injectable NestJS service with the following capabilities:

- **Log Context Management**: Sets and maintains context (user ID, org ID, project ID, source type) for each extraction job
- **Step Logging**: Logs each step of the extraction process with full details
- **Specialized Logging Methods**:
  - `logStep()`: General-purpose logging with full context
  - `logDatabaseOperation()`: Logs database queries with parameters and results
  - `logLLMCall()`: Logs LLM requests with full prompts and document content

### 2. Log File Structure

- **Location**: `logs/extraction/`
- **Format**: One JSON file per extraction job: `{job_id}.json`
- **Content**: Newline-delimited JSON entries with full verbosity

### 3. Integration with ExtractionWorkerService

Modified `extraction-worker.service.ts` to:

- Set log context at job start (user ID, org ID, project ID, source info)
- Log full document content (not just previews) in LLM calls
- Clean up log context after job completion (success or failure)
- Removed duplicate logging calls that were present in the code

### 4. What Gets Logged

#### Job Lifecycle
```json
{
  "operationType": "job_lifecycle",
  "operationName": "job_started",
  "inputData": { /* full job configuration */ }
}
```

#### LLM Calls
```json
{
  "operationType": "llm_call",
  "operationName": "extract_entities",
  "inputData": {
    "prompt": "full extraction prompt",
    "document_content": "FULL document content (not truncated)",
    "schemas": { /* complete schemas */ }
  },
  "outputData": {
    "entities": [ /* all extracted entities */ ],
    "raw_response": { /* complete LLM response */ }
  },
  "tokensUsed": 5000,
  "durationMs": 3500
}
```

#### Object Creation
```json
{
  "operationType": "object_creation",
  "operationName": "create_graph_object",
  "inputData": { /* entity being created */ },
  "outputData": { /* created object details */ }
}
```

#### Database Operations
```json
{
  "operationType": "database_operation",
  "operationName": "insert_object",
  "inputData": {
    "query": "INSERT INTO...",
    "params": [...]
  },
  "outputData": {
    "rowCount": 1,
    "rows": [...]
  }
}
```

### 5. Context Enrichment

Every log entry automatically includes:
- `timestamp`: ISO 8601 timestamp
- `job_id`: Extraction job UUID
- `user_id`: User who initiated the extraction
- `organization_id`: Organization context
- `project_id`: Project context
- `source_type`: Type of source (document, manual, etc.)
- `source_id`: Source identifier

## File Changes

### New Files
- `apps/server/src/modules/extraction-jobs/extraction-logger.service.ts` - Core logging service
- `logs/extraction/` - Log directory (added to .gitignore)
- `logs/extraction/README.md` - Documentation for log format and usage

### Modified Files
- `apps/server/src/modules/extraction-jobs/extraction-worker.service.ts`:
  - Added log context management
  - Updated LLM logging to include full content
  - Removed duplicate log calls
  - Added context cleanup

## Benefits

1. **Complete Audit Trail**: Every extraction is fully logged with inputs and outputs
2. **Debugging**: Full LLM prompts and responses for troubleshooting
3. **Compliance**: Complete record of what was extracted and when
4. **Analysis**: Can analyze extraction patterns, success rates, token usage
5. **Verbose by Design**: Nothing is truncated - everything is logged

## Usage Example

```bash
# View a specific extraction job log
cat logs/extraction/123e4567-e89b-12d3-a456-426614174000.json | jq '.'

# Extract just the LLM call
cat logs/extraction/123e4567-e89b-12d3-a456-426614174000.json | \
  jq 'select(.operationType == "llm_call")'

# See what entities were created
cat logs/extraction/123e4567-e89b-12d3-a456-426614174000.json | \
  jq 'select(.operationType == "object_creation") | .outputData'
```

## Future Enhancements

Potential improvements for future iterations:

1. **Log Rotation**: Automatic archival and compression of old logs
2. **Retention Policy**: Configurable log retention periods
3. **Query Interface**: API endpoint to query logs
4. **Log Analysis**: Automated analysis of extraction patterns
5. **Streaming**: Real-time log streaming for monitoring

## Security Considerations

⚠️ **Important**: Log files contain sensitive information:
- Full document content
- User and organization identifiers
- Potentially confidential business data

Ensure appropriate:
- File system permissions (logs directory should be restricted)
- Backup encryption (if logs are backed up)
- Access controls (only authorized personnel)
- Retention policies (don't keep logs longer than necessary)

## Testing

To test the logging:

1. Run an extraction job through the API
2. Check `logs/extraction/{job_id}.json` for the detailed log
3. Verify all steps are logged with full content
4. Confirm context (user ID, org ID) is present in all entries

## Module Integration

The `ExtractionLoggerService` is:
- Registered in `extraction-job.module.ts`
- Injected into `ExtractionWorkerService`
- Available for use in any extraction-related service

No additional configuration required - logging is enabled by default.
