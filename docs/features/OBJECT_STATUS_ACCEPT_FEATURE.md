# Object Status Accept Feature

## Overview
Added the ability to accept objects individually or in bulk from the UI. Objects can be marked as "accepted" which changes their status from "draft" to "accepted".

## Implementation Details

### Backend Changes

#### 1. Updated DTOs

**File:** `apps/server/src/modules/graph/dto/patch-graph-object.dto.ts`
- Added `status` field (optional, string, max 64 characters)
- Allows status to be updated when patching an object

**File:** `apps/server/src/modules/graph/dto/bulk-update-status.dto.ts` (NEW)
- Created new DTO for bulk status updates
- Fields:
  - `ids`: Array of object IDs (required, min 1)
  - `status`: New status value (required, max 64 characters)

#### 2. Updated GraphService

**File:** `apps/server/src/modules/graph/graph.service.ts`
- Modified `patchObject()` method to handle status updates
- Changes:
  1. Extract `status` from patch input
  2. Compare current status with new status to detect changes
  3. Include status change in "no effective change" check
  4. Add `status` column to INSERT statement (parameter $16)
  5. Add `status` to RETURNING clause
  6. Pass `status ?? null` as parameter value

**SQL Changes:**
```sql
-- Before
INSERT INTO kb.graph_objects(type, key, properties, labels, ...)
VALUES ($1,$2,$3,$4,...)

-- After
INSERT INTO kb.graph_objects(type, key, status, properties, labels, ...)
VALUES ($1,$2,$16,$3,$4,...)
RETURNING id, ..., key, status, properties, ...
```

#### 3. New Controller Endpoint

**File:** `apps/server/src/modules/graph/graph.controller.ts`
- Added `POST /graph/objects/bulk-update-status` endpoint
- Requires `graph:write` scope
- Features:
  - Accepts array of object IDs and new status value
  - Uses `Promise.allSettled` for parallel updates
  - Returns summary: `{ success: number, failed: number, results: [...] }`
  - Each result includes: `{ id: string, success: boolean, error?: string }`

### Frontend Changes

#### 1. Updated ObjectBrowser Component

**File:** `apps/admin/src/components/organisms/ObjectBrowser/ObjectBrowser.tsx`

**Interface Changes:**
- Added `onBulkAccept?: (selectedIds: string[]) => void` prop

**UI Changes:**
- Added **Accept** button to bulk actions bar (appears when objects are selected)
- Button styling: `btn btn-sm btn-success` (green button)
- Icon: `lucide--check-circle`
- Position: First button in bulk actions (before Delete)

**Bulk Actions Bar:**
```tsx
{selectedIds.size} selected
[Accept] [Delete] [Export] [Add Label]
```

#### 2. Updated ObjectDetailModal Component

**File:** `apps/admin/src/components/organisms/ObjectDetailModal/ObjectDetailModal.tsx`

**Interface Changes:**
- Added `onAccept?: (objectId: string) => void` prop

**UI Changes:**
- Added **Accept** button to modal actions
- Conditionally shown: only when `object.status !== 'accepted'`
- Button styling: `btn btn-success btn-sm` (green button)
- Icon: `lucide--check-circle`
- Position: First button in actions (before Edit)

**Modal Actions:**
```tsx
[Accept] [Edit] [View Graph] [Delete] [Close]
```

#### 3. Updated Objects Page

**File:** `apps/admin/src/pages/admin/pages/objects/index.tsx`

**New Functions:**

1. **`handleBulkAccept(selectedIds: string[])`**
   - Calls `POST /api/graph/objects/bulk-update-status`
   - Payload: `{ ids: [...], status: 'accepted' }`
   - Shows alert if any updates fail
   - Reloads objects list after update

2. **`handleAcceptObject(objectId: string)`**
   - Calls `PATCH /api/graph/objects/:id`
   - Payload: `{ status: 'accepted' }`
   - Updates modal object state if modal is open
   - Reloads objects list after update

**Props Passed:**
- `onBulkAccept={handleBulkAccept}` → ObjectBrowser
- `onAccept={handleAcceptObject}` → ObjectDetailModal

## Usage

### Individual Accept (Object Detail Modal)

1. Click on any object in the Objects page
2. Object detail modal opens
3. If status is not "accepted", **Accept** button appears
4. Click **Accept** button
5. Object status changes to "accepted" (green badge)
6. Modal updates to show new status
7. List refreshes automatically

### Bulk Accept (Object Browser)

1. Select multiple objects using checkboxes
2. Bulk actions bar appears showing: "{N} selected"
3. Click **Accept** button (green with checkmark icon)
4. All selected objects update to "accepted" status
5. Selection clears automatically
6. List refreshes to show updated statuses

