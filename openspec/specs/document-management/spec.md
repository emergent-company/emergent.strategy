# document-management Specification

## Purpose
TBD - created by archiving change add-document-deletion-with-cascade. Update Purpose after archive.
## Requirements
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

### Requirement: Document Metadata for Batch Uploads

The system SHALL support associating custom metadata with documents during ingestion to enable categorization and filtering of batch-uploaded documents.

#### Scenario: Upload document with custom filename

- **WHEN** a document is uploaded via POST /ingest/upload with a custom filename parameter
- **THEN** the system:
  - Stores the document with the specified filename
  - Uses the filename for display and search purposes
  - Overrides the original uploaded file name

#### Scenario: Query documents by filename pattern

- **WHEN** a user searches for documents with filename matching a pattern (e.g., "Genesis\*")
- **THEN** the system:
  - Returns all documents with filenames matching the pattern
  - Supports wildcard matching
  - Orders results by relevance or creation date

#### Scenario: Batch upload tracking

- **WHEN** multiple documents are uploaded in sequence from the same source
- **THEN** the system:
  - Accepts each document independently
  - Returns unique document ID for each upload
  - Allows tracking upload success/failure per document
  - Supports filtering documents by project_id to view all documents from a batch

**Note:** Current ingestion API already supports custom filename via IngestionUploadDto.filename. This requirement documents the expected behavior for batch upload scenarios where tracking multiple documents is important.

### Requirement: Batch Document Upload API

The system SHALL provide an API endpoint for uploading multiple documents in a single request.

#### Scenario: Successful batch upload

- **WHEN** a user with `ingest:write` scope sends POST /api/ingest/upload-batch with multiple files and a projectId
- **THEN** the system:
  - Processes each file using the existing ingestion pipeline
  - Returns a structured response with per-file results and summary
  - Response includes: `{ summary: { total, successful, duplicates, failed }, results: [{ filename, status, documentId?, chunks?, error? }] }`

#### Scenario: Partial batch failure

- **WHEN** a batch upload contains some valid files and some invalid files (wrong type, too large, empty)
- **THEN** the system:
  - Processes all valid files successfully
  - Reports errors for invalid files without stopping the batch
  - Returns HTTP 200 with mixed results (not 4xx for partial success)

#### Scenario: Duplicate detection in batch

- **WHEN** a batch upload contains files that already exist in the project (by content hash)
- **THEN** the system:
  - Skips re-ingestion for duplicates
  - Returns `status: 'duplicate'` with the existing documentId for each duplicate
  - Continues processing remaining non-duplicate files

#### Scenario: Batch upload without proper scope

- **WHEN** a user without `ingest:write` scope attempts batch upload
- **THEN** the system returns 403 with `missing_scopes: ["ingest:write"]`

#### Scenario: Empty batch upload

- **WHEN** a user sends POST /api/ingest/upload-batch with no files
- **THEN** the system returns 400 with error code "files-required"

#### Scenario: Batch size limit exceeded

- **WHEN** a user attempts to upload more than 20 files in a single batch
- **THEN** the system returns 400 with error code "batch-limit-exceeded" and message indicating the limit

### Requirement: Multi-File Upload UI

The system SHALL provide a user interface for selecting and uploading multiple documents simultaneously.

#### Scenario: Multi-file selection via file picker

- **WHEN** a user clicks the upload button in the Documents page
- **THEN** the file picker allows selecting multiple files at once

#### Scenario: Multi-file drag and drop

- **WHEN** a user drags multiple files onto the upload drop zone
- **THEN** all dropped files are queued for upload

#### Scenario: Batch upload progress display

- **WHEN** a batch upload is in progress
- **THEN** the UI displays:
  - Overall progress (X of Y files processed)
  - Per-file status indicators (pending, uploading, processing, complete, error, duplicate)
  - Estimated time remaining based on average processing time

#### Scenario: Batch upload completion summary

- **WHEN** a batch upload completes
- **THEN** the UI displays a summary toast:
  - "Uploaded X documents, Y duplicates skipped, Z failed"
  - Failed files are listed with error reasons

#### Scenario: File validation before upload

- **WHEN** a user selects files for batch upload
- **THEN** the UI:
  - Validates each file against accepted types and size limit (10MB)
  - Shows validation errors inline without blocking valid files
  - Allows removal of individual files from the batch before starting

### Requirement: Batch Upload Cancellation

The system SHALL allow users to cancel pending uploads within a batch.

#### Scenario: Cancel entire batch

- **WHEN** a user clicks "Cancel All" during a batch upload
- **THEN** the system:
  - Cancels all pending file uploads
  - Allows already-completed uploads to remain
  - Updates UI to show cancelled status

#### Scenario: Remove individual file before upload starts

- **WHEN** a user removes a specific file from the upload queue before processing begins
- **THEN** the file is removed from the batch and not uploaded

