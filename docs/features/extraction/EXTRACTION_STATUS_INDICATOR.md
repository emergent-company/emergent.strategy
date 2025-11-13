# Extraction Status Indicator - Implementation Complete

## Overview
Added visual extraction status indicators to the documents table, showing the status of the most recent extraction job for each document.

**Date**: 2025-10-22  
**Status**: ✅ Complete

## Problem
Users had no way to see:
- Which documents had been extracted
- The status of extraction jobs (pending, running, completed, failed)
- When extraction was completed
- How many objects were extracted

## Solution

### 1. Backend Changes

#### DocumentDto (Enhanced)
**File**: `apps/server/src/modules/documents/dto/document.dto.ts`

**Added Fields**:
```typescript
@ApiProperty({
    required: false,
    nullable: true,
    example: 'completed',
    description: 'Status of the most recent extraction job for this document',
    enum: ['pending', 'running', 'completed', 'failed']
})
extractionStatus?: string;

@ApiProperty({
    required: false,
    nullable: true,
    example: '2025-01-01T00:10:00.000Z',
    description: 'Timestamp when the most recent extraction job was completed'
})
extractionCompletedAt?: string;

@ApiProperty({
    required: false,
    nullable: true,
    example: 15,
    description: 'Number of objects extracted in the most recent extraction job'
})
extractionObjectsCount?: number;
```

#### DocumentsService (Enhanced)
**File**: `apps/server/src/modules/documents/documents.service.ts`

**Updated SQL Queries**:
Both `list()` and `get()` methods now include extraction job information via LEFT JOIN LATERAL:

```sql
SELECT d.id, d.org_id, d.project_id, d.filename, d.source_url, d.mime_type, 
       d.created_at, d.updated_at,
       COALESCE((SELECT COUNT(*)::int FROM kb.chunks c WHERE c.document_id = d.id),0) AS chunks,
       ej.status AS extraction_status,
       ej.completed_at AS extraction_completed_at,
       ej.objects_created AS extraction_objects_count
FROM kb.documents d
LEFT JOIN LATERAL (
    SELECT status, completed_at, objects_created
    FROM kb.object_extraction_jobs
    WHERE source_type = 'document' AND source_id = d.id
    ORDER BY created_at DESC
    LIMIT 1
) ej ON true
```

**Why LEFT JOIN LATERAL**:
- Gets the **most recent** extraction job for each document
- `LATERAL` allows the subquery to reference `d.id` from the outer query
- `LEFT JOIN` ensures documents without extraction jobs still appear (with NULL values)
- Only fetches one extraction job per document (most recent)

### 2. Frontend Changes

#### DocumentRow Type (Enhanced)
**File**: `apps/admin/src/pages/admin/apps/documents/index.tsx`

**Added Fields**:
```typescript
type DocumentRow = {
    // ... existing fields ...
    extractionStatus?: string;
    extractionCompletedAt?: string;
    extractionObjectsCount?: number;
};
```

#### New Extraction Status Column
**Location**: Between "Chunks" and "Created" columns

**Visual Indicators**:
- **Green dot** (`bg-success`) + check icon: Extraction completed
- **Orange dot** (`bg-warning`) + loader icon: Extraction in progress
- **Blue dot** (`bg-info`) + clock icon: Extraction pending
- **Red dot** (`bg-error`) + X icon: Extraction failed
- **Dash** (`—`): No extraction job

**Tooltip Content**:
- **Completed**: "Completed: [date] | [count] objects"
- **Running**: "Extraction in progress..."
- **Pending**: "Extraction pending"
- **Failed**: "Extraction failed"

