# Implementation Tasks

## 1. Backend - API Endpoints

- [ ] 1.1 Create DTOs for deletion operations
  - [ ] Create `deletion-impact.dto.ts` with response shape
  - [ ] Create `bulk-delete-request.dto.ts` with ids array validation
  - [ ] Create `deletion-summary.dto.ts` for response summaries
- [ ] 1.2 Add GET /documents/:id/deletion-impact endpoint
  - [ ] Add route in `documents.controller.ts`
  - [ ] Apply @Scopes('documents:delete') guard
  - [ ] Apply @ApiOkResponse with DeletionImpactDto
  - [ ] Delegate to service method
- [ ] 1.3 Add POST /documents/deletion-impact endpoint (bulk impact analysis)
  - [ ] Add route in `documents.controller.ts`
  - [ ] Apply @Scopes('documents:delete') guard
  - [ ] Apply @ApiOkResponse with BulkDeletionImpactDto
  - [ ] Validate request body with BulkDeleteRequestDto
  - [ ] Delegate to service method
- [ ] 1.4 Add DELETE /documents endpoint (bulk deletion)
  - [ ] Add route in `documents.controller.ts`
  - [ ] Apply @Scopes('documents:delete') guard
  - [ ] Apply @ApiOkResponse with DeletionSummaryDto
  - [ ] Validate request body with BulkDeleteRequestDto
  - [ ] Delegate to service method

## 2. Backend - Service Layer

- [ ] 2.1 Implement getDeletionImpact(documentId: string) in documents.service.ts
  - [ ] Verify document exists and user has access (project/org scoping)
  - [ ] Query chunks count via COUNT(\*)
  - [ ] Query extraction jobs count WHERE document_id = documentId
  - [ ] Query graph objects count WHERE extraction_job_id IN (jobs)
  - [ ] Query graph relationships count WHERE src_id IN (objects) OR dst_id IN (objects)
  - [ ] Query notifications count WHERE resource_type = 'document' AND resource_id = documentId
  - [ ] Return impact summary DTO
- [ ] 2.2 Implement getBulkDeletionImpact(documentIds: string[]) in documents.service.ts
  - [ ] Verify documents exist and user has access (project/org scoping)
  - [ ] Aggregate counts across all document IDs
  - [ ] Return aggregated summary with per-document breakdown (optional)
- [ ] 2.3 Implement deleteWithCascade(documentId: string) in documents.service.ts
  - [ ] Wrap in database transaction (this.dataSource.transaction)
  - [ ] Delete/nullify notifications WHERE resource_id = documentId
  - [ ] Query extraction job IDs WHERE document_id = documentId
  - [ ] Query graph object IDs WHERE extraction_job_id IN (jobs)
  - [ ] Delete graph relationships WHERE src_id IN (objects) OR dst_id IN (objects)
  - [ ] Delete graph objects WHERE extraction_job_id IN (jobs)
  - [ ] Delete extraction jobs WHERE document_id = documentId
  - [ ] Delete document by ID (chunks auto-deleted via CASCADE)
  - [ ] Return deletion summary with counts
  - [ ] Handle transaction rollback on error
- [ ] 2.4 Implement bulkDeleteWithCascade(documentIds: string[]) in documents.service.ts
  - [ ] Wrap in database transaction
  - [ ] Filter document IDs to only those that exist and are accessible
  - [ ] Batch query extraction job IDs for all documents
  - [ ] Batch query graph object IDs for all jobs
  - [ ] Delete graph relationships in batch WHERE src_id IN (objects) OR dst_id IN (objects)
  - [ ] Delete graph objects in batch WHERE extraction_job_id IN (jobs)
  - [ ] Delete extraction jobs in batch WHERE document_id IN (documentIds)
  - [ ] Delete documents in batch WHERE id IN (documentIds)
  - [ ] Return summary with deleted count, notFound IDs, and entity counts
  - [ ] Handle partial success (continue on missing documents)

## 3. Backend - Tests

- [ ] 3.1 Write unit tests for getDeletionImpact
  - [ ] Test successful impact analysis
  - [ ] Test with non-existent document (404)
  - [ ] Test with wrong project scope (404)
  - [ ] Test with missing documents:delete scope (403)
- [ ] 3.2 Write unit tests for deleteWithCascade
  - [ ] Test successful deletion with all cascade steps
  - [ ] Test transaction rollback on error
  - [ ] Test chunk deletion via CASCADE
  - [ ] Test orphaned relationship cleanup
- [ ] 3.3 Write unit tests for bulk deletion
  - [ ] Test successful bulk deletion
  - [ ] Test partial success (some IDs not found)
  - [ ] Test empty IDs array (400)
  - [ ] Test transaction atomicity
- [ ] 3.4 Write E2E tests for deletion endpoints
  - [ ] Test full deletion flow: impact → confirm → delete
  - [ ] Test authorization (403 without scope)
  - [ ] Test bulk deletion with mixed valid/invalid IDs

## 4. Frontend - API Client

