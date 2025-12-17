# Tasks: External Sources Framework

## Phase 1A: Core Framework Infrastructure

### 1. Database Schema

- [ ] 1.1 Create migration for `kb.external_sources` table:
  - `id UUID PRIMARY KEY`
  - `project_id UUID NOT NULL` (FK to projects)
  - `provider_type TEXT NOT NULL` (enum: google_drive, dropbox, url, etc.)
  - `external_id TEXT NOT NULL` (provider-specific ID)
  - `original_url TEXT NOT NULL`
  - `normalized_url TEXT NOT NULL`
  - `display_name TEXT`
  - `mime_type TEXT`
  - `sync_policy TEXT DEFAULT 'manual'` (manual, on_access, periodic, webhook)
  - `sync_interval_minutes INT`
  - `last_checked_at TIMESTAMPTZ`
  - `last_synced_at TIMESTAMPTZ`
  - `last_etag TEXT`
  - `status TEXT DEFAULT 'active'` (active, error, disabled)
  - `error_count INT DEFAULT 0`
  - `last_error TEXT`
  - `last_error_at TIMESTAMPTZ`
  - `provider_metadata JSONB`
  - `created_at TIMESTAMPTZ`
  - `updated_at TIMESTAMPTZ`
- [ ] 1.2 Add unique index on `(project_id, provider_type, external_id)`
- [ ] 1.3 Add index on `(status, sync_policy, last_checked_at)` for sync worker queries
- [ ] 1.4 Create migration to add columns to `kb.documents`:
  - `source_type TEXT DEFAULT 'upload'`
  - `external_source_id UUID` (FK to external_sources)
  - `sync_version INT DEFAULT 1`
- [ ] 1.5 Add index on `documents(external_source_id)`
- [ ] 1.6 Create `ExternalSource` TypeORM entity
- [ ] 1.7 Update `Document` TypeORM entity with new fields and relationship
- [ ] 1.8 Write migration rollback tests

### 2. Provider Framework

- [ ] 2.1 Define `ExternalSourceProvider` interface in `apps/server/src/modules/external-sources/interfaces/`
- [ ] 2.2 Define supporting interfaces:
  - `ExternalSourceReference`
  - `AccessCheckResult`
  - `SourceMetadata`
  - `FetchedContent`
  - `RateLimitConfig`
- [ ] 2.3 Create `ExternalSourceProviderRegistry` service to manage providers
- [ ] 2.4 Implement provider auto-detection from URL
- [ ] 2.5 Write unit tests for provider registry

### 3. Google Drive Provider (Phase 1)

- [ ] 3.1 Create `GoogleDriveProvider` implementing `ExternalSourceProvider`
- [ ] 3.2 Implement `canHandle()` with URL pattern matching
- [ ] 3.3 Implement `parseUrl()` for all Google Drive/Docs URL formats
- [ ] 3.4 Implement `checkAccess()` using Google Drive API v3 (public files)
- [ ] 3.5 Implement `fetchMetadata()` to get file name, type, size
- [ ] 3.6 Implement `fetchContent()`:
  - Direct download for regular files
  - Export to text for Google Docs
  - Export to CSV for Google Sheets
  - Export to PDF for Google Slides
- [ ] 3.7 Implement `checkForUpdates()` using etag/modifiedTime
- [ ] 3.8 Add rate limiting (60 req/min, 1000 req/day)
- [ ] 3.9 Write unit tests for URL parsing (all formats)
- [ ] 3.10 Write integration tests with mocked Google API

### 4. URL Provider (Refactor Existing)

- [ ] 4.1 Create `UrlProvider` implementing `ExternalSourceProvider`
- [ ] 4.2 Refactor existing URL fetch logic into provider
- [ ] 4.3 Implement basic change detection (ETag, Last-Modified headers)
- [ ] 4.4 Write unit tests

## Phase 1B: Core Services

### 5. External Sources Service