## Status Badge Colors

- **accepted** → Green badge (`badge-success`)
- **draft** → Yellow badge (`badge-warning`)
- **rejected** → Red badge (`badge-error`)
- **others/null** → Gray badge (`badge-ghost`) or em dash

## API Endpoints

### Individual Update
```http
PATCH /api/graph/objects/:id
Content-Type: application/json

{
  "status": "accepted"
}
```

**Response:** Full object with new version created

### Bulk Update
```http
POST /api/graph/objects/bulk-update-status
Content-Type: application/json

{
  "ids": ["uuid1", "uuid2", "uuid3"],
  "status": "accepted"
}
```

**Response:**
```json
{
  "success": 3,
  "failed": 0,
  "results": [
    { "id": "uuid1", "success": true },
    { "id": "uuid2", "success": true },
    { "id": "uuid3", "success": true }
  ]
}
```

## Versioning

**Important:** Both individual and bulk updates create new versions of objects (following the graph's versioning system). This means:
- Original status is preserved in version history
- Status change is tracked with timestamp
- Can view status changes in version history tab of object detail modal

## Error Handling

### Individual Accept
- Shows alert with error message if update fails
- Object remains unchanged in UI

### Bulk Accept
- Uses `Promise.allSettled` to handle partial failures
- Shows alert: "Updated {success} object(s), {failed} failed"
- Successfully updated objects refresh in UI
- Failed objects remain unchanged

## Testing

### Manual Testing Steps

1. **Individual Accept**:
   - Navigate to /admin/objects
   - Click on an object with status="draft"
   - Verify Accept button is visible and green
   - Click Accept
   - Verify status changes to "accepted" (green badge)
   - Verify Accept button disappears
   - Close and reopen modal - status should still be "accepted"

2. **Bulk Accept**:
   - Navigate to /admin/objects
   - Select 3-5 objects (mix of draft/accepted statuses)
   - Verify bulk actions bar appears
   - Click Accept button
   - Verify all selected objects now show "accepted" status
   - Verify selection clears
   - Verify Accept button was green with checkmark icon

3. **Version History**:
   - Accept an object
   - Open object detail modal
   - Switch to "Version History" tab
   - Verify new version created with status="accepted"

## Security

- Both endpoints require `graph:write` scope
- Tenant context extracted from headers (`X-Org-ID`, `X-Project-ID`)
- Objects can only be updated within user's authorized project

## Performance

- **Individual updates**: Single database transaction per object
- **Bulk updates**: Parallel execution using `Promise.allSettled`
- **Large batches**: Consider pagination if updating >100 objects at once

## Future Enhancements

Potential improvements:
1. Add "Reject" action (set status to "rejected")
2. Add status filter to object browser (show only draft/accepted/rejected)
3. Add keyboard shortcuts (e.g., "A" to accept selected)
4. Add undo functionality for status changes
5. Add batch status update for filtered results (accept all visible)
6. Add confirmation modal for bulk actions
7. Add progress indicator for large bulk updates
8. Export audit trail of status changes

## Related Files

### Backend
- `apps/server/src/modules/graph/dto/patch-graph-object.dto.ts`
- `apps/server/src/modules/graph/dto/bulk-update-status.dto.ts`
- `apps/server/src/modules/graph/graph.service.ts`
- `apps/server/src/modules/graph/graph.controller.ts`

### Frontend
- `apps/admin/src/components/organisms/ObjectBrowser/ObjectBrowser.tsx`
- `apps/admin/src/components/organisms/ObjectDetailModal/ObjectDetailModal.tsx`
- `apps/admin/src/pages/admin/pages/objects/index.tsx`

### Documentation
- `docs/STATUS_COLUMN_UI_IMPLEMENTATION.md` (original status display feature)
- `docs/STATUS_COLUMN_INSERT_FIX.md` (bug fix for status persistence)

## Changelog

### 2025-10-21
- ✅ Added status field to PatchGraphObjectDto
- ✅ Updated patchObject() to handle status changes
- ✅ Created BulkUpdateStatusDto
- ✅ Added POST /graph/objects/bulk-update-status endpoint
- ✅ Added Accept button to ObjectBrowser bulk actions
- ✅ Added Accept button to ObjectDetailModal
- ✅ Implemented handleBulkAccept in Objects page
- ✅ Implemented handleAcceptObject in Objects page
- ✅ All builds passing (backend + frontend)
- ✅ Services restarted successfully
- ✅ **Fixed**: Removed double JSON.stringify in API calls (fetchJson already handles this)
