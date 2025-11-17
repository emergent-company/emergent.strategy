# Complete Implementation: Delete Button for User Template Packs

## Summary

Added full-stack functionality to permanently delete user-created and discovered template packs that are not currently installed in any project.

## Frontend Changes

### File: `apps/admin/src/pages/admin/pages/settings/project/templates.tsx`

#### 1. Added Delete Handler Function (Line ~156)

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

#### 2. Added Delete Button to UI (Line ~420)

**Location**: "User Created & Discovered Packs" section only

**Button Added Between Preview and Install:**

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

**Action Order:**
1. Preview (ghost button)
2. **Delete** (error outline button, red) ← NEW
3. Install (primary button, blue)

## Backend Changes

### File: `apps/server/src/modules/template-packs/template-pack.controller.ts`

#### Added DELETE Endpoint (Line ~228)

```typescript
/**
 * Delete a template pack permanently
 * Only allows deletion of non-system packs that are not installed in any project
 */
@Delete(':id')
@Scopes('graph:write')
@HttpCode(HttpStatus.NO_CONTENT)
async deleteTemplatePack(
    @Param('id') packId: string,
    @Req() req: any
) {
    const orgId = (req.headers['x-org-id'] as string | undefined) || undefined;
    if (!orgId) {
        throw new BadRequestException('Organization context required');
    }

    await this.templatePackService.deleteTemplatePack(packId, orgId);
}
```

**Endpoint**: `DELETE /api/template-packs/:id`

**Headers Required:**
- `X-Org-ID`: Organization context
- `Authorization`: Bearer token

**Response**: 204 No Content (success) or error

### File: `apps/server/src/modules/template-packs/template-pack.service.ts`

#### Added Delete Service Method (Line ~512)

```typescript
/**
 * Delete a template pack permanently
 * Only allows deletion of non-system packs that are not currently installed
 */
async deleteTemplatePack(packId: string, orgId: string): Promise<void> {
    const client = await this.db.getClient();

    try {
        await client.query('BEGIN');

        // Set RLS context
        await client.query(`SELECT set_config('app.current_organization_id', $1, true)`, [orgId]);

        // Check if template pack exists and get its details
        const packResult = await client.query(
            `SELECT id, name, source FROM kb.graph_template_packs WHERE id = $1 AND organization_id = $2`,
            [packId, orgId]
        );

        if (packResult.rows.length === 0) {
            throw new BadRequestException('Template pack not found or access denied');
        }

        const pack = packResult.rows[0];

        // Prevent deletion of system packs
        if (pack.source === 'system') {
            throw new BadRequestException('Cannot delete built-in template packs');
        }

        // Check if pack is currently installed in any project
        const assignmentResult = await client.query(
            `SELECT COUNT(*) as count FROM kb.project_template_packs 
             WHERE template_pack_id = $1 AND organization_id = $2`,
            [packId, orgId]
        );

        const installCount = parseInt(assignmentResult.rows[0].count, 10);
        if (installCount > 0) {
            throw new BadRequestException(
                `Cannot delete template pack "${pack.name}" because it is currently installed in ${installCount} project(s). Please uninstall it from all projects first.`
            );
        }

        // Delete the template pack
        await client.query(
            `DELETE FROM kb.graph_template_packs WHERE id = $1 AND organization_id = $2`,
            [packId, orgId]
        );

        await client.query('COMMIT');

        this.logger.log(`Deleted template pack ${packId} (${pack.name}) from organization ${orgId}`);

    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}
```

## Security Features

### 1. Built-in Pack Protection

**Frontend**: No delete button shown for `source === 'system'` packs

**Backend**: Explicit check prevents deletion:
```typescript
if (pack.source === 'system') {
    throw new BadRequestException('Cannot delete built-in template packs');
}
```

### 2. Installation Check

**Backend**: Prevents deletion if pack is installed in any project:
```typescript
if (installCount > 0) {
    throw new BadRequestException(
        `Cannot delete template pack "${pack.name}" because it is currently installed in ${installCount} project(s). Please uninstall it from all projects first.`
    );
}
```

**User Flow**: Must uninstall from all projects before deletion

### 3. Authorization

- Requires `graph:write` scope
- Validates organization context (`X-Org-ID` header)
- RLS (Row Level Security) enforced via `organization_id` filter

### 4. Transaction Safety

- Uses database transactions (BEGIN/COMMIT/ROLLBACK)
- Atomically checks conditions and performs deletion
- Rollback on any error

## User Experience

### Deletion Flow

1. **User clicks Delete button** (red outline, trash icon)
2. **Confirmation dialog**: "Are you sure you want to permanently delete "[Pack Name]"? This action cannot be undone."
3. **User confirms or cancels**
4. **If confirmed**:
   - DELETE request sent to backend
   - Success: Pack removed from list
   - Error: Alert shown with specific error message