- [ ] 5.1 Create `ExternalSourcesModule` in `apps/server/src/modules/external-sources/`
- [ ] 5.2 Implement `ExternalSourcesService` with methods:
  - `importFromUrl(url, projectId, options)` - Main import entry point
  - `findExistingSource(projectId, reference)` - Deduplication lookup
  - `createSource(projectId, reference, metadata)` - Create new source record
  - `updateSyncState(sourceId, state)` - Update after sync
  - `markError(sourceId, error)` - Record sync failure
  - `getSourcesForSync(policy, limit)` - Query sources due for sync
- [ ] 5.3 Implement deduplication logic (external_id → normalized_url → content_hash)
- [ ] 5.4 Integrate with ingestion pipeline for document creation
- [ ] 5.5 Write unit tests for service methods
- [ ] 5.6 Write integration tests for full import flow

### 6. External Triggers API

- [ ] 6.1 Create `ExternalSourcesController` with endpoints:
  - `POST /api/external-sources/import` - Import from URL
  - `GET /api/external-sources/:id` - Get source details
  - `GET /api/external-sources` - List sources (with filters)
  - `POST /api/external-sources/:id/sync` - Trigger manual sync
  - `DELETE /api/external-sources/:id` - Remove source (keeps documents)
- [ ] 6.2 Define DTOs:
  - `ImportExternalSourceDto`
  - `ExternalSourceResponseDto`
  - `ExternalSourceListQueryDto`
- [ ] 6.3 Add proper authorization (project scope)
- [ ] 6.4 Write E2E tests for API endpoints

### 7. Webhook Infrastructure

- [ ] 7.1 Create webhook endpoint: `POST /api/external-sources/webhook/:provider`
- [ ] 7.2 Implement webhook signature validation (provider-specific)
- [ ] 7.3 Implement webhook payload parsing
- [ ] 7.4 Queue sync jobs for affected sources
- [ ] 7.5 Add webhook registration endpoint (for future OAuth providers)
- [ ] 7.6 Write tests for webhook handling

## Phase 1C: Sync Infrastructure

### 8. Sync Worker

- [ ] 8.1 Create `ExternalSourceSyncWorker` using BullMQ
- [ ] 8.2 Implement job types:
  - `sync_periodic` - Scheduled periodic sync
  - `sync_retry` - Retry failed import
  - `sync_webhook` - Webhook-triggered sync
  - `sync_manual` - User-requested sync
- [ ] 8.3 Implement sync job processing:
  - Load source and provider
  - Check for updates
  - Fetch content if changed
  - Create new document version
  - Update sync state
- [ ] 8.4 Implement retry logic with exponential backoff:
  - Max 5 retries
  - Initial delay: 1s
  - Max delay: 1 hour
  - Backoff multiplier: 2x
- [ ] 8.5 Create scheduler for periodic sync polling
- [ ] 8.6 Add Langfuse tracing for sync jobs
- [ ] 8.7 Write unit tests for worker logic
- [ ] 8.8 Write integration tests for sync scenarios

### 9. Error Handling and Recovery

- [ ] 9.1 Define error types and codes:
  - `SOURCE_NOT_ACCESSIBLE`
  - `SOURCE_NOT_FOUND`
  - `RATE_LIMITED`
  - `UNSUPPORTED_TYPE`
  - `FILE_TOO_LARGE`
  - `NETWORK_ERROR`
  - `PROVIDER_ERROR`
- [ ] 9.2 Implement error tracking per source
- [ ] 9.3 Implement automatic disable after max failures
- [ ] 9.4 Add admin API to view/clear errors
- [ ] 9.5 Add notifications for persistent failures

## Phase 1D: Chat Integration

### 10. Link Detection

- [ ] 10.1 Create `ExternalLinkDetector` service
- [ ] 10.2 Integrate with provider registry for detection
- [ ] 10.3 Extract URLs from chat messages
- [ ] 10.4 Match against registered providers
- [ ] 10.5 Write unit tests for detection (various formats, edge cases)

### 11. Chat Import Tool

- [ ] 11.1 Create `ImportDocumentTool` MCP tool
- [ ] 11.2 Implement tool execution:
  - Detect provider from URL
  - Check access
  - Import or return existing
  - Return status for chat response