- [ ] 4.1 Add deletion methods to documents API client
  - [ ] Create or extend `apps/admin/src/api/documents.ts`
  - [ ] Add getDeletionImpact(documentId: string) method
  - [ ] Add getBulkDeletionImpact(documentIds: string[]) method
  - [ ] Add deleteDocument(documentId: string) method
  - [ ] Add bulkDeleteDocuments(documentIds: string[]) method
  - [ ] Include proper headers (x-org-id, x-project-id, Authorization)
  - [ ] Handle error responses with proper types

## 5. Frontend - Deletion Confirmation Modal

- [ ] 5.1 Create DeletionConfirmationModal component
  - [ ] Create component file `apps/admin/src/components/organisms/DeletionConfirmationModal/index.tsx`
  - [ ] Accept props: documentIds, onConfirm, onCancel, isOpen
  - [ ] Implement loading state for fetching impact
  - [ ] Display impact summary (chunks, jobs, objects, relationships, notifications)
  - [ ] Show warning message: "This action cannot be undone"
  - [ ] Implement confirm and cancel buttons
  - [ ] Disable confirm button during loading/deletion
  - [ ] Handle error state with retry option
  - [ ] Show deletion in-progress state ("Deleting...")
- [ ] 5.2 Style modal with DaisyUI components
  - [ ] Use Modal component from react-daisyui
  - [ ] Style with alert-warning for impact summary
  - [ ] Add loading spinner for async states
  - [ ] Ensure responsive design

## 6. Frontend - Documents Table Integration

- [ ] 6.1 Add delete action to row action menu
  - [ ] Add "Delete" option to rowActions in documents table
  - [ ] Include trash icon (Icon component)
  - [ ] On click, open DeletionConfirmationModal with single document ID
- [ ] 6.2 Add bulk delete action to mass actions toolbar
  - [ ] Add "Delete Selected" button to bulkActions in documents table
  - [ ] Enable only when documents are selected
  - [ ] On click, open DeletionConfirmationModal with multiple document IDs
- [ ] 6.3 Implement deletion flow handlers
  - [ ] Create handleDeleteDocument(documentId: string) function
  - [ ] Create handleBulkDeleteDocuments(documentIds: string[]) function
  - [ ] On success, refresh documents list
  - [ ] On success, show success toast with deletion summary
  - [ ] On error, show error toast with details
  - [ ] Clear selection after successful bulk deletion
- [ ] 6.4 Update existing bulk delete logic
  - [ ] Replace window.confirm with DeletionConfirmationModal
  - [ ] Update handleBulkDelete function to use new modal flow
  - [ ] Remove inline confirmation at line 290-296 in documents/index.tsx

## 7. Frontend - Tests

- [ ] 7.1 Write tests for DeletionConfirmationModal
  - [ ] Test modal opens and fetches impact
  - [ ] Test loading states
  - [ ] Test error states with retry
  - [ ] Test successful deletion flow
  - [ ] Test cancel flow
- [ ] 7.2 Write integration tests for documents table
  - [ ] Test single document deletion from row action
  - [ ] Test bulk deletion from mass actions
  - [ ] Test modal interaction and confirmation
  - [ ] Test table refresh after deletion

## 8. Documentation

- [ ] 8.1 Update API documentation
  - [ ] Add Swagger annotations to new endpoints
  - [ ] Document request/response schemas
  - [ ] Add examples for impact analysis responses
- [ ] 8.2 Update user documentation
  - [ ] Document deletion feature in user guide (if exists)
  - [ ] Add warning about permanent deletion
  - [ ] Document required permissions (documents:delete scope)
- [ ] 8.3 Update CHANGELOG.md
  - [ ] Add entry for new deletion feature
  - [ ] Mention cascade behavior and confirmation modal

## 9. Validation & QA

- [ ] 9.1 Manual testing
  - [ ] Test single document deletion flow end-to-end
  - [ ] Test bulk deletion with 2-5 documents
  - [ ] Test bulk deletion with mixed valid/invalid IDs
  - [ ] Test deletion without documents:delete scope (should fail)
  - [ ] Test deletion with wrong project scope (should fail)
  - [ ] Verify all related entities are deleted (chunks, jobs, objects, relationships)
  - [ ] Verify transaction rollback on error (create artificial error)
- [ ] 9.2 Performance testing
  - [ ] Test deletion impact for document with 100+ chunks
  - [ ] Test deletion impact for document with 10+ extraction jobs
  - [ ] Test bulk deletion of 50+ documents
  - [ ] Monitor query performance and optimize if needed
- [ ] 9.3 Security testing
  - [ ] Verify scope enforcement on all endpoints
  - [ ] Test cross-project deletion prevention
  - [ ] Test SQL injection via document IDs (should be safe with TypeORM)

## 10. Deployment

- [ ] 10.1 Pre-deployment checklist
  - [ ] All tests passing
  - [ ] OpenSpec validation passing (openspec validate --strict)
  - [ ] Code review completed
  - [ ] Performance benchmarks acceptable
- [ ] 10.2 Deploy to staging
  - [ ] Deploy backend changes
  - [ ] Deploy frontend changes
  - [ ] Test full flow in staging environment
- [ ] 10.3 Deploy to production
  - [ ] Deploy backend
  - [ ] Deploy frontend
  - [ ] Monitor error logs for deletion operations
  - [ ] Monitor database performance during deletions
