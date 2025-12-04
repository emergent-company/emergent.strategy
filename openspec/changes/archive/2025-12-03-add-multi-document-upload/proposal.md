# Change: Add Multi-Document Upload Support

## Why

Currently, users can only upload documents one at a time through the admin UI. This creates friction when onboarding large document sets (e.g., a batch of meeting notes, a collection of specification files, or importing an entire project folder). Users must repeatedly select and wait for each file, making bulk ingestion tedious and time-consuming.

## What Changes

### Backend (API)

- Add new `POST /api/ingest/upload-batch` endpoint accepting multiple files via `multipart/form-data`
- Return structured results per file (success, failure, duplicate detection)
- Process files concurrently with configurable parallelism
- Provide aggregate summary in response (total uploaded, duplicates skipped, failures)

### Frontend (Admin UI)

- Enable multi-file selection in the file input and drag-and-drop zone
- Show batch upload progress with per-file status indicators
- Display summary toast on completion (X uploaded, Y duplicates, Z failed)
- Allow cancellation of pending uploads in a batch

### Document Management

- Track batch uploads with a shared `batch_id` for auditing (optional metadata)
- Support filtering documents by batch in future iterations

## Impact

- Affected specs: `document-management`
- Affected code:
  - `apps/server/src/modules/ingestion/ingestion.controller.ts` - new batch endpoint
  - `apps/server/src/modules/ingestion/ingestion.service.ts` - batch processing logic
  - `apps/admin/src/pages/admin/apps/documents/index.tsx` - multi-file upload UI
  - `apps/admin/src/components/molecules/FileUploader/index.tsx` - FilePond multi-file config
- No breaking changes to existing single-file upload API
- Backward compatible with current document ingestion workflow