- [ ] 11.3 Register tool in chat MCP server
- [ ] 11.4 Add progress reporting during import
- [ ] 11.5 Write unit tests for tool
- [ ] 11.6 Write E2E test for chat import flow

### 12. Chat Context Awareness

- [ ] 12.1 Track documents imported in current conversation
- [ ] 12.2 Add imported documents to conversation context
- [ ] 12.3 Update system prompt with import capabilities
- [ ] 12.4 Enable immediate queries on imported documents
- [ ] 12.5 Write integration tests

## Phase 1E: Testing and Documentation

### 13. End-to-End Testing

- [ ] 13.1 E2E: Import Google Drive document via chat
- [ ] 13.2 E2E: Import via API endpoint
- [ ] 13.3 E2E: Attempt import of inaccessible document
- [ ] 13.4 E2E: Deduplication (same source twice)
- [ ] 13.5 E2E: Query imported document immediately
- [ ] 13.6 E2E: Manual sync trigger
- [ ] 13.7 E2E: Periodic sync execution
- [ ] 13.8 E2E: Error recovery and retry

### 14. Documentation

- [ ] 14.1 API documentation for external sources endpoints
- [ ] 14.2 Architecture documentation for provider framework
- [ ] 14.3 Guide: Adding new external source providers
- [ ] 14.4 User documentation: Importing from Google Drive
- [ ] 14.5 Runbook: Troubleshooting sync failures

---

## Phase 2 Tasks (Future - Out of Scope)

### Future Providers

- [ ] Dropbox provider (public shared links)
- [ ] OneDrive provider (public shared links)
- [ ] S3 provider (pre-signed URLs)
- [ ] Notion provider (public pages)
- [ ] Confluence provider (public pages)

### OAuth Integration

- [ ] OAuth flow for Google Drive (private files)
- [ ] OAuth flow for Dropbox
- [ ] Token refresh and management
- [ ] Per-user credential storage

### Advanced Features

- [ ] Folder-level sync (import entire Drive folder)
- [ ] Real-time streaming sync
- [ ] Source-level permissions
- [ ] UI for managing external sources

---

## Dependencies Graph

```
Phase 1A (Foundation):
  1 (Schema) ──┬──> 2 (Provider Framework)
               └──> 6 (API basics)

  2 (Provider Framework) ──> 3 (Google Drive Provider)
                         ──> 4 (URL Provider)

Phase 1B (Services):
  1 + 2 + 3 ──> 5 (External Sources Service)
  5 ──> 6 (API endpoints)
  5 ──> 7 (Webhooks)

Phase 1C (Sync):
  5 ──> 8 (Sync Worker)
  8 ──> 9 (Error Handling)

Phase 1D (Chat):
  2 ──> 10 (Link Detection)
  5 + 10 ──> 11 (Chat Import Tool)
  11 ──> 12 (Context Awareness)

Phase 1E (Testing):
  All ──> 13 (E2E Testing)
  All ──> 14 (Documentation)
```

## Parallelizable Work

**Can run in parallel:**

- Task 1 (Schema) + Task 2 (Provider interfaces) - No dependencies
- Task 3 (Google Drive) + Task 4 (URL Provider) - After Task 2
- Task 6 (API) + Task 7 (Webhooks) - After Task 5
- Task 10 (Link Detection) can start after Task 2
- Task 14 (Documentation) can start anytime

**Must be sequential:**

- Task 5 requires Tasks 1, 2, 3
- Task 8 requires Task 5
- Task 11 requires Tasks 5, 10
- Task 13 requires all implementation tasks

## Estimated Effort

| Phase             | Tasks         | Estimated Days |
| ----------------- | ------------- | -------------- |
| 1A - Foundation   | 1-4           | 3-4 days       |
| 1B - Services     | 5-7           | 3-4 days       |
| 1C - Sync         | 8-9           | 2-3 days       |
| 1D - Chat         | 10-12         | 2-3 days       |
| 1E - Testing/Docs | 13-14         | 2-3 days       |
| **Total**         | **14 groups** | **12-17 days** |