### Requirement: Document Chunk LLM Alignment Guidance

The system SHALL provide guidance on the Document Processing settings page to help users align their document chunk sizes with their LLM extraction batch size for optimal extraction performance.

#### Scenario: Display current LLM batch size

- **WHEN** a user views the Document Processing settings page
- **THEN** the system displays the current project's LLM extraction batch size from extraction_config
- **AND** if no extraction_config is set, uses the server default of 30,000 characters

#### Scenario: Calculate and display suggested chunk sizes

- **WHEN** a user views the Document Processing settings page
- **THEN** the system calculates suggested document chunk sizes based on LLM batch size:
  - Suggested max chunk size = LLM batch size / 4
  - Suggested min chunk size = LLM batch size / 10
- **AND** displays these suggestions alongside the current configured values

#### Scenario: Show alignment status indicator

- **WHEN** current max chunk size is within 20% of suggested max chunk size
- **THEN** the system displays a "Well aligned" status with success color

- **WHEN** current max chunk size is within 2x of suggested max chunk size (but not within 20%)
- **THEN** the system displays a "Slightly misaligned" status with warning color

- **WHEN** current max chunk size differs by more than 2x from suggested max chunk size
- **THEN** the system displays a "Misaligned" status with error color

#### Scenario: Apply suggested settings

- **WHEN** alignment status is not "Well aligned" and user clicks "Apply Suggested Settings"
- **THEN** the system updates the form with:
  - maxChunkSize = suggested max chunk size
  - minChunkSize = suggested min chunk size
- **AND** the changes are not saved until user clicks "Save Settings"

#### Scenario: Link to LLM settings

- **WHEN** the LLM batch size is displayed in the alignment card
- **THEN** it is rendered as a link to the LLM Settings page (/admin/settings/project/llm-settings)
- **AND** clicking the link navigates to the LLM Settings page

### Requirement: Aligned Document Chunk Presets

The system SHALL provide document chunking presets that are aligned with LLM extraction batch size presets to ensure optimal extraction performance.

#### Scenario: Precise preset aligned with LLM Conservative

- **WHEN** user selects the "Precise" chunking preset
- **THEN** the system applies:
  - maxChunkSize: 3,750 characters (aligned with LLM 15,000 / 4)
  - minChunkSize: 1,500 characters (aligned with LLM 15,000 / 10)
  - strategy: sentence
- **AND** displays "Aligns with LLM: Conservative (15K)" label

#### Scenario: Balanced preset aligned with LLM Balanced

- **WHEN** user selects the "Balanced" chunking preset
- **THEN** the system applies:
  - maxChunkSize: 7,500 characters (aligned with LLM 30,000 / 4)
  - minChunkSize: 3,000 characters (aligned with LLM 30,000 / 10)
  - strategy: sentence
- **AND** displays "Aligns with LLM: Balanced (30K)" label

#### Scenario: Comprehensive preset aligned with LLM Aggressive

- **WHEN** user selects the "Comprehensive" chunking preset
- **THEN** the system applies:
  - maxChunkSize: 15,000 characters (aligned with LLM 60,000 / 4)
  - minChunkSize: 6,000 characters (aligned with LLM 60,000 / 10)
  - strategy: paragraph
- **AND** displays "Aligns with LLM: Aggressive (60K)" label

#### Scenario: Default configuration uses aligned values

- **WHEN** a project has no chunking_config set
- **THEN** the Document Processing settings page displays default values:
  - maxChunkSize: 7,500 characters
  - minChunkSize: 3,000 characters
  - strategy: sentence

### Requirement: Real-Time Document Status Updates

The document management system SHALL emit real-time events when document status changes occur, enabling connected clients to receive updates without manual refresh.

#### Scenario: Embedding progress update event

- **GIVEN** a document has chunks being processed for embeddings
- **WHEN** a chunk embedding is completed
- **THEN** an `entity.updated` event SHALL be emitted with the document ID
- **AND** the event payload SHALL include the updated `embeddedChunks` count
- **AND** all connected clients viewing that project SHALL receive the event

#### Scenario: Document creation event

- **GIVEN** a user uploads a new document
- **WHEN** the document is successfully created
- **THEN** an `entity.created` event SHALL be emitted with the document ID
- **AND** all connected clients viewing that project SHALL receive the event

#### Scenario: Document deletion event

- **GIVEN** a user deletes a document
- **WHEN** the document is successfully deleted
- **THEN** an `entity.deleted` event SHALL be emitted with the document ID
- **AND** all connected clients viewing that project SHALL receive the event

### Requirement: Server-Sent Events Endpoint

The server SHALL provide an SSE endpoint for real-time event streaming to authenticated clients.

#### Scenario: Authenticated SSE connection

