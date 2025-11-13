# Detailed Extraction Logging Implementation

**Date**: 2025-10-19  
**Goal**: Provide detailed, inspectable logs of extraction operations in the UI

## What's Been Implemented ✅

### 1. Database Schema (COMPLETED)
- **Table**: `kb.object_extraction_logs`
- **Migration**: `20251019_add_extraction_logs.sql` (applied successfully)
- **Columns**:
  - `id` (uuid, primary key)
  - `extraction_job_id` (uuid, references kb.object_extraction_jobs)
  - `logged_at` (timestamptz) - when the step occurred
  - `step_index` (integer) - order within the job
  - `operation_type` (text) - type of operation (llm_call, chunk_processing, etc.)
  - `operation_name` (text) - specific operation name
  - `status` (text) - success/error/warning
  - `input_data` (jsonb) - prompt, chunk text, entity data
  - `output_data` (jsonb) - LLM response, created IDs
  - `error_message` (text)
  - `error_stack` (text)
  - `duration_ms` (integer) - step duration
  - `tokens_used` (integer) - LLM token usage
  - `metadata` (jsonb) - additional context

- **Indexes**: job_id, job_step, operation type, errors

### 2. Extraction Logger Service (COMPLETED)
- **File**: `apps/server/src/modules/extraction-jobs/extraction-logger.service.ts`
- **Methods**:
  - `logStep(params)` - Log a single extraction step
  - `getJobLogs(jobId)` - Get all logs for a job
  - `getLogsByType(jobId, type)` - Filter by operation type
  - `getErrorLogs(jobId)` - Get only errors
  - `getLogSummary(jobId)` - Get statistics summary
  - `deleteJobLogs(jobId)` - Cleanup

### 3. API Endpoint (COMPLETED)
- **Route**: `GET /admin/extraction-jobs/:jobId/logs`
- **Authentication**: Bearer token required
- **Scope**: `extraction:read`
- **Response**: 
  ```json
  {
    "logs": [
      {
        "id": "uuid",
        "logged_at": "2025-10-19T...",
        "step_index": 1,
        "operation_type": "llm_call",
        "operation_name": "extract_entities",
        "status": "success",
        "input_data": { "prompt": "...", "chunk": "..." },
        "output_data": { "entities": [...], "response": "..." },
        "duration_ms": 1234,
        "tokens_used": 567,
        "metadata": { "model": "gemini-1.5-flash" }
      }
    ],
    "summary": {
      "totalSteps": 10,
      "successSteps": 9,
      "errorSteps": 1,
      "totalDurationMs": 15000,
      "totalTokensUsed": 5000,
      "operationCounts": {
        "llm_call": 3,
        "object_creation": 5,
        "relationship_creation": 2
      }
    }
  }
  ```

### 4. Module Configuration (COMPLETED)
- Added `ExtractionLoggerService` to `ExtractionJobModule`
- Exported for use in other modules
- Injected into `ExtractionJobController` and `ExtractionWorkerService`

## What Needs To Be Done 🚧

### 5. Worker Integration (IN PROGRESS)
**File**: `apps/server/src/modules/extraction-jobs/extraction-worker.service.ts`

**Need to add logging calls at key points**:

```typescript
// In processJob method, add step counter reset
this.stepCounter = 0;

// Before LLM call (around line 442)
const llmStartTime = Date.now();
await this.extractionLogger.logStep({
    extractionJobId: job.id,
    stepIndex: this.stepCounter++,
    operationType: 'llm_call',
    operationName: 'extract_entities',
    inputData: {
        prompt: extractionPrompt,
        chunk_preview: documentContent.substring(0, 500),
        chunk_length: documentContent.length,
        allowed_types: allowedTypes,
    },
    metadata: {
        provider: providerName,
        model: llmProvider.getModelName?.() || 'unknown',
    },
});

// After LLM call (after line 450)
await this.extractionLogger.logStep({
    extractionJobId: job.id,
    stepIndex: this.stepCounter++,
    operationType: 'llm_call',
    operationName: 'extract_entities',
    status: 'success',
    outputData: {
        entities_count: result.entities.length,
        discovered_types: result.discovered_types,
        raw_response: result.raw_response, // Full LLM response
    },
    durationMs: Date.now() - llmStartTime,
    tokensUsed: result.raw_response?.usage?.total_tokens,
    metadata: {
        provider: providerName,
    },
});

// In object creation loop (around line 500+)
for (const entity of result.entities) {
    const objStartTime = Date.now();
    
    try {
        // Log input
        await this.extractionLogger.logStep({
            extractionJobId: job.id,
            stepIndex: this.stepCounter++,
            operationType: 'object_creation',
            operationName: 'create_graph_object',
            inputData: {
                entity_type: entity.type_name,
                entity_name: entity.name,
                entity_data: entity,
            },
        });
        
        // Actual object creation
        const createdId = await this.graphService.createObject(...);
        
        // Log success
        await this.extractionLogger.logStep({
            extractionJobId: job.id,
            stepIndex: this.stepCounter++,
            operationType: 'object_creation',
            operationName: 'create_graph_object',
            status: 'success',
            outputData: {
                object_id: createdId,
                entity_name: entity.name,
            },
            durationMs: Date.now() - objStartTime,
        });
    } catch (error) {
        // Log error
        await this.extractionLogger.logStep({
            extractionJobId: job.id,
            stepIndex: this.stepCounter++,
            operationType: 'error',
            operationName: 'create_graph_object',
            status: 'error',
            errorMessage: error.message,
            errorStack: error.stack,
            durationMs: Date.now() - objStartTime,
            metadata: {
                entity_name: entity.name,
                entity_type: entity.type_name,
            },
        });
    }
}

// Similar for relationships and suggestions
```

### 6. Frontend UI (TODO)

**File**: `apps/admin/src/pages/admin/pages/extraction-jobs/detail.tsx`

**Add logs button and modal**:

```tsx
// Add state for logs modal
const [showLogsModal, setShowLogsModal] = useState(false);
const [logs, setLogs] = useState<any[]>([]);
const [logsSummary, setLogsSummary] = useState<any>(null);

// Fetch logs function
const fetchLogs = async () => {
    try {
        const response = await fetchJson(`${apiBase}/api/admin/extraction-jobs/${jobId}/logs`, {
            headers: buildHeaders(),
        });
        setLogs(response.logs);
        setLogsSummary(response.summary);
        setShowLogsModal(true);
    } catch (error) {
        console.error('Failed to fetch logs:', error);
    }
};

// Add button to timeline steps
<button 
    className="btn btn-xs btn-ghost"
    onClick={() => fetchLogs()}
>
    <span className="iconify lucide--file-text"></span>
    View Detailed Logs
</button>

// Add modal component
{showLogsModal && (
    <dialog open className="modal">
        <div className="modal-box max-w-6xl">
            <h3 className="font-bold text-lg mb-4">Extraction Logs</h3>
            
            {/* Summary Stats */}
            <div className="stats stats-horizontal shadow mb-4">
                <div className="stat">
                    <div className="stat-title">Total Steps</div>
                    <div className="stat-value text-primary">{logsSummary.totalSteps}</div>
                </div>
                <div className="stat">
                    <div className="stat-title">Success</div>
                    <div className="stat-value text-success">{logsSummary.successSteps}</div>
                </div>
                <div className="stat">
                    <div className="stat-title">Errors</div>
                    <div className="stat-value text-error">{logsSummary.errorSteps}</div>
                </div>
                <div className="stat">
                    <div className="stat-title">Duration</div>
                    <div className="stat-value text-sm">{logsSummary.totalDurationMs}ms</div>
                </div>
                <div className="stat">
                    <div className="stat-title">Tokens</div>
                    <div className="stat-value text-sm">{logsSummary.totalTokensUsed}</div>
                </div>
            </div>
            
            {/* Logs Table */}
            <div className="overflow-x-auto">
                <table className="table table-xs">
                    <thead>
                        <tr>
                            <th>Step</th>
                            <th>Time</th>
                            <th>Operation</th>
                            <th>Status</th>
                            <th>Duration</th>
                            <th>Details</th>
                        </tr>
                    </thead>
                    <tbody>
                        {logs.map((log) => (
                            <tr key={log.id}>
                                <td>{log.step_index}</td>
                                <td className="text-xs">{new Date(log.logged_at).toLocaleTimeString()}</td>
                                <td>
                                    <div className="flex flex-col">
                                        <span className="badge badge-sm">{log.operation_type}</span>
                                        {log.operation_name && (
                                            <span className="text-xs opacity-70">{log.operation_name}</span>
                                        )}
                                    </div>
                                </td>
                                <td>
                                    <span className={`badge badge-sm ${
                                        log.status === 'success' ? 'badge-success' :
                                        log.status === 'error' ? 'badge-error' :
                                        'badge-warning'
                                    }`}>
                                        {log.status}
                                    </span>
                                </td>
                                <td>{log.duration_ms}ms</td>
                                <td>
                                    <button 
                                        className="btn btn-xs btn-ghost"
                                        onClick={() => {
                                            // Show detail modal with input/output
                                            console.log('Input:', log.input_data);
                                            console.log('Output:', log.output_data);
                                        }}
                                    >
                                        View
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            
            <div className="modal-action">
                <button className="btn" onClick={() => setShowLogsModal(false)}>Close</button>
            </div>
        </div>
        <form method="dialog" className="modal-backdrop">
            <button onClick={() => setShowLogsModal(false)}>close</button>
        </form>
    </dialog>
)}
```

