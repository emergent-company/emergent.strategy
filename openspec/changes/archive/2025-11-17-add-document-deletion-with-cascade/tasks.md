# Implementation Tasks

## 1. Backend - API Endpoints

- [x] 1.1 Create DTOs for deletion operations
  - [x] Create `deletion-impact.dto.ts` with response shape
  - [x] Create `bulk-delete-request.dto.ts` with ids array validation
  - [x] Create `deletion-summary.dto.ts` for response summaries
- [x] 1.2 Add GET /documents/:id/deletion-impact endpoint
  - [x] Add route in `documents.controller.ts`
  - [x] Apply @Scopes('documents:delete') guard
  - [x] Apply @ApiOkResponse with DeletionImpactDto
  - [x] Delegate to service method
- [x] 1.3 Add POST /documents/deletion-impact endpoint (bulk impact analysis)
  - [x] Add route in `documents.controller.ts`
  - [x] Apply @Scopes('documents:delete') guard
  - [x] Apply @ApiOkResponse with BulkDeletionImpactDto
  - [x] Validate request body with BulkDeleteRequestDto
  - [x] Delegate to service method
- [x] 1.4 Add DELETE /documents endpoint (bulk deletion)
  - [x] Add route in `documents.controller.ts`
  - [x] Apply @Scopes('documents:delete') guard
  - [x] Apply @ApiOkResponse with DeletionSummaryDto
  - [x] Validate request body with BulkDeleteRequestDto
  - [x] Delegate to service method

## 2. Backend - Service Layer

- [x] 2.1 Implement getDeletionImpact(documentId: string) in documents.service.ts
  - [x] Verify document exists and user has access (project/org scoping)
  - [x] Query chunks count via COUNT(\*)
  - [x] Query extraction jobs count WHERE document_id = documentId
  - [x] Query graph objects count WHERE extraction_job_id IN (jobs)
  - [x] Query graph relationships count WHERE src_id IN (objects) OR dst_id IN (objects)
  - [x] Query notifications count WHERE resource_type = 'document' AND resource_id = documentId
  - [x] Return impact summary DTO
- [x] 2.2 Implement getBulkDeletionImpact(documentIds: string[]) in documents.service.ts
  - [x] Verify documents exist and user has access (project/org scoping)
  - [x] Query per-document impact for each document ID
  - [x] Aggregate total counts across all document IDs
  - [x] Return response with both totalImpact and perDocument array
  - [x] Include document metadata (id, name, createdAt) in perDocument items
- [x] 2.3 Implement deleteWithCascade(documentId: string) in documents.service.ts
  - [x] Wrap in database transaction (this.dataSource.transaction)
  - [x] Delete/nullify notifications WHERE resource_id = documentId
  - [x] Query extraction job IDs WHERE document_id = documentId
  - [x] Query graph object IDs WHERE extraction_job_id IN (jobs)
  - [x] Delete graph relationships WHERE src_id IN (objects) OR dst_id IN (objects)
  - [x] Delete graph objects WHERE extraction_job_id IN (jobs)
  - [x] Delete extraction jobs WHERE document_id = documentId
  - [x] Delete document by ID (chunks auto-deleted via CASCADE)
  - [x] Return deletion summary with counts
  - [x] Handle transaction rollback on error
- [x] 2.4 Implement bulkDeleteWithCascade(documentIds: string[]) in documents.service.ts
  - [x] Wrap in database transaction
  - [x] Filter document IDs to only those that exist and are accessible
  - [x] Batch query extraction job IDs for all documents
  - [x] Batch query graph object IDs for all jobs
  - [x] Delete graph relationships in batch WHERE src_id IN (objects) OR dst_id IN (objects)
  - [x] Delete graph objects in batch WHERE extraction_job_id IN (jobs)
  - [x] Delete extraction jobs in batch WHERE document_id IN (documentIds)
  - [x] Delete documents in batch WHERE id IN (documentIds)
  - [x] Return summary with deleted count, notFound IDs, and entity counts
  - [x] Handle partial success (continue on missing documents)

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

- [x] 4.1 Add deletion methods to documents API client
  - [x] Create or extend `apps/admin/src/api/documents.ts`
  - [x] Add getDeletionImpact(documentId: string) method
  - [x] Add getBulkDeletionImpact(documentIds: string[]) method
  - [x] Add deleteDocument(documentId: string) method
  - [x] Add bulkDeleteDocuments(documentIds: string[]) method
  - [x] Include proper headers (x-org-id, x-project-id, Authorization)
  - [x] Handle error responses with proper types

## 5. Frontend - Deletion Confirmation Modal

- [x] 5.1 Create DeletionConfirmationModal component
  - [x] Create component file `apps/admin/src/components/organisms/DeletionConfirmationModal/index.tsx`
  - [x] Accept props: documentIds, onConfirm, onCancel, isOpen
  - [x] Implement loading state for fetching impact
  - [x] Display impact summary for single document deletion
  - [x] Display aggregate impact summary for bulk deletion
  - [x] **Display per-document breakdown for bulk deletion (grouped by filename)**
  - [x] Show warning message: "This action cannot be undone"
  - [x] Implement confirm and cancel buttons
  - [x] Disable confirm button during loading/deletion
  - [x] Handle error state with retry option
  - [x] Show deletion in-progress state ("Deleting...")
- [x] 5.2 Style modal with DaisyUI components
  - [x] Use Modal component from react-daisyui
  - [x] Style with alert-warning for impact summary
  - [x] Add loading spinner for async states
  - [x] **Style per-document breakdown with collapsible sections (if >3 documents)**
  - [x] **Highlight documents with high impact (>10 chunks or >5 jobs)**
  - [x] Ensure responsive design

## 6. Frontend - Documents Table Integration

- [x] 6.1 Add delete action to row action menu
  - [x] Add "Delete" option to rowActions in documents table
  - [x] Include trash icon (Icon component)
  - [x] On click, open DeletionConfirmationModal with single document ID
- [x] 6.2 Add bulk delete action to mass actions toolbar
  - [x] Add "Delete Selected" button to bulkActions in documents table
  - [x] Enable only when documents are selected
  - [x] On click, open DeletionConfirmationModal with multiple document IDs
- [x] 6.3 Implement deletion flow handlers
  - [x] Create handleDeleteDocument(documentId: string) function
  - [x] Create handleBulkDeleteDocuments(documentIds: string[]) function
  - [x] On success, refresh documents list
  - [x] On success, show success toast with deletion summary
  - [x] On error, show error toast with details
  - [x] Clear selection after successful bulk deletion
- [x] 6.4 Update existing bulk delete logic
  - [x] Replace window.confirm with DeletionConfirmationModal
  - [x] Update handleBulkDelete function to use new modal flow
  - [x] Remove inline confirmation at line 290-296 in documents/index.tsx

## 7. Frontend - Tests

- [ ] 7.1 Write tests for DeletionConfirmationModal
  - [ ] Test modal opens and fetches impact
  - [ ] Test loading states
  - [ ] Test error states with retry
  - [ ] Test successful deletion flow
  - [ ] Test cancel flow
  - [ ] **Test per-document breakdown display for bulk deletion**
  - [ ] **Test collapsible sections for bulk deletion >3 documents**
  - [ ] **Test highlighting of high-impact documents**
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