- **GIVEN** a client makes a GET request to `/api/events/stream`
- **AND** the request includes a valid JWT token
- **AND** the request includes a valid `X-Project-Id` header
- **WHEN** the connection is established
- **THEN** the server SHALL return a `text/event-stream` response
- **AND** the server SHALL send a `connected` event with connection metadata

#### Scenario: Project-scoped events

- **GIVEN** an active SSE connection for project A
- **WHEN** events are emitted for project A and project B
- **THEN** only events for project A SHALL be sent to the client
- **AND** events for project B SHALL NOT be sent

#### Scenario: Heartbeat mechanism

- **GIVEN** an active SSE connection
- **WHEN** 30 seconds have elapsed since the last event
- **THEN** the server SHALL send a `heartbeat` event
- **AND** the heartbeat SHALL include a timestamp

#### Scenario: Unauthenticated request rejection

- **GIVEN** a client makes a GET request to `/api/events/stream`
- **WHEN** the request does not include a valid JWT token
- **THEN** the server SHALL return a 401 Unauthorized response

### Requirement: Event Bus Infrastructure

The server SHALL provide a central event bus for publishing and subscribing to entity events.

#### Scenario: Event publishing

- **GIVEN** a service needs to emit an entity event
- **WHEN** the service calls `eventsService.emit(event)`
- **THEN** the event SHALL be published to the in-memory event bus
- **AND** all subscribers for that project channel SHALL receive the event

#### Scenario: Event payload structure

- **GIVEN** an entity event is emitted
- **THEN** the event payload SHALL include:
  - `type`: One of `entity.created`, `entity.updated`, `entity.deleted`, `entity.batch`
  - `entity`: The entity type (e.g., `document`, `chunk`, `extraction_job`)
  - `id`: The entity ID
  - `projectId`: The project ID
  - `data`: Optional partial update payload
  - `timestamp`: ISO 8601 timestamp

### Requirement: Semantic Chunking Strategies

The system SHALL support multiple chunking strategies for document ingestion, allowing users to preserve semantic boundaries (sentences, paragraphs) when splitting documents into chunks.

#### Scenario: Ingest document with sentence-preserving chunking

- **WHEN** a user uploads a document via POST /ingest/upload with `chunkingStrategy: 'sentence'`
- **THEN** the system:
  - Splits the document at sentence boundaries (`.`, `!`, `?` followed by whitespace)
  - Combines sentences into chunks up to the configured `maxChunkSize`
  - Never breaks a sentence mid-word unless the sentence itself exceeds `maxChunkSize`
  - Stores each chunk with metadata indicating `boundaryType: 'sentence'`
  - Returns the document ID and chunk count

#### Scenario: Ingest document with paragraph-preserving chunking

- **WHEN** a user uploads a document via POST /ingest/upload with `chunkingStrategy: 'paragraph'`
- **THEN** the system:
  - Splits the document at paragraph boundaries (`\n\n` or blank lines)
  - Detects markdown headers (`^#+\s`) as section boundaries
  - Combines paragraphs into chunks up to the configured `maxChunkSize`
  - Falls back to sentence-level splitting for paragraphs exceeding `maxChunkSize`
  - Stores each chunk with metadata indicating `boundaryType: 'paragraph'` or `'section'`
  - Returns the document ID and chunk count

#### Scenario: Ingest document with default character chunking

- **WHEN** a user uploads a document via POST /ingest/upload without specifying `chunkingStrategy`
- **THEN** the system:
  - Uses the existing character-based chunking (split at fixed 1200-character boundaries)
  - Maintains full backward compatibility with existing behavior
  - Does not store additional metadata for character-based chunks

#### Scenario: Ingest document with custom chunking options

- **WHEN** a user uploads a document with `chunkingOptions: { maxChunkSize: 2000, minChunkSize: 200 }`
- **THEN** the system:
  - Respects the custom `maxChunkSize` (2000 characters) instead of default (1200)
  - Skips combining additional sentences/paragraphs if chunk would be smaller than `minChunkSize`
  - Validates that `maxChunkSize` is between 100 and 10000
  - Validates that `minChunkSize` is between 10 and 1000

#### Scenario: Chunking options validation failure

- **WHEN** a user provides invalid chunking options (e.g., `maxChunkSize: 50000` or `minChunkSize: -10`)
- **THEN** the system:
  - Returns 400 Bad Request with validation error details
  - Does not create any chunks or document records
  - Includes field-level error messages in the response

### Requirement: Chunk Metadata Storage

The system SHALL store chunking metadata with each chunk to enable debugging, analytics, and potential re-processing.

#### Scenario: Chunk metadata includes strategy and offsets