**Add detail modal for individual log entries**:
```tsx
// Expandable rows or separate modal showing:
// - Full input_data (prompt, chunk text)
// - Full output_data (LLM response, created IDs)
// - Error stack if present
// - All metadata fields
// - Formatted as JSON with syntax highlighting
```

## Testing Plan

1. **Create extraction job** with detailed logging enabled
2. **Run extraction** and verify logs are created
3. **Check database** for log entries:
   ```sql
   SELECT * FROM kb.object_extraction_logs WHERE extraction_job_id = 'xxx' ORDER BY step_index;
   ```
4. **Test API endpoint**:
   ```bash
   curl -H "Authorization: Bearer xxx" \
        -H "X-Org-ID: xxx" \
        -H "X-Project-ID: xxx" \
        http://localhost:3001/admin/extraction-jobs/:jobId/logs
   ```
5. **Test frontend modal** - click on extraction job, view logs
6. **Verify performance** - logging shouldn't significantly slow extraction

## Benefits

✅ **Full visibility**: See exactly what prompt was sent to LLM  
✅ **Debug LLM responses**: Inspect raw responses and parsed entities  
✅ **Performance metrics**: Track duration and token usage per step  
✅ **Error tracking**: See exactly where and why extraction failed  
✅ **Audit trail**: Complete history of extraction operations  
✅ **UI inspection**: Users can debug their own extractions without backend access

## Next Steps

1. Complete worker integration (add logging calls to all key operations)
2. Build frontend modal component
3. Add syntax highlighting for JSON data
4. Add filtering/search in logs view
5. Add export logs as JSON feature
6. Test with real extraction jobs

## Related Files

- **Database**: `apps/server/migrations/20251019_add_extraction_logs.sql`
- **Service**: `apps/server/src/modules/extraction-jobs/extraction-logger.service.ts`
- **Controller**: `apps/server/src/modules/extraction-jobs/extraction-job.controller.ts` (logs endpoint)
- **Worker**: `apps/server/src/modules/extraction-jobs/extraction-worker.service.ts` (needs integration)
- **Frontend**: `apps/admin/src/pages/admin/pages/extraction-jobs/detail.tsx` (needs UI)
