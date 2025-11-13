# ClickUp Extraction Config Bug - Emergency Fix

**Date:** October 21, 2025  
**Status:** ✅ EMERGENCY STOPPED - Awaiting Permanent Fix

## Problem Summary

The ClickUp document import was creating extraction jobs with **empty `extraction_config: {}`** objects, which would cause the extraction worker to fail when processing them.

### Root Cause

In `clickup-import.service.ts`, the `storeDocument()` method was creating extraction jobs like this:

```typescript
const extractionJob = await this.extractionJobService.createJob({
    organization_id: orgId,
    project_id: projectId,
    source_type: ExtractionSourceType.DOCUMENT,
    source_id: documentId,
    source_metadata: { /* ... */ },
    extraction_config: {}, // ← EMPTY! Missing entity_types, confidence_threshold, etc.
});
```

This created jobs that would fail when the extraction worker tried to process them, because:
- No `entity_types` specified (worker doesn't know what to extract)
- No `confidence_threshold` (worker can't score entities)
- No `entity_linking_strategy` (worker doesn't know how to handle duplicates)

## Impact

- **Total broken jobs created:** 630+ extraction jobs
- **Time period:** October 21, 2025, 21:43 - 21:48 UTC (5 minutes)
- **Status when discovered:** All pending, none processed yet
- **ClickUp sync status:** Running (importing all documents from all spaces, not just selected ones)

## Emergency Actions Taken

### 1. Cancelled All Bad Extraction Jobs

Used direct database access to bulk cancel jobs:

```sql
UPDATE kb.object_extraction_jobs 
SET status='cancelled', 
    error_message='Cancelled - empty extraction_config detected', 
    updated_at=NOW() 
WHERE status IN ('pending', 'running') 
AND extraction_config='{}'::jsonb;
```

**Result:** 630 jobs cancelled successfully

### 2. Stopped Running ClickUp Sync

```sql
UPDATE kb.clickup_sync_state 
SET import_status='cancelled', 
    last_error='Cancelled by user - fixing extraction config bug', 
    updated_at=NOW() 
WHERE import_status='running';
```

**Result:** 1 sync stopped

### 3. Final Job Status After Cleanup

| Status | Count |
|--------|-------|
| cancelled | 630 |
| requires_review | 51 |
| failed | 24 |
| completed | 18 |
| pending | 0 (all bad ones cancelled) |

## Remaining Issues

### Priority 1: Fix Extraction Config Bug

**Location:** `apps/server/src/modules/clickup/clickup-import.service.ts` (lines ~975-1000)

**Current Code:**
```typescript
extraction_config: {} // ← WRONG
```

**Need to determine:**
1. Where should the config come from?
   - Option A: Project default extraction settings
   - Option B: Template pack compiled types
   - Option C: Hard-coded defaults for ClickUp imports

**Suggested Fix:**
```typescript
// Option C: Hard-coded defaults (simplest)
extraction_config: {
    entity_types: ['Task', 'Person', 'Document', 'Project'],
    confidence_threshold: 0.7,
    entity_linking_strategy: 'fuzzy',
    duplicate_strategy: 'skip',
    require_review: false,
}

// OR Option B: Use template pack types (like manual extraction does)
const compiledTypes = await this.typeRegistry.getCompiledTypes(projectId, orgId);
extraction_config: {
    entity_types: compiledTypes.map(t => t.name),
    confidence_threshold: 0.7,
    entity_linking_strategy: 'fuzzy',
    duplicate_strategy: 'skip',
    require_review: false,
}
```

### Priority 2: Fix Space Filtering

**Location:** `apps/server/src/modules/clickup/clickup-import.service.ts` (lines ~650-675)

**Current State:** Debug mode - accepting ALL documents from ALL spaces

```typescript
// TEMPORARY DEBUG MODE - accepts everything
const filteredDocs = docs.filter(doc => { return true; });
```

**Original broken filter:**
```typescript
const filteredDocs = docs.filter(doc => 
    doc.parent.type === 6 && selectedSpaceIds.includes(doc.parent.id)
);
```

**Need:**
1. Check debug logs for `Sample doc parents` output
2. Understand ClickUp parent structure (doc → list → folder → space)
3. Implement proper filtering based on actual hierarchy

### Priority 3: Enhanced UI (After Emergencies Fixed)

- Show current document being processed (not just spinner)
- Add ClickUp link component with icon instead of full URL
- Add bulk cancel UI button for extraction jobs

## Next Steps

**⚠️ MAJOR REFACTOR PLANNED - See `docs/CLICKUP_IMPORT_REFACTOR_PLAN.md`**

The user identified two fundamental issues with the current approach:
1. **Too many documents**: Each ClickUp page creates a separate document (should combine into one)
2. **Auto-extraction not wanted**: System shouldn't create extraction jobs automatically (user wants manual control)

**Immediate actions superseded by refactor plan:**
1. ~~Review debug logs~~ → Not needed, filtering will be removed
2. ~~Implement proper extraction_config~~ → **REMOVE extraction job creation entirely**
3. ~~Fix space filtering~~ → Will be part of refactor
4. **Implement refactor plan** in `docs/CLICKUP_IMPORT_REFACTOR_PLAN.md`
5. **Add validation** to prevent empty extraction_config in the future (still valid)

## Prevention Measures

### Validation Rule to Add

Add to `ExtractionJobService.createJob()`:

```typescript
// Validate extraction_config is not empty
if (!config.extraction_config || Object.keys(config.extraction_config).length === 0) {
    throw new BadRequestException(
        'extraction_config cannot be empty. Must include entity_types, confidence_threshold, etc.'
    );
}
```

### Test Cases to Add

```typescript
describe('ClickUp Import', () => {
    it('should create extraction jobs with valid config', async () => {
        const job = await service.storeDocument(...);
        
        expect(job.extraction_config).toBeDefined();
        expect(job.extraction_config.entity_types).toBeDefined();
        expect(job.extraction_config.entity_types.length).toBeGreaterThan(0);
        expect(job.extraction_config.confidence_threshold).toBeGreaterThan(0);
    });
});
```

## Related Files

- `apps/server/src/modules/clickup/clickup-import.service.ts` (BUG LOCATION)
- `apps/server/src/modules/extraction-jobs/extraction-job.service.ts` (needs validation)
- `apps/server/src/modules/extraction-jobs/extraction-worker.service.ts` (would have failed on these jobs)

## Database Schema Reference

**kb.object_extraction_jobs.extraction_config** should look like:

```json
{
    "entity_types": ["Task", "Person", "Document"],
    "confidence_threshold": 0.7,
    "entity_linking_strategy": "fuzzy",
    "duplicate_strategy": "skip",
    "require_review": false
}
```

**NOT:**

```json
{}
```
