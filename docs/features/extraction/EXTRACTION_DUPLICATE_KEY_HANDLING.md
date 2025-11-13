# Extraction Duplicate Key Handling

## Problem

When extracting entities, the system would **fail with `object_key_exists` error** if it tried to create a graph object with a key that already exists in the database.

**Error Stack Trace:**
```
BadRequestException: object_key_exists
    at /Users/mcj/code/spec-server/apps/server/src/modules/graph/graph.service.ts:271:31
    at ExtractionWorkerService.processJob (/Users/mcj/code/spec-server/apps/server/src/modules/extraction-jobs/extraction-worker.service.ts:799:45)
```

This happened because:
1. **Entity extraction** generates a `business_key` or uses `generateKeyFromName()` to create a unique key
2. **Graph object creation** checks if the key already exists (to maintain uniqueness)
3. **If duplicate key found** → throws `BadRequestException('object_key_exists')`
4. **Extraction job fails** → entire entity processing stops

## Root Cause

The extraction worker didn't handle duplicate keys gracefully. It assumed every extracted entity would be new, but in reality:

- **Multiple extractions** from different documents might reference the same entity (e.g., "John Doe" appears in multiple meeting notes)
- **Re-running extraction** on the same document would try to re-create existing entities
- **LLM variations** might generate different `business_key` values for the same entity, causing key collisions

## Solution

Implemented a **deduplication strategy system** that gracefully handles duplicate keys:

### 1. Duplicate Detection

Wrapped object creation in a try-catch block to detect `object_key_exists` errors:

```typescript
try {
    const graphObject = await this.graphService.createObject({
        key: objectKey,
        // ... other properties
    });
    outcome = 'created';
} catch (createError) {
    const err = createError instanceof Error ? createError : new Error(String(createError));
    
    if (err.message === 'object_key_exists') {
        // Handle duplicate gracefully
    } else {
        throw createError; // Re-throw non-duplicate errors
    }
}
```

### 2. Deduplication Strategies

The system reads a `duplicate_strategy` from the extraction job configuration:

```typescript
const duplicateStrategy = job.extraction_config?.duplicate_strategy || 'skip';
```

**Supported Strategies:**

| Strategy | Behavior | Status |
|----------|----------|--------|
| `skip` | Don't create the duplicate object, continue processing | ✅ Implemented |
| `merge` | Update the existing object with new properties from the extracted entity | 🚧 TODO |
| `error` | Throw an error and fail the extraction (original behavior) | 🚧 TODO |

### 3. Skip Strategy (Default)

When a duplicate key is detected and strategy is `skip`:

1. **Log a warning** in the timeline with details
2. **Increment skipped count** in outcome tracking
3. **Continue processing** other entities without failing

```typescript
await this.extractionLogger.logStep({
    extractionJobId: job.id,
    stepIndex: this.stepCounter++,
    operationType: 'object_creation',
    operationName: 'create_graph_object',
    status: 'warning',  // Warning status (not error)
    inputData: {
        entity_type: entity.type_name,
        entity_name: entity.name,
        entity_key: objectKey,
    },
    outputData: {
        action: 'skipped',
        reason: 'duplicate_key',
        duplicate_strategy: duplicateStrategy,
    },
    durationMs: Date.now() - objectCreationStartTime,
});

outcome = 'skipped';  // Track as skipped, not failed
```

### 4. Merge Strategy (Future)

The merge strategy will:
1. Find the existing object by key
2. Merge new properties from extracted entity into existing object
3. Update confidence scores if new extraction has higher confidence
4. Preserve existing relationships
5. Log the merge operation

```typescript
// TODO: Implement
if (duplicateStrategy === 'merge') {
    const existingObject = await this.graphService.findObjectByKey(objectKey);
    const updatedObject = await this.graphService.updateObject(existingObject.id, {
        properties: {
            ...existingObject.properties,
            ...entity.properties,  // Merge new properties
            _extraction_confidence: Math.max(
                existingObject.properties._extraction_confidence,
                finalConfidence
            ),
        },
    });
    outcome = 'merged';
}
```

## Configuration

