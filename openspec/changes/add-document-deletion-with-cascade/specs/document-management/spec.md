# Document Management Capability - Deltas

## ADDED Requirements

### Requirement: Document Deletion Impact Analysis

The system SHALL provide an endpoint to analyze the impact of deleting one or more documents before the actual deletion occurs.

#### Scenario: Single document impact analysis

- **WHEN** a user requests deletion impact for a document via GET /documents/:id/deletion-impact
- **THEN** the system returns a summary including:
  - Document metadata (id, name, created_at)
  - Chunks count that will be deleted
  - Extraction jobs count that will be deleted
  - Graph objects count that will be deleted (objects created by extraction jobs)
  - Graph relationships count that will be deleted (relationships involving deleted objects)
  - Notifications count that reference the document

#### Scenario: Bulk deletion impact analysis

- **WHEN** a user requests deletion impact for multiple documents via POST /documents/deletion-impact with an array of document IDs
- **THEN** the system returns an aggregated summary across all documents including:
  - Total documents to be deleted
  - Total chunks to be deleted
  - Total extraction jobs to be deleted
  - Total graph objects to be deleted
  - Total graph relationships to be deleted
  - Total notifications to be deleted
  - Per-document breakdown (optional, for detailed view)

#### Scenario: Impact analysis for non-existent document

- **WHEN** a user requests deletion impact for a document that does not exist
- **THEN** the system returns 404 with error code "not-found"

#### Scenario: Impact analysis without proper scope

- **WHEN** a user without documents:delete scope requests deletion impact
- **THEN** the system returns 403 with missing_scopes: ["documents:delete"]

### Requirement: Single Document Hard Deletion

The system SHALL support hard deletion of a single document and all its related entities via CASCADE operations.

#### Scenario: Successful single document deletion

- **WHEN** a user with documents:delete scope sends DELETE /documents/:id
- **THEN** the system:
  - Deletes the document record
  - Automatically deletes all chunks (via database CASCADE on document_id FK)
  - Deletes all extraction jobs where document_id matches
  - Deletes all graph objects where extraction_job_id matches deleted jobs
  - Deletes all graph relationships where src_id or dst_id matches deleted objects
  - Deletes or nullifies notifications referencing the document
  - Returns 200 with { status: "deleted", summary: { chunks: N, extraction_jobs: N, graph_objects: N, relationships: N, notifications: N } }

#### Scenario: Delete non-existent document

- **WHEN** a user attempts to delete a document that does not exist
- **THEN** the system returns 404 with error code "not-found"

#### Scenario: Delete document without proper scope

- **WHEN** a user without documents:delete scope attempts to delete a document
- **THEN** the system returns 403 with missing_scopes: ["documents:delete"]

#### Scenario: Delete document from wrong project

- **WHEN** a user attempts to delete a document with x-project-id header that does not match the document's projectId
- **THEN** the system returns 404 with error code "not-found" (scoped visibility)

### Requirement: Bulk Document Hard Deletion

The system SHALL support hard deletion of multiple documents in a single request with full cascade behavior.

#### Scenario: Successful bulk document deletion

- **WHEN** a user with documents:delete scope sends DELETE /documents with { ids: ["id1", "id2", "id3"] }
- **THEN** the system:
  - Deletes all specified documents
  - Cascades deletion to all related entities (chunks, extraction jobs, objects, relationships)
  - Returns 200 with { status: "deleted", count: N, summary: { chunks: N, extraction_jobs: N, graph_objects: N, relationships: N, notifications: N } }

#### Scenario: Bulk deletion with partial success

- **WHEN** a user attempts to bulk delete documents where some IDs do not exist or are not accessible
- **THEN** the system:
  - Deletes only the documents that exist and are accessible
  - Returns 200 with { status: "partial", deleted: N, notFound: ["id1", "id2"], summary: {...} }

#### Scenario: Bulk deletion with empty array

- **WHEN** a user sends DELETE /documents with an empty ids array
- **THEN** the system returns 400 with error code "bad-request" and message "At least one document ID required"

#### Scenario: Bulk deletion without proper scope

- **WHEN** a user without documents:delete scope attempts bulk deletion
- **THEN** the system returns 403 with missing_scopes: ["documents:delete"]

### Requirement: Frontend Deletion Confirmation

The system SHALL provide a user-friendly deletion confirmation modal in the admin UI that displays full deletion impact before executing the operation.

#### Scenario: Single document deletion from row action

- **WHEN** a user clicks the delete action in a document row's action menu
- **THEN** the system:
  - Fetches deletion impact via GET /documents/:id/deletion-impact
  - Displays a modal with:
    - Document name and metadata
    - Full breakdown of entities to be deleted (chunks, jobs, objects, relationships)
    - Warning message: "This action cannot be undone"
    - Cancel and Confirm buttons
  - On confirm, executes DELETE /documents/:id
  - On success, removes document from table and shows success toast
  - On error, shows error toast with details

#### Scenario: Bulk deletion from mass actions

- **WHEN** a user selects multiple documents and clicks the bulk delete action
- **THEN** the system:
  - Fetches deletion impact via POST /documents/deletion-impact with selected IDs
  - Displays a modal with:
    - Total documents selected
    - Aggregated summary of all entities to be deleted
    - Warning message: "This action cannot be undone"
    - Cancel and Confirm buttons
  - On confirm, executes DELETE /documents with selected IDs
  - On success, removes documents from table and shows success toast
  - On error, shows error toast with partial success details if applicable

#### Scenario: Deletion modal loading state

- **WHEN** the deletion impact is being fetched
- **THEN** the modal displays a loading spinner and the Confirm button is disabled

#### Scenario: Deletion modal error state

- **WHEN** the deletion impact fetch fails
- **THEN** the modal displays an error message and provides a Retry button

#### Scenario: Deletion operation in progress

- **WHEN** the user confirms deletion and the DELETE request is in flight
- **THEN** the modal displays a loading state with "Deleting..." message and all buttons are disabled

### Requirement: Cascade Deletion Implementation

The system SHALL implement cascade deletion logic that handles all entity relationships correctly and atomically.

#### Scenario: Cascade deletion transaction integrity

- **WHEN** a document is deleted
- **THEN** all related entity deletions occur within a single database transaction
- **AND** if any deletion step fails, the entire operation is rolled back

#### Scenario: Orphaned graph objects cleanup

- **WHEN** graph objects are deleted as part of document deletion
- **THEN** the system also deletes all graph relationships where src_id or dst_id references the deleted objects

#### Scenario: Extraction job cleanup

- **WHEN** extraction jobs are deleted as part of document deletion
- **THEN** the system deletes all graph objects with extraction_job_id matching the deleted jobs

#### Scenario: Notification reference handling

- **WHEN** a document is deleted and notifications reference it
- **THEN** the system either:
  - Soft-deletes the notifications, OR
  - Nullifies the resource_id field if the notification schema supports it

#### Scenario: Chunk deletion via database CASCADE

- **WHEN** a document is deleted
- **THEN** all chunks are automatically deleted by the database via the existing CASCADE foreign key constraint on document_id
