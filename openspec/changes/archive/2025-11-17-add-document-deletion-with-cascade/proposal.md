# Change: Add Document Deletion with Cascade and Confirmation

## Why

Users currently cannot delete documents from the system. The existing DELETE endpoint (documents.controller.ts:194) provides only basic deletion without cascade handling or impact visibility. Users need the ability to remove documents they no longer need, with full transparency about what will be deleted (chunks, extraction jobs, graph objects, relationships) and a confirmation mechanism to prevent accidental data loss.

## What Changes

- Add pre-deletion impact analysis endpoint that returns counts of all related entities that will be deleted
- **For bulk deletion, return per-document impact breakdown in addition to aggregate totals**
- Enhance DELETE /documents/:id endpoint to support cascade deletion with query parameter options
- Add bulk DELETE /documents endpoint for deleting multiple documents in a single request
- Implement frontend confirmation modal showing full deletion summary before execution
- **For bulk deletion, display per-document breakdown grouped by filename with collapsible sections**
- Add row-level delete action in documents table action menu
- Add bulk delete action in documents table mass actions toolbar
- Ensure `documents:delete` scope is properly enforced on all deletion endpoints

## Impact

### Affected Code

- **Backend**:
  - `apps/server/src/modules/documents/documents.controller.ts` - Add bulk delete endpoint, enhance single delete
  - `apps/server/src/modules/documents/documents.service.ts` - Add cascade deletion logic and impact analysis
  - `apps/server/src/modules/documents/dto/` - Add DTOs for deletion requests/responses
- **Frontend**:
  - `apps/admin/src/pages/admin/apps/documents/index.tsx` - Add UI actions and confirmation modal
  - `apps/admin/src/components/organisms/` - Create DeletionConfirmationModal component
  - `apps/admin/src/api/documents.ts` - Add API client methods for deletion operations

### Affected Entities

- Documents (kb.documents)
- Chunks (kb.chunks) - Already cascade via database FK
- Extraction Jobs (kb.object_extraction_jobs) - Linked via document_id
- Graph Objects (kb.graph_objects) - Linked via extraction_job_id
- Graph Relationships (kb.graph_relationships) - Linked via src_id/dst_id referencing deleted objects
- Notifications (kb.notifications) - May reference deleted documents

### Breaking Changes

None - This is a new feature that enhances existing functionality

### Migration/Deployment Notes

- No database migrations required (uses existing relations and foreign keys)
- Feature is opt-in (users must explicitly trigger deletions)
- Existing `documents:delete` scope already defined in Zitadel configuration