### Error Messages

| Scenario | Error Message |
|----------|---------------|
| Pack not found | "Template pack not found or access denied" |
| System pack | "Cannot delete built-in template packs" |
| Pack installed | "Cannot delete template pack "[name]" because it is currently installed in N project(s). Please uninstall it from all projects first." |
| Other errors | "Failed to delete template pack" |

## Testing Checklist

### Frontend Tests

- [ ] Delete button appears for user-created packs (`source !== 'system'`)
- [ ] Delete button does NOT appear for built-in packs
- [ ] Delete button does NOT appear in installed packs section
- [ ] Clicking Delete shows confirmation with pack name
- [ ] Canceling confirmation does nothing
- [ ] Confirming sends DELETE request to correct endpoint
- [ ] Success removes pack from list
- [ ] Error displays user-friendly message
- [ ] Page automatically refreshes after deletion

### Backend Tests

- [ ] DELETE /api/template-packs/:id returns 204 on success
- [ ] Returns 400 if pack not found
- [ ] Returns 400 if trying to delete system pack
- [ ] Returns 400 if pack is installed in any project
- [ ] Returns 400 if missing X-Org-ID header
- [ ] Returns 403 without proper scope
- [ ] Properly scopes by organization (can't delete other org's packs)
- [ ] Transaction rolls back on error
- [ ] Logs deletion event

### Integration Tests

- [ ] Create user pack → Delete → Verify removed from database
- [ ] Try to delete built-in pack → Verify rejected
- [ ] Install pack → Try to delete → Verify rejected with install count
- [ ] Uninstall pack → Delete → Verify success
- [ ] Delete pack in one org → Verify doesn't affect other orgs

## Database Impact

**Table**: `kb.graph_template_packs`

**Operation**: `DELETE FROM kb.graph_template_packs WHERE id = $1 AND organization_id = $2`

**Cascade Behavior**: Depends on foreign key constraints
- May need to handle or prevent if `project_template_packs` has FK without ON DELETE CASCADE
- Current implementation checks and prevents if assignments exist

## API Documentation

### DELETE /api/template-packs/:id

**Description**: Permanently delete a template pack

**Authentication**: Required (Bearer token)

**Authorization**: Requires `graph:write` scope

**Headers**:
- `X-Org-ID`: Organization ID (required)

**Parameters**:
- `id` (path): Template pack UUID

**Response**:
- `204 No Content`: Successfully deleted
- `400 Bad Request`: Pack not found, system pack, or currently installed
- `401 Unauthorized`: Missing or invalid token
- `403 Forbidden`: Insufficient permissions

**Example**:
```bash
curl -X DELETE http://localhost:3001/template-packs/123e4567-e89b-12d3-a456-426614174000 \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "X-Org-ID: org-uuid"
```

## Related Features

| Feature | Description | Button Location |
|---------|-------------|-----------------|
| **Delete** (NEW) | Permanently delete non-installed user pack | Available packs only |
| **Remove** | Uninstall pack from current project | Installed packs only |
| **Disable** | Temporarily disable without uninstalling | Installed packs only |
| **Install** | Add pack to current project | Available packs only |

## Files Changed

1. ✅ `apps/admin/src/pages/admin/pages/settings/project/templates.tsx`
   - Added `handleDelete` function
   - Added Delete button to User Created & Discovered Packs section

2. ✅ `apps/server/src/modules/template-packs/template-pack.controller.ts`
   - Added `@Delete(':id')` endpoint

3. ✅ `apps/server/src/modules/template-packs/template-pack.service.ts`
   - Added `deleteTemplatePack` method with validation and transaction handling

4. ✅ `docs/TEMPLATE_PACK_DELETE_FEATURE.md`
   - Comprehensive feature documentation

5. ✅ `docs/TEMPLATE_PACK_DELETE_IMPLEMENTATION_COMPLETE.md`
   - This implementation summary

## Next Steps

1. **Manual Testing**: Test the delete flow in the UI
2. **Backend Restart**: Restart backend to load new endpoint
3. **Frontend Refresh**: Hard refresh browser to clear cache
4. **Verify Protection**: Try to delete built-in pack (should see no button)
5. **Verify Validation**: Try to delete installed pack (should see error)
6. **Success Case**: Delete a discovered/user pack that's not installed

## Known Limitations

1. **No Soft Delete**: Deletion is permanent (could add `deleted_at` column for recovery)
2. **No Undo**: Once deleted, pack must be recreated from scratch
3. **No Cascade**: Must manually uninstall from all projects first
4. **Single Org**: Only checks installations within same organization

## Future Enhancements

1. Soft delete with recovery period
2. Cascade deletion with confirmation
3. Batch delete multiple packs
4. Audit trail of deletions
5. Transfer ownership before deletion
6. Archive instead of delete
