# Feature: Delete Button for User-Created Template Packs

## Overview

Added the ability to permanently delete user-created and discovered template packs that are not currently installed.

## Scope

**Deletable Packs:**
- ✅ User-created packs (`source = 'manual'`)
- ✅ Discovered packs (`source = 'discovered'`)
- ✅ Imported packs (`source = 'imported'`)
- ✅ Only non-installed packs (not assigned to any project)

**Protected Packs:**
- ❌ Built-in/system packs (`source = 'system'`) - No delete button shown
- ❌ Currently installed packs - Use "Remove" button instead (uninstalls from project but doesn't delete)

## Changes Made

### 1. Added Delete Handler Function

**File**: `apps/admin/src/pages/admin/pages/settings/project/templates.tsx`

**Function**: `handleDelete(packId: string, packName: string)`

```typescript
const handleDelete = async (packId: string, packName: string) => {
    if (!window.confirm(`Are you sure you want to permanently delete "${packName}"? This action cannot be undone.`)) {
        return;
    }

    setError(null);

    try {
        await fetchJson(`${apiBase}/api/template-packs/${packId}`, {
            method: 'DELETE',
        });

        // Reload packs
        await loadTemplatePacks();
    } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to delete template pack');
    }
};
```

**Features:**
- Confirmation dialog with pack name
- Calls DELETE endpoint: `DELETE /api/template-packs/:id`
- Error handling with user-friendly message
- Automatic refresh after successful deletion

### 2. Added Delete Button to UI

**Location**: "User Created & Discovered Packs" section only

**Button Properties:**
- Style: `btn-outline btn btn-sm btn-error` (red outline)
- Icon: `lucide--trash-2` (trash can icon)
- Label: "Delete"
- Tooltip: "Permanently delete this template pack"
- Position: Between "Preview" and "Install" buttons

**Button Order:**
1. Preview (ghost button)
2. **Delete** (error outline button) ← NEW
3. Install (primary button)

### 3. Visual Design

**Button Styling:**
```tsx
<button
    className="btn-outline btn btn-sm btn-error"
    onClick={() => handleDelete(pack.id, pack.name)}
    title="Permanently delete this template pack"
>
    <Icon icon="lucide--trash-2" className="size-4" />
    Delete
</button>
```

- Red outline for destructive action
- Small size to match other buttons
- Trash icon for clear visual indication
- Hover shows tooltip with warning

## User Experience

### Delete Flow

1. **User clicks Delete button** on a user-created pack
2. **Confirmation dialog appears**: "Are you sure you want to permanently delete "[Pack Name]"? This action cannot be undone."
3. **User confirms** (OK) or cancels
4. **If confirmed**:
   - DELETE request sent to backend
   - Loading state (optional: could add spinner)
   - Success: Pack removed from list
   - Error: Alert shown with error message

### Safety Features

1. **Confirmation Dialog**: Prevents accidental deletion
2. **Pack Name in Dialog**: User sees exactly what they're deleting
3. **Cannot Delete Built-in Packs**: No delete button for system packs
4. **Cannot Delete Installed Packs**: Must uninstall first (use Remove button)
5. **Error Handling**: Backend errors displayed to user
6. **Permanent Warning**: Dialog states "cannot be undone"

## Backend Integration

**Endpoint**: `DELETE /api/template-packs/:id`

**Expected Behavior:**
- Verifies pack exists
- Checks if pack is installed in any project (should prevent deletion if installed)
- Performs cascade deletion or sets constraints
- Returns success/error response

**Error Cases:**
- Pack not found: 404
- Pack is installed: 409 Conflict or 400 Bad Request
- Insufficient permissions: 403 Forbidden
- System pack deletion attempt: 403 Forbidden

## Testing Checklist

### Functional Tests

- [ ] Delete button appears for user-created packs (source !== 'system')
- [ ] Delete button does NOT appear for built-in packs
- [ ] Delete button does NOT appear for installed packs (use Remove instead)
- [ ] Clicking Delete shows confirmation dialog with pack name
- [ ] Canceling confirmation does nothing
- [ ] Confirming deletion sends DELETE request
- [ ] Successful deletion removes pack from list
- [ ] Successful deletion reloads available packs
- [ ] Error is displayed if deletion fails
- [ ] Cannot delete pack that's installed in another project

### Visual Tests

- [ ] Delete button has red error styling
- [ ] Delete button is between Preview and Install buttons
- [ ] Trash icon displays correctly
- [ ] Button size matches other action buttons
- [ ] Hover tooltip shows "Permanently delete this template pack"
- [ ] Button is visually distinct from Install (primary) button

### Edge Cases

- [ ] What if pack has dependencies?
- [ ] What if pack was created by another user?
- [ ] What if multiple projects reference the pack?
- [ ] What if deletion happens while someone else is viewing/installing?

## Security Considerations

1. **Authorization**: Backend must verify user has permission to delete pack
2. **Ownership**: May want to restrict deletion to pack creator
3. **System Packs**: Must prevent deletion of built-in packs at backend level
4. **Cascade Effects**: Ensure referential integrity (no orphaned project assignments)
5. **Audit Log**: Consider logging pack deletions for compliance

## Future Enhancements

1. **Soft Delete**: Mark as deleted instead of permanent removal
2. **Restore Feature**: Allow recovery of recently deleted packs
3. **Batch Delete**: Select multiple packs to delete at once
4. **Delete Confirmation**: Show what will be affected (projects, objects, etc.)
5. **Permission System**: Fine-grained control over who can delete packs
6. **Pack Dependencies**: Warn if pack is referenced by other packs

## Related Features

- **Remove Button** (Installed Packs): Uninstalls from current project (not permanent)
- **Disable Button** (Installed Packs): Temporarily disables without uninstalling
- **Pack Creation**: Discovery Wizard creates user packs that can later be deleted
- **Pack Import**: Imported packs from external sources can be deleted

## Documentation References

- Backend endpoint: `apps/server/src/modules/template-packs/template-pack.controller.ts`
- Service layer: `apps/server/src/modules/template-packs/template-pack.service.ts`
- Frontend page: `apps/admin/src/pages/admin/pages/settings/project/templates.tsx`
