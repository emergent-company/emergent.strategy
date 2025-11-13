# LLM Call Monitoring Integration - Complete ✅

**Date**: 2025-10-22  
**Feature**: Automatic LLM API call tracking with token usage and cost calculation  
**Status**: Fully Integrated

## Overview

The VertexAIProvider now automatically logs every LLM API call to the monitoring system, tracking:
- Request/response payloads
- Token usage (input, output, total)
- Cost in USD (auto-calculated)
- Duration in milliseconds
- Success/error status

This provides complete visibility into LLM usage and costs for extraction jobs.

## Implementation Details

### Files Modified

1. **`vertex-ai.provider.ts`** - Added monitoring to LLM calls
   - Injected `MonitoringLoggerService` in constructor
   - Added `context` parameter to `extractEntities()` method
   - Wrapped `generateContent()` calls with monitoring in `extractEntitiesForType()`
   - Track 3 states: pending (start), success (complete), error (complete)

2. **`llm-provider.interface.ts`** - Updated interface
   - Added optional `context?: { jobId: string; projectId: string }` parameter
   - Allows any LLM provider to support monitoring

3. **`extraction-worker.service.ts`** - Pass job context
   - Modified call to `extractEntities()` to include job context
   - Enables linking LLM calls to specific extraction jobs

## How It Works

### 1. Job Context Flow

```typescript
// ExtractionWorkerService passes context to LLM provider
const result = await llmProvider.extractEntities(
    documentContent,
    extractionPrompt,
    objectSchemas,
    allowedTypes,
    availableTags,
    {
        jobId: job.id,           // Link to extraction job
        projectId: job.project_id // For RLS filtering
    }
);
```

### 2. LLM Call Monitoring Flow

```typescript
// VertexAIProvider monitors each generateContent() call

// BEFORE LLM call
const callId = await this.monitoringLogger.startLLMCall({
    processId: context.jobId,
    processType: 'extraction_job',
    modelName: 'gemini-1.5-pro',
    status: 'pending',
    requestPayload: {
        type: 'Location',
        prompt_length: 5000,
        document_length: 10000,
        available_tags: ['country', 'city']
    },
    projectId: context.projectId,
});

try {
    // MAKE LLM CALL
    const result = await generativeModel.generateContent({...});
    
    // AFTER successful response
    await this.monitoringLogger.completeLLMCall({
        id: callId,
        responsePayload: {
            entities_count: 5,
            response_length: 2000,
            type: 'Location'
        },
        status: 'success',
        inputTokens: 1234,
        outputTokens: 456,
        durationMs: 2500,
    });
    // Cost auto-calculated: $1.25 per 1M input + $5.00 per 1M output
    
} catch (error) {
    // ON ERROR
    await this.monitoringLogger.completeLLMCall({
        id: callId,
        status: 'error',
        errorMessage: error.message,
        durationMs: 1500,
    });
    throw error;
}
```

### 3. Database Storage

All LLM calls are stored in `kb.llm_call_logs` with:
- `process_id` = extraction job ID (for querying by job)
- `process_type` = 'extraction_job'
- `model_name` = 'gemini-1.5-pro' or 'gemini-1.5-flash'
- `status` = 'pending' → 'success' or 'error'
- `input_tokens`, `output_tokens` (from Vertex AI response)
- `cost_usd` = auto-calculated using pricing config
- `duration_ms` = measured execution time
- `started_at`, `completed_at` timestamps
- `project_id` = for RLS filtering

### 4. Cost Calculation

Costs are calculated automatically in `MonitoringLoggerService.completeLLMCall()`:

```typescript
// From llm-pricing.config.ts
const pricing = {
    'gemini-1.5-pro': {
        inputCostPer1M: 1.25,
        outputCostPer1M: 5.00
    },
    'gemini-1.5-flash': {
        inputCostPer1M: 0.075,
        outputCostPer1M: 0.30
    }
};

// Example calculation
// Input: 10,000 tokens, Output: 2,000 tokens, Model: gemini-1.5-pro
const inputCost = (10000 / 1000000) * 1.25 = $0.0125
const outputCost = (2000 / 1000000) * 5.00 = $0.0100
const totalCost = $0.0225
```

## Error Handling

The monitoring system is designed to be non-blocking:

```typescript
try {
    callId = await this.monitoringLogger.startLLMCall({...});
} catch (error) {
    this.logger.warn('Failed to start LLM call monitoring', error);
    // Continue with LLM call even if monitoring fails
}
```

If monitoring fails:
- LLM call still executes normally
- Warning is logged but doesn't break extraction
- Ensures monitoring issues don't impact core functionality

## Query Examples

### Get all LLM calls for a job

```sql
SELECT 
    model_name,
    status,
    input_tokens,
    output_tokens,
    cost_usd,
    duration_ms,
    started_at,
    completed_at
FROM kb.llm_call_logs
WHERE process_id = '<job-id>'
    AND process_type = 'extraction_job'
ORDER BY started_at;
```

### Total cost by model for a project

