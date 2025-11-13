# Status Column INSERT Fix

## Issue
After adding the status column to the UI, newly extracted objects showed empty status values even though the extraction-worker.service.ts was setting `status: 'accepted'` or `status: 'draft'`.

## Root Cause
The `GraphService.createObject()` method was not including the `status` column in its INSERT statement to `kb.graph_objects`. While the status field was:
- ✅ Defined in the database schema
- ✅ Added to TypeScript interfaces (GraphObjectRow, CreateGraphObjectDto)
- ✅ Set by extraction-worker.service.ts
- ✅ Included in SELECT queries

It was **missing** from the INSERT statement, so status values were never written to the database.

## Fix Applied

### 1. Added status to method parameter destructuring

**File:** `apps/server/src/modules/graph/graph.service.ts` (line ~183)

```typescript
async createObject(input: CreateGraphObjectDto & { branch_id?: string | null }, ctx?: GraphTenantContext): Promise<GraphObjectDto> {
    let {
        type,
        key,
        status,  // ← ADDED
        properties = {},
        labels = [],
        organization_id = null,
        org_id = null,
        project_id = null,
        branch_id = null,
    } = input as any;
```

### 2. Updated INSERT statement to include status column

**File:** `apps/server/src/modules/graph/graph.service.ts` (line ~292)

**Before:**
```sql
INSERT INTO kb.graph_objects(type, key, properties, labels, version, canonical_id, org_id, project_id, branch_id, change_summary, content_hash, fts, embedding, embedding_updated_at)
VALUES ($1,$2,$3,$4,1,gen_random_uuid(),$5,$6,$7,$8,$9, ${ftsVectorSql}, NULL, NULL)
RETURNING id, org_id, project_id, branch_id, canonical_id, supersedes_id, version, type, key, properties, labels, deleted_at, change_summary, content_hash, fts, created_at
```

**After:**
```sql
INSERT INTO kb.graph_objects(type, key, status, properties, labels, version, canonical_id, org_id, project_id, branch_id, change_summary, content_hash, fts, embedding, embedding_updated_at)
VALUES ($1,$2,$11,$3,$4,1,gen_random_uuid(),$5,$6,$7,$8,$9, ${ftsVectorSql}, NULL, NULL)
RETURNING id, org_id, project_id, branch_id, canonical_id, supersedes_id, version, type, key, status, properties, labels, deleted_at, change_summary, content_hash, fts, created_at
```

**Changes:**
1. Added `status` to column list (after `key`)
2. Added `$11` to VALUES list (new parameter for status)
3. Added `status` to RETURNING clause
4. Added `status ?? null` to the parameters array (position 11)

### 3. Parameter array update

```typescript
[type, key ?? null, properties, dedupedLabels, org_id, project_id, branch_id, changeSummary, hash, JSON.stringify(properties), status ?? null]
//                                                                                                                              ^^^^^^^^^^^^^^
//                                                                                                                              Added as $11
```

## Testing

After the fix, newly extracted objects should show:
- ✅ Status badge in UI table (green "accepted" or yellow "draft")
- ✅ Status value persisted in database
- ✅ Status available in API responses

### Verification Query
```sql
SELECT id, key, status, 
       properties->>'_extraction_confidence' as confidence
FROM kb.graph_objects
WHERE created_at > NOW() - INTERVAL '1 hour'
ORDER BY created_at DESC
LIMIT 10;
```

Expected results:
- Objects with confidence >= 0.85 should have `status = 'accepted'`
- Objects with confidence < 0.85 should have `status = 'draft'`

## Build Status
- ✅ Backend build: Success
- ✅ Services restarted: Success
- ✅ Fix deployed and ready

## Related Files
1. `apps/server/src/modules/graph/graph.service.ts` - Fixed INSERT statement
2. `apps/server/src/modules/extraction-jobs/extraction-worker.service.ts` - Sets status based on confidence
3. `apps/admin/src/components/organisms/ObjectBrowser/ObjectBrowser.tsx` - Displays status in UI
4. `docs/STATUS_COLUMN_UI_IMPLEMENTATION.md` - Original UI implementation

## Summary
The status column infrastructure was complete except for the critical INSERT statement that actually writes the status to the database. This fix completes the status column feature by ensuring status values are persisted during object creation.

Now when you extract objects:
1. Extraction worker calculates confidence and sets status
2. GraphService.createObject() inserts status into database
3. API queries SELECT status and return it
4. UI displays status with color-coded badges

The full status workflow is now operational! 🎉
