# Timeline Logging Consolidation Fix

## Problem

The extraction timeline was showing **duplicate entries** for `create_graph_object`:
1. First entry with **input data** (entity type, name, key, properties, confidence)
2. Second entry with **output data** (object ID, status, quality decision)

This created visual clutter in the UI timeline and made it harder to understand the extraction flow.

**Screenshot showing the issue:**
- Entry 4: `create_graph_object` with ⊕ icon (input)
- Entry 5: `create_graph_object` with error icon (output)

## Root Cause

In `extraction-worker.service.ts`, the object creation process had **two separate `logStep` calls**:

```typescript
// BEFORE FIX (lines 778-797):
// Log input BEFORE creating object
await this.extractionLogger.logStep({
    extractionJobId: job.id,
    stepIndex: this.stepCounter++,
    operationType: 'object_creation',
    operationName: 'create_graph_object',
    inputData: { /* entity details */ },
    metadata: { org_id, project_id },
});

const graphObject = await this.graphService.createObject({ /* ... */ });

// Then log output AFTER creating object (lines 823-842)
await this.extractionLogger.logStep({
    extractionJobId: job.id,
    stepIndex: this.stepCounter++,  // ← Different step index!
    operationType: 'object_creation',
    operationName: 'create_graph_object',
    status: 'success',
    outputData: { /* object ID, status */ },
    durationMs: Date.now() - objectCreationStartTime,
});
```

Because `stepCounter++` was called twice, these became **two separate timeline entries**.

## Solution

**Combine input and output into a single log entry** that captures both:

```typescript
// AFTER FIX:
// Track start time
const objectCreationStartTime = Date.now();

// Perform the operation
const graphObject = await this.graphService.createObject({ /* ... */ });

// Log ONCE with both input and output
await this.extractionLogger.logStep({
    extractionJobId: job.id,
    stepIndex: this.stepCounter++,  // ← Single step index
    operationType: 'object_creation',
    operationName: 'create_graph_object',
    status: 'success',
    inputData: {
        entity_type: entity.type_name,
        entity_name: entity.name,
        entity_key: objectKey,
        entity_description: entity.description,
        entity_properties: entity.properties,
        confidence: finalConfidence,
        quality_decision: qualityDecision,
    },
    outputData: {
        object_id: graphObject.id,
        entity_name: entity.name,
        entity_type: entity.type_name,
        quality_decision: qualityDecision,
        requires_review: qualityDecision === 'review',
    },
    durationMs: Date.now() - objectCreationStartTime,
    metadata: {
        org_id: job.org_id,
        project_id: job.project_id,
        confidence: finalConfidence,
    },
});
```

## Benefits

1. **Single timeline entry per operation** - cleaner UI
2. **Complete context** - both input and output in one place
3. **Accurate duration** - measures full operation time
4. **Consistent step numbering** - no gaps from duplicate logging

## Changes Made

**File:** `apps/server/src/modules/extraction-jobs/extraction-worker.service.ts`

- **Lines 775-797**: Removed first `logStep` call (input-only)
- **Lines 806-830**: Updated second `logStep` call to include both `inputData` and `outputData`
- **Comment**: Changed from "Log successful object creation" to "Log successful object creation (combined input + output)"

## Expected Timeline Display

**Before:**
```
4  12:26:41 PM  ⊕  create_graph_object  success  N/A  [dropdown]
5  12:26:41 PM  ⚠  create_graph_object  error    N/A  [dropdown]
```

**After:**
```
4  12:26:41 PM  ⊕  create_graph_object  success  42ms  [dropdown]
   Input: Person "John Doe" (key: person-john-doe-a1b2c3d4)
   Output: Created object abc-123-def
```

## Testing

1. **Run an extraction job** that creates graph objects
2. **Check the timeline** in the extraction job detail view
3. **Verify** only one `create_graph_object` entry appears per entity
4. **Expand the entry** to see both input data (entity details) and output data (object ID)

## Related Files

- `apps/server/src/modules/extraction-jobs/extraction-worker.service.ts` (line 806-830)
- `apps/server/src/modules/extraction-jobs/extraction-logger.service.ts` (logStep method)
- `apps/admin/src/pages/admin/pages/extraction-jobs/detail.tsx` (timeline rendering)

## Pattern for Future Operations

When logging timeline steps that have both input and output:

```typescript
// ✅ CORRECT: Single log entry
const startTime = Date.now();
const result = await performOperation(input);
await this.extractionLogger.logStep({
    stepIndex: this.stepCounter++,
    inputData: { /* input details */ },
    outputData: { /* result details */ },
    durationMs: Date.now() - startTime,
    status: 'success',
});

// ❌ INCORRECT: Separate input/output logs
await this.extractionLogger.logStep({ inputData });  // First entry
const result = await performOperation(input);
await this.extractionLogger.logStep({ outputData }); // Second entry
```

## Date

October 20, 2025