To set the duplicate strategy for an extraction job:

```typescript
// In extraction job creation
const job = await extractionJobService.create({
    // ... other fields
    extraction_config: {
        duplicate_strategy: 'skip',  // or 'merge' (future)
    },
});
```

**Default:** If not specified, defaults to `'skip'`

## Timeline Logging

When a duplicate is skipped, the timeline shows:

**Entry:**
```
⚠ create_graph_object | warning | 15ms
  Input: Person "John Doe" (key: person-john-doe-a1b2c3d4)
  Output: 
    - action: skipped
    - reason: duplicate_key
    - duplicate_strategy: skip
```

This clearly shows:
- ✅ **Warning icon** (⚠) instead of error
- ✅ **Reason for skipping** (duplicate_key)
- ✅ **Strategy applied** (skip)
- ✅ **Original entity details** preserved in input

## Benefits

1. **No more failed extractions** due to duplicate keys
2. **Clear logging** shows which entities were skipped and why
3. **Flexible strategies** allow different deduplication behaviors
4. **Graceful degradation** - extraction continues even if some entities are duplicates
5. **Outcome tracking** properly counts skipped vs created vs merged

## Outcome Counting

The extraction summary now correctly tracks:

```typescript
{
    created: 45,    // New objects created
    merged: 0,      // Objects merged with existing (future)
    skipped: 5,     // Objects skipped due to duplicate keys
    rejected: 2,    // Objects rejected due to low confidence
    failed: 1       // Objects that errored for other reasons
}
```

## Example Scenario

**Document:** "Meeting notes mentioning John Doe and Jane Smith"

**First Extraction:**
- Creates `Person: John Doe` (key: `person-john-doe-a1b2c3d4`)
- Creates `Person: Jane Smith` (key: `person-jane-smith-x9y8z7`)
- Result: 2 created, 0 skipped

**Second Extraction (same document):**
- Tries to create `Person: John Doe` → duplicate key detected → skipped
- Tries to create `Person: Jane Smith` → duplicate key detected → skipped
- Result: 0 created, 2 skipped

**Timeline shows:**
```
⚠ create_graph_object | warning | action: skipped, reason: duplicate_key
⚠ create_graph_object | warning | action: skipped, reason: duplicate_key
```

## Future Enhancements

### Merge Strategy Implementation

When `duplicate_strategy: 'merge'` is set:

1. **Find existing object** by key
2. **Compare confidence scores**:
   - If new entity has higher confidence → update with new data
   - If existing has higher confidence → keep existing, maybe update metadata
3. **Merge properties**:
   - New properties added
   - Existing properties preserved unless new confidence is higher
   - Array properties concatenated and deduplicated
4. **Update extraction metadata**:
   - Track all extraction jobs that contributed to this object
   - Store confidence history
5. **Log merge details** in timeline

### Smart Key Generation

- Use **content-based hashing** for more stable keys
- Implement **fuzzy matching** to detect similar entities with different keys
- Add **key normalization** rules per entity type

### Deduplication Metrics

Add to job summary:
```typescript
{
    deduplication: {
        duplicates_detected: 5,
        strategy_applied: 'skip',
        time_saved: '450ms',  // Time saved by not creating duplicates
    }
}
```

## Related Files

- `apps/server/src/modules/extraction-jobs/extraction-worker.service.ts` (lines 777-920)
- `apps/server/src/modules/graph/graph.service.ts` (line 271 - throws `object_key_exists`)
- `apps/server/src/modules/extraction-jobs/extraction-logger.service.ts` (logging)

## Testing

To test duplicate key handling:

1. **Create an extraction job** that processes a document
2. **Wait for completion** and note the created objects
3. **Re-run extraction** on the same document
4. **Check timeline** - should show warning entries for skipped duplicates
5. **Verify outcome counts** - skipped count should match duplicate entities

Expected logs:
```
[DEBUG] Duplicate key detected for Person "John Doe" (key: person-john-doe-a1b2c3d4). Strategy: skip
[DEBUG] Skipped duplicate object: Person - John Doe (key: person-john-doe-a1b2c3d4)
```

## Date

October 20, 2025