**Implementation**:
```tsx
{
    key: 'extractionStatus',
    label: 'Extraction',
    width: 'w-32',
    render: (doc) => {
        if (!doc.extractionStatus) {
            return <span className="text-sm text-base-content/40">—</span>;
        }

        let statusColor = '';
        let statusIcon = '';
        let tooltipText = '';

        switch (doc.extractionStatus) {
            case 'completed':
                statusColor = 'bg-success';
                statusIcon = 'lucide--check-circle';
                tooltipText = `Completed: ${doc.extractionCompletedAt ? new Date(doc.extractionCompletedAt).toLocaleString() : 'N/A'}${doc.extractionObjectsCount ? ` | ${doc.extractionObjectsCount} objects` : ''}`;
                break;
            // ... other cases ...
        }

        return (
            <div className="tooltip tooltip-left" data-tip={tooltipText}>
                <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${statusColor}`} />
                    <Icon icon={statusIcon} className="size-4 text-base-content/70" />
                </div>
            </div>
        );
    },
},
```

### 3. Dropdown Fix

Also fixed the dropdown menu positioning issue in the same update.

**File**: `apps/admin/src/components/organisms/DataTable/DataTable.tsx`

**Changes**:
- Removed `dropdown-top` class (dropdown was opening upward when it should open downward)
- Changed `marginBottom` to `marginTop` in inline style
- Dropdown now opens downward by default and escapes table overflow with `fixed` positioning

## User Experience

### Before
- ❌ No way to see extraction status
- ❌ Users had to navigate to extraction jobs page to check status
- ❌ No visual feedback on which documents were extracted
- ❌ Dropdown opening upward (incorrect)

### After
- ✅ At-a-glance extraction status for each document
- ✅ Color-coded indicators: green (done), orange (in progress), blue (pending), red (failed)
- ✅ Hover tooltip shows detailed information (date, object count)
- ✅ No need to leave documents page to check extraction status
- ✅ Dropdown opening downward (correct)

## Status Colors & Icons

| Status | Color | Icon | Meaning |
|--------|-------|------|---------|
| `completed` | Green (`bg-success`) | `lucide--check-circle` | Extraction finished successfully |
| `running` | Orange (`bg-warning`) | `lucide--loader-circle` | Extraction in progress |
| `pending` | Blue (`bg-info`) | `lucide--clock` | Extraction queued, not started |
| `failed` | Red (`bg-error`) | `lucide--x-circle` | Extraction encountered an error |
| `null` | Gray (`text-base-content/40`) | Dash (`—`) | No extraction job exists |

## Performance Considerations

### SQL Query Performance
- `LEFT JOIN LATERAL` with `ORDER BY created_at DESC LIMIT 1` is efficient
- Query fetches only the **most recent** extraction job per document
- No N+1 query problem (single query gets all data)
- Indexes on `object_extraction_jobs` table ensure fast lookups:
  - `idx_extraction_jobs_source` on `(source_type, source_id)`
  - `idx_extraction_jobs_status` on `(status)`

### Frontend Performance
- Status indicator is a simple colored dot + icon (minimal DOM)
- Tooltip content generated on-demand (hover only)
- No additional API calls needed (data comes with document list)

## Testing

### Manual Testing Checklist
1. ✅ Navigate to `/admin/apps/documents`
2. ✅ Upload a new document
3. ✅ Verify extraction status column shows "—" (no extraction)
4. ✅ Click "Extract" action on document
5. ✅ Verify status changes to blue dot (pending) or orange dot (running)
6. ✅ Wait for extraction to complete
7. ✅ Verify status changes to green dot (completed)
8. ✅ Hover over indicator to see tooltip with date and object count
9. ✅ Verify dropdown opens downward (not upward)

### Backend Testing
```bash
# Test GET /api/documents includes extraction fields
curl http://localhost:3001/api/documents \
  -H "Authorization: Bearer {token}" | jq '.items[0] | {id, name, extractionStatus, extractionCompletedAt, extractionObjectsCount}'
```

Expected response:
```json
{
  "id": "uuid",
  "name": "document.pdf",
  "extractionStatus": "completed",
  "extractionCompletedAt": "2025-10-22T08:15:30.000Z",
  "extractionObjectsCount": 15
}
```

## Database Schema

### Relevant Tables
- `kb.documents` - Document metadata
- `kb.object_extraction_jobs` - Extraction job records
  - `source_type` = 'document'
  - `source_id` = document UUID
  - `status` enum: 'pending', 'running', 'completed', 'failed'
  - `completed_at` timestamp
  - `objects_created` integer count

### Query Pattern
```sql
-- Get most recent extraction job for a document
SELECT status, completed_at, objects_created
FROM kb.object_extraction_jobs
WHERE source_type = 'document' AND source_id = :document_id
ORDER BY created_at DESC
LIMIT 1
```

## Files Modified

### Backend
1. `apps/server/src/modules/documents/dto/document.dto.ts`
   - Added `extractionStatus`, `extractionCompletedAt`, `extractionObjectsCount` fields
   - Added API documentation

2. `apps/server/src/modules/documents/documents.service.ts`
   - Updated `DocumentRow` interface
   - Enhanced `list()` query with LEFT JOIN LATERAL
   - Enhanced `get()` query with LEFT JOIN LATERAL
   - Updated `mapRow()` to include extraction fields

### Frontend
3. `apps/admin/src/pages/admin/apps/documents/index.tsx`
   - Updated `DocumentRow` type
   - Added extraction status column with visual indicators
   - Added tooltip with detailed information

4. `apps/admin/src/components/organisms/DataTable/DataTable.tsx`
   - Fixed dropdown positioning (removed `dropdown-top`)
   - Changed `marginBottom` to `marginTop`

## Related Documentation
- `docs/AUTO_EXTRACTION_SETTINGS_COMPLETE.md` - Auto-extraction settings implementation
- `docs/DATATABLE_DROPDOWN_FIX.md` - Dropdown positioning fix details
- `docs/spec/02-requirements.md` - Documents table requirements

## Future Enhancements
- [ ] Add "View extraction details" link in tooltip (navigate to extraction job detail page)
- [ ] Add retry button for failed extractions
- [ ] Add bulk extraction action (select multiple documents, extract all)
- [ ] Show extraction progress percentage for running jobs
- [ ] Add extraction history (show all jobs, not just most recent)

## Checklist
- [x] Backend: Added extraction fields to DocumentDto
- [x] Backend: Enhanced SQL queries with LEFT JOIN LATERAL
- [x] Backend: Updated DocumentRow interface
- [x] Backend: Updated mapRow function
- [x] Frontend: Updated DocumentRow type
- [x] Frontend: Added extraction status column
- [x] Frontend: Added color-coded indicators
- [x] Frontend: Added hover tooltips with details
- [x] Frontend: Fixed dropdown positioning
- [x] Tested: Status indicators appear correctly
- [x] Tested: Tooltips show correct information
- [x] Tested: Dropdown opens downward
- [x] Documented: Complete implementation guide
