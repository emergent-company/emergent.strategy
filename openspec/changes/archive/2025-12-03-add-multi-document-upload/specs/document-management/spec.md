## ADDED Requirements

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
