# Design: Document Deletion with Cascade

## Context

The Spec Server knowledge management system stores documents with multiple layers of derived data:

- **Chunks** (text segments with embeddings)
- **Extraction Jobs** (AI-powered entity extraction processes)
- **Graph Objects** (Requirements, Decisions, Tasks extracted from documents)
- **Graph Relationships** (connections between graph objects)
- **Notifications** (system alerts related to documents)

Currently, the DELETE endpoint at `documents.controller.ts:194` only deletes the document itself and relies on database CASCADE for chunks. However, extraction jobs, graph objects, and relationships are not automatically cleaned up, leading to orphaned data.

Users need the ability to delete documents with full visibility into what will be removed, plus a safety mechanism to prevent accidental deletions.

## Goals / Non-Goals

**Goals:**

- Provide transparent deletion impact analysis before any data is removed
- Implement hard deletion with full cascade across all related entities
- Support both single and bulk deletion operations
- Ensure atomic transactions (all-or-nothing deletion)
- Create intuitive UI with clear warnings and confirmations
- Maintain proper authorization using existing `documents:delete` scope

**Non-Goals:**

- Soft deletion (documents.entity.ts does not have deletedAt field)
- Undo/recovery mechanisms (hard delete is permanent)
- Audit logging of deletions (can be added later if needed)
- Scheduled/automatic document cleanup
- Archive functionality (different feature)

## Decisions

### 1. Deletion Strategy: Hard Delete with Database Transaction

**Decision:** Use hard deletion within a database transaction to ensure atomicity.

**Rationale:**

- Document entity lacks `deletedAt` field, indicating hard delete is the intended behavior
- TypeORM transactions ensure all-or-nothing semantics
- Simpler implementation than soft delete (no query filters needed)
- Matches existing chunk deletion behavior (CASCADE via FK)

**Implementation:**

```typescript
await this.dataSource.transaction(async (manager) => {
  // 1. Delete notifications (or nullify references)
  // 2. Delete graph relationships (WHERE src_id IN objects OR dst_id IN objects)
  // 3. Delete graph objects (WHERE extraction_job_id IN jobs)
  // 4. Delete extraction jobs (WHERE document_id = docId)
  // 5. Delete document (chunks auto-deleted via CASCADE)
});
```

**Alternatives considered:**

- Soft delete: Rejected because entity lacks support and adds query complexity
- Two-phase commit: Rejected as overkill for single-database operations
- Async background deletion: Rejected due to complexity and potential inconsistency

### 2. Impact Analysis via Separate Endpoint

**Decision:** Create GET /documents/:id/deletion-impact and POST /documents/deletion-impact endpoints.

**Rationale:**

- Separates read (impact) from write (delete) operations
- Allows frontend to show impact before user confirms
- Can be cached/called multiple times without side effects
- Follows RESTful principles (GET for queries, DELETE for mutations)

**Response format (single document):**

```typescript
{
  document: { id, name, createdAt },
  impact: {
    chunks: number,
    extractionJobs: number,
    graphObjects: number,
    graphRelationships: number,
    notifications: number
  }
}
```

**Response format (bulk deletion):**

```typescript
{
  totalImpact: {
    chunks: number,
    extractionJobs: number,
    graphObjects: number,
    graphRelationships: number,
    notifications: number
  },
  perDocument: Array<{
    document: { id, name, createdAt },
    impact: {
      chunks: number,
      extractionJobs: number,
      graphObjects: number,
      graphRelationships: number,
      notifications: number
    }
  }>
}
```

**Alternatives considered:**

- Dry-run flag on DELETE: Rejected because mixing GET-like behavior with DELETE is confusing
- No impact analysis: Rejected because users need visibility to avoid mistakes

### 3. Cascade Order: Bottom-Up Deletion

**Decision:** Delete entities in reverse dependency order:

1. Notifications (references documents)
2. Graph Relationships (references objects)
3. Graph Objects (references extraction jobs)
4. Extraction Jobs (references documents)
5. Document (chunks deleted via CASCADE)

**Rationale:**

- Prevents foreign key violations
- Ensures referential integrity throughout deletion
- Works with existing database constraints
- Matches the natural dependency graph

**Implementation detail:**

- Use `WHERE ... IN (subquery)` for batch deletions within transaction
- Leverage indexes on foreign keys for query performance

### 4. Bulk Deletion: Partial Success Handling with Per-Document Breakdown

**Decision:** For bulk deletion, continue processing all IDs and report partial success with per-document breakdown.

**Rationale:**

- Users shouldn't lose progress if one document is missing/inaccessible
- Transparent reporting lets users know exactly what was deleted
- **Per-document breakdown** helps users understand the impact for each file being deleted
- Frontend can show detailed success/failure breakdown grouped by document
- Users can see which specific documents had high cascade impact

**Response format:**

```typescript
{
  status: "deleted" | "partial",
  deleted: number,
  notFound: string[], // IDs that couldn't be deleted
  summary: { chunks, extractionJobs, graphObjects, relationships, notifications }
}
```

**Alternatives considered:**

- All-or-nothing: Rejected because one bad ID would block entire operation
- Async batch processing: Rejected as unnecessary complexity for typical batch sizes (<100)
- Aggregate-only response: Rejected because users need per-file visibility in batch operations

### 5. Frontend Confirmation Modal with Per-Document Breakdown

**Decision:** Create reusable `DeletionConfirmationModal` component with loading states and per-document impact display for bulk operations.

**Component structure:**

```typescript
interface DeletionConfirmationModalProps {
  documentIds: string[];
  onConfirm: () => Promise<void>;
  onCancel: () => void;
}
```