- **WHEN** a document is chunked using any strategy other than `character`
- **THEN** each chunk record includes a `metadata` JSONB field containing:
  - `strategy`: The chunking strategy used (`sentence` or `paragraph`)
  - `startOffset`: Character offset in the original document where this chunk begins
  - `endOffset`: Character offset in the original document where this chunk ends
  - `boundaryType`: Type of boundary that ended this chunk (`sentence`, `paragraph`, `section`, or `character`)

#### Scenario: Query chunks with metadata

- **WHEN** a user fetches chunks via GET /chunks?documentId=:id
- **THEN** each chunk in the response includes the `metadata` field if present
- **AND** the `metadata` field is `null` for chunks created before this feature or with `character` strategy

### Requirement: URL Ingestion with Chunking Strategy

The system SHALL support chunking strategy selection for URL-based ingestion.

#### Scenario: Ingest URL with sentence chunking

- **WHEN** a user ingests a URL via POST /ingest/url with `chunkingStrategy: 'sentence'`
- **THEN** the system:
  - Fetches and extracts text from the URL
  - Applies sentence-preserving chunking to the extracted text
  - Stores chunks with appropriate metadata
  - Returns the document ID and chunk count

#### Scenario: Ingest URL with paragraph chunking

- **WHEN** a user ingests a URL via POST /ingest/url with `chunkingStrategy: 'paragraph'`
- **THEN** the system:
  - Fetches and extracts text from the URL
  - Applies paragraph-preserving chunking to the extracted text
  - Stores chunks with appropriate metadata
  - Returns the document ID and chunk count

### Requirement: Document External Source Tracking

The system SHALL support tracking document source types and external source metadata to enable importing documents from external sources beyond file uploads.

#### Scenario: Upload document defaults to upload source type

- **WHEN** a document is uploaded via POST /ingest/upload without external source parameters
- **THEN** the system SHALL set `source_type` to `'upload'`
- **AND** the system SHALL leave `external_source_id` as null

#### Scenario: Create document from external source

- **WHEN** a document is created from an external source (Google Drive, URL, etc.)
- **THEN** the system SHALL set `source_type` to the appropriate provider type
- **AND** the system SHALL link to the corresponding `ExternalSource` record via `external_source_id`
- **AND** the system SHALL set `sync_version` to track import versions

#### Scenario: Query documents by source type

- **WHEN** a user queries documents with a `source_type` filter
- **THEN** the system SHALL return only documents matching the specified source type
- **AND** the system SHALL support filtering by multiple source types

#### Scenario: Query documents by external source

- **WHEN** a user queries documents with an `external_source_id` filter
- **THEN** the system SHALL return all document versions from that external source
- **AND** the system SHALL order by `sync_version` descending (newest first)

### Requirement: Document Version Tracking for External Sources

The system SHALL support multiple document versions from the same external source to track sync history.

#### Scenario: Create new version on sync

- **WHEN** an external source is synced and content has changed
- **THEN** the system SHALL create a new Document record
- **AND** the system SHALL link it to the same ExternalSource
- **AND** the system SHALL increment `sync_version`
- **AND** the system SHALL process through standard ingestion (chunking, embedding)

#### Scenario: Identify latest version

- **WHEN** querying documents for an external source
- **THEN** the system SHALL indicate which document is the latest version
- **AND** the system SHALL provide access to previous versions for history

### Requirement: Google Drive Public File Access

The system SHALL support downloading publicly shared files from Google Drive without requiring OAuth authentication.

#### Scenario: Download publicly shared Google Drive file

- **WHEN** the system receives a Google Drive file ID for a file shared with "anyone with the link"
- **THEN** the system SHALL use the Google Drive API v3 to download the file content
- **AND** the system SHALL extract file metadata (name, mimeType, size, modifiedTime)
- **AND** the system SHALL return the file content for ingestion

#### Scenario: Google Drive file not publicly accessible

- **WHEN** the system attempts to download a Google Drive file that is not publicly shared
- **THEN** the system SHALL return an error indicating the file is not accessible
- **AND** the error message SHALL suggest the user make the file public or use "anyone with the link" sharing

#### Scenario: Google Drive file not found

- **WHEN** the system attempts to download a Google Drive file ID that does not exist
- **THEN** the system SHALL return a 404 error with a clear message
- **AND** the system SHALL suggest verifying the link is correct

#### Scenario: Google Drive unsupported file type

- **WHEN** the system receives a Google Drive file with an unsupported MIME type
- **THEN** the system SHALL return a 400 error listing supported file types
- **AND** the system SHALL NOT attempt to download or process the file

#### Scenario: Google Docs/Sheets/Slides export

- **WHEN** the system receives a Google Docs, Sheets, or Slides file
- **THEN** the system SHALL export the file to an appropriate format:
  - Google Docs -> text/plain or application/pdf
  - Google Sheets -> text/csv
  - Google Slides -> application/pdf
- **AND** the system SHALL use the exported content for ingestion