```sql
SELECT 
    model_name,
    COUNT(*) as call_count,
    SUM(input_tokens) as total_input_tokens,
    SUM(output_tokens) as total_output_tokens,
    SUM(cost_usd) as total_cost_usd,
    AVG(duration_ms) as avg_duration_ms
FROM kb.llm_call_logs
WHERE project_id = '<project-id>'
    AND status = 'success'
GROUP BY model_name
ORDER BY total_cost_usd DESC;
```

### Failed LLM calls (for debugging)

```sql
SELECT 
    process_id,
    model_name,
    error_message,
    request_payload,
    started_at,
    duration_ms
FROM kb.llm_call_logs
WHERE status = 'error'
    AND project_id = '<project-id>'
ORDER BY started_at DESC
LIMIT 20;
```

## API Access

Use the monitoring API endpoints to query LLM call data:

```bash
# Get LLM calls for a specific job
curl -H "X-Project-ID: <uuid>" \
     -H "Authorization: Bearer <token>" \
     http://localhost:3001/monitoring/extraction-jobs/<job-id>/llm-calls

# Response includes:
{
    "llm_calls": [
        {
            "id": "...",
            "model_name": "gemini-1.5-pro",
            "status": "success",
            "input_tokens": 1234,
            "output_tokens": 456,
            "cost_usd": 0.0225,
            "duration_ms": 2500,
            "started_at": "2025-10-22T20:00:00Z",
            "completed_at": "2025-10-22T20:00:02Z",
            "request_payload": {...},
            "response_payload": {...}
        }
    ]
}
```

## Testing

To verify LLM monitoring is working:

1. **Start the server**:
   ```bash
   npm run workspace:start
   ```

2. **Trigger an extraction job** via UI or API

3. **Query the database**:
   ```sql
   SELECT COUNT(*) FROM kb.llm_call_logs;
   ```
   Should show records for LLM calls made

4. **Check cost calculation**:
   ```sql
   SELECT 
       model_name,
       input_tokens,
       output_tokens,
       cost_usd,
       -- Verify calculation
       (input_tokens::numeric / 1000000) * 1.25 + 
       (output_tokens::numeric / 1000000) * 5.00 as expected_cost
   FROM kb.llm_call_logs
   WHERE model_name = 'gemini-1.5-pro'
   LIMIT 1;
   ```
   `cost_usd` should match `expected_cost`

5. **Test API endpoint**:
   ```bash
   curl -H "X-Project-ID: <uuid>" \
        -H "Authorization: Bearer <token>" \
        http://localhost:3001/monitoring/extraction-jobs
   ```

## Benefits

### 1. Cost Tracking
- See exact cost per extraction job
- Track spend by model (pro vs flash)
- Identify expensive jobs for optimization

### 2. Performance Monitoring
- Track LLM response times
- Identify slow calls
- Optimize chunking strategy

### 3. Error Analysis
- See which calls are failing
- Understand error patterns
- Improve prompt engineering

### 4. Usage Analytics
- Total tokens consumed
- Model distribution (pro vs flash)
- Peak usage times

### 5. Budget Management
- Set alerts on cost thresholds
- Project monthly spend
- Optimize model selection

## Configuration

### Update Pricing (Monthly)

Edit `apps/server/src/modules/monitoring/config/llm-pricing.config.ts`:

```typescript
export const LLM_PRICING = {
    'gemini-1.5-pro': {
        inputCostPer1M: 1.25,    // Update these
        outputCostPer1M: 5.00,   // from Google Cloud pricing
    },
    'gemini-1.5-flash': {
        inputCostPer1M: 0.075,   // Update these
        outputCostPer1M: 0.30,   // from Google Cloud pricing
    },
} as const;
```

No migration needed - costs are recalculated on read.

### Add New Models

1. Add pricing to `llm-pricing.config.ts`
2. Model name must match what's returned by LLM provider
3. Existing logs will show `null` cost if model not in config

## Next Steps

1. **Test in Production**
   - Run extraction jobs
   - Verify logs appear in database
   - Check cost calculations are accurate

2. **Build Frontend Dashboard**
   - Cost charts (total, by model, over time)
   - LLM call timeline
   - Token usage metrics
   - Error rate tracking

3. **Add Alerts** (Future)
   - Cost threshold exceeded
   - High error rate
   - Slow response times

4. **Analytics** (Future)
   - Monthly cost reports
   - Model performance comparison
   - Optimization recommendations

## Related Files

- `apps/server/src/modules/extraction-jobs/llm/vertex-ai.provider.ts` - LLM provider with monitoring
- `apps/server/src/modules/monitoring/monitoring-logger.service.ts` - Logging service
- `apps/server/src/modules/monitoring/config/llm-pricing.config.ts` - Pricing configuration
- `apps/server/migrations/20251022_monitoring_phase1.sql` - Database schema

## References

- **Status**: `docs/MONITORING_PHASE1_STATUS.md`
- **Backend Guide**: `docs/MONITORING_PHASE1_BACKEND_INTEGRATION_COMPLETE.md`
- **Plan**: `docs/SUPERADMIN_DASHBOARD_PLAN.md`

---

**Status**: ✅ LLM monitoring fully integrated and ready for production testing
