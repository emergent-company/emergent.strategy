# Tasks: Add Multi-Document Upload Support

## 1. Backend Implementation

- [x] 1.1 Create DTO for batch upload request (`IngestionBatchUploadDto`)

  - Define fields: projectId (required), files (multipart)
  - Add validation decorators for batch size limit (max 100)

- [x] 1.2 Create response DTOs for batch results

  - `BatchUploadResultDto` with summary and per-file results
  - `BatchFileResultDto` with filename, status, documentId, chunks, error

- [x] 1.3 Add `ingestBatch` method to `IngestionService`

  - Implemented concurrent processing with p-limit (concurrency: 3)
  - Reuses existing `ingestText` logic per file
  - Collects results and builds summary

- [x] 1.4 Add `POST /api/ingest/upload-batch` endpoint to `IngestionController`

  - Uses `FilesInterceptor` for multiple files
  - Applied `@Scopes('ingest:write')` guard
  - Returns structured batch result response

- [x] 1.5 Add Swagger/OpenAPI documentation for batch endpoint
  - Added @ApiOperation with detailed description
  - Documented multipart/form-data request schema with files array
  - Documented response schema and error responses

## 2. Frontend Implementation

- [x] 2.1 Update file input to accept multiple files

  - Added `multiple` attribute to file input in `DocumentsPage`
  - Updated `onFileInputChange` to handle `FileList` with multiple items

- [x] 2.2 Update drag-and-drop to queue multiple files

  - Modified `onDrop` to collect all files from `dataTransfer.files`
  - Created upload queue state to track pending files

- [x] 2.3 Implement batch upload progress component

  - Created inline progress UI with per-file status
  - Shows file name, size, status icon (pending/uploading/success/error/duplicate)
  - Displays overall progress (X of Y files)

- [x] 2.4 Implement batch upload handler

  - Created `handleBatchUpload` function calling `/api/ingest/upload-batch`
  - Handles FormData construction with multiple files
  - Parses response and updates per-file status

- [ ] 2.5 Add pre-upload validation UI

  - Validate each file against type/size limits before upload
  - Show inline errors for invalid files
  - Allow removing files from queue before upload starts

- [ ] 2.6 Add upload cancellation support

  - Track AbortController for batch request
  - Add "Cancel All" button during upload
  - Clean up UI state on cancellation

- [x] 2.7 Display completion summary
  - Shows toast with summary: "X uploaded, Y duplicates, Z failed"
  - Lists failed files with reasons in toast

## 3. Testing

- [x] 3.1 Add unit tests for `IngestionService.ingestBatch`

  - Test successful batch with all files valid (20 tests passing)
  - Test partial success (some files fail validation)
  - Test duplicate detection across batch
  - Test batch size limit enforcement

- [x] 3.2 Add API e2e tests for `/api/ingest/upload-batch`

  - Test happy path with multiple small files (6 tests passing)
  - Test duplicate detection
  - Test 400 with empty files array
  - Test mixed results (partial success)
  - Test larger batch of 5 files

- [ ] 3.3 Add frontend unit tests for batch upload UI

  - Test multi-file selection updates queue
  - Test progress component renders per-file status
  - Test validation errors display correctly

- [x] 3.4 Add Playwright e2e test for batch upload flow
  - Created `apps/admin/tests/e2e/specs/documents.batch-upload.spec.ts`
  - Tests multi-file upload via file input with progress UI
  - Tests per-file status indicators during batch upload
  - Tests duplicate detection in batch upload
  - Tests dismiss batch progress panel
  - Note: Tests written but auth flow timing out (Zitadel password field issue)

## 4. Documentation

- [ ] 4.1 Update API documentation with batch endpoint examples
- [ ] 4.2 Add user guide section for batch uploads (if docs exist)