**Flow:**

1. Modal opens → fetch impact (loading spinner)
2. Impact loaded → show summary with warning
   - **Single document:** Show document name and impact directly (no list)
   - **Bulk deletion:** Show total impact + per-document breakdown list
3. User confirms → execute deletion (loading spinner)
4. Success → close modal, refresh table, show toast
5. Error → show error message in modal with retry option

**UI Requirements:**

**Single Document Deletion:**

- Display document name prominently with file emoji (📄)
- Show impact counts inline (e.g., "1 chunk, 0 extraction jobs")
- No separate "Documents to be deleted" section - keep it simple
- Warning message: "This action cannot be undone"

**Bulk Deletion:**

- Display total aggregate impact at the top (e.g., "41 chunks, 3 extraction jobs across 5 documents")
- Show "Documents to be deleted:" heading
- Group detailed impact by document filename in a list
- Show each document with its specific consequences (chunks, jobs, objects, etc.)
- Use scrollable container if more than 3 documents
- Highlight documents with high impact (e.g., >10 chunks or >5 extraction jobs) with badge and warning background

**Example single document display:**

```
⚠️ You are about to permanently delete this document and all related resources.

📄 meeting_1.md

Impact:
• 38 Chunks
• 2 Extraction Jobs
• 5 Graph Objects
• 1 Graph Relationship

This action cannot be undone.
```

**Example bulk display:**

```
⚠️ You are about to delete 5 documents and all related resources.

Total Impact:
• 41 Chunks
• 3 Extraction Jobs
• 7 Graph Objects
• 2 Graph Relationships

Documents to be deleted:
📄 meeting_1.md
  • 38 Chunks
  • 2 Extraction Jobs
  • 5 Graph Objects
  • 1 Graph Relationship

📄 test-doc.txt
  • 3 Chunks
  • 1 Extraction Job
  • 2 Graph Objects
  • 1 Graph Relationship

[Show 3 more documents...]
```

**Rationale:**

- Reusable for both single and bulk deletion
- Clear loading states prevent user confusion
- Error handling at modal level keeps state localized
- **Per-document breakdown** helps users make informed decisions in bulk operations
- Users can identify which specific documents have high cascade impact

**Alternatives considered:**

- Inline confirmation (window.confirm): Rejected because no impact visibility
- Multi-step wizard: Rejected as overengineered for this use case
- Aggregate-only view: Rejected because users need to see per-file impact to make informed decisions

### 6. Authorization: Reuse Existing Scope

**Decision:** Enforce `documents:delete` scope on all deletion endpoints (impact + delete).

**Rationale:**

- Scope already exists in Zitadel configuration
- Impact analysis reveals data structure, so same security level needed
- Consistent with existing documents:read and documents:write patterns

**Implementation:**

```typescript
@Scopes('documents:delete')
async getDeletionImpact(@Param('id') id: string) { ... }

@Scopes('documents:delete')
async delete(@Param('id') id: string) { ... }

@Scopes('documents:delete')
async bulkDelete(@Body() body: BulkDeleteDto) { ... }
```

## Risks / Trade-offs

### Risk: Large cascade deletions may timeout

**Mitigation:**

- Use indexed queries for cascade lookups
- Consider batch size limits for bulk deletion (e.g., max 100 documents)
- Add query timeout configuration

### Risk: Transaction lock contention

**Mitigation:**

- Keep transactions as short as possible
- Delete in reverse dependency order to minimize lock duration
- Use FOR UPDATE SKIP LOCKED if concurrent deletions are common

### Risk: Accidental deletion despite confirmation

**Mitigation:**

- Clear warning messages in modal
- Detailed impact summary before confirmation
- Consider adding "type document name to confirm" for critical deletions (future enhancement)

### Trade-off: Hard delete means no recovery

**Acceptance criteria:**

- Document this clearly in UI warnings
- Consider backup/export feature as separate enhancement
- Users must have documents:delete scope (admin-level permission)

## Migration Plan

No database migrations required. This change uses existing schema and foreign keys.

**Deployment steps:**

1. Deploy backend with new endpoints
2. Deploy frontend with new UI components
3. Test with non-production data first
4. Monitor for performance issues in production
5. Consider adding telemetry for deletion operations (future)

**Rollback strategy:**

- Frontend: Disable delete buttons via feature flag
- Backend: Remove endpoints if critical issues found
- No data rollback possible (hard delete)

## Open Questions

1. **Should we add soft delete support in the future?**

   - Would require schema migration to add deletedAt to Document entity
   - Consider for v2 if users request "trash/restore" functionality

2. **Should we enforce batch size limits on bulk deletion?**

   - Recommendation: Start with max 100 documents per request
   - Monitor performance and adjust if needed

3. **Should deletion operations be logged/audited?**

   - Not in this change, but consider for compliance requirements
   - Could add to notifications or separate audit log table

4. **Should we support async deletion for large batches?**

   - Not needed for MVP
   - Consider if users regularly delete 1000+ documents

5. **How should we handle notifications referencing deleted documents?**

   - Option A: Hard delete notifications (consistent with document deletion)
   - Option B: Nullify resource_id field (preserve notification history)
   - **Recommendation:** Option A for simplicity, can revisit if users need notification history

6. **Should the per-document breakdown be paginated for very large bulk deletions?**
   - For deletions >20 documents, consider paginating the per-document list
   - Alternatively, show top N impactful documents + collapsed "show all" option
   - **Recommendation:** Start with full list up to 100 documents, add pagination if users report performance issues
