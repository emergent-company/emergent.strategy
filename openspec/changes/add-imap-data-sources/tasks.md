# Tasks: Add IMAP Data Sources Integration

## Phase 1: Database Schema & Entities

### 1.1 Generic Integration Entity

- [ ] 1.1.1 Create `integration.entity.ts` with fields:
  - id, project_id, provider_type, source_type, name
  - config_encrypted, sync_mode, sync_interval_minutes, last_synced_at
  - status, error_message, created_at, updated_at
- [ ] 1.1.2 Create migration for `kb.integrations` table
- [ ] 1.1.3 Add indexes on project_id, provider_type, source_type, status

### 1.2 Document Entity Updates

- [ ] 1.2.1 Change `source_type` from TypeScript union to plain `string`
- [ ] 1.2.2 Add `integration_id` FK column (nullable, references integrations.id)
- [ ] 1.2.3 Verify `parent_document_id` self-reference exists with proper cascade
- [ ] 1.2.4 Add index on `source_type` for efficient filtering
- [ ] 1.2.5 Add index on `integration_id` for filtering by source

### 1.3 Database Migration

- [ ] 1.3.1 Create migration file with all schema changes
- [ ] 1.3.2 Ensure existing documents get `source_type: 'upload'` (should already be default)
- [ ] 1.3.3 Test migration on dev database
- [ ] 1.3.4 Verify rollback works correctly

## Phase 2: Backend - Integration Framework

### 2.1 Credentials Service

- [ ] 2.1.1 Create `credentials.service.ts` with AES-256-GCM encrypt/decrypt
- [ ] 2.1.2 Add `INTEGRATION_CREDENTIALS_KEY` to environment configuration
- [ ] 2.1.3 Unit tests for encryption/decryption roundtrip

### 2.2 Provider Registry

- [ ] 2.2.1 Create `provider.interface.ts` defining IntegrationProvider interface
- [ ] 2.2.2 Create `provider.registry.ts` for provider registration
- [ ] 2.2.3 Implement provider lookup by provider_type

### 2.3 Integration CRUD Service

- [ ] 2.3.1 Create `integrations.module.ts`
- [ ] 2.3.2 Create `integrations.service.ts` with CRUD operations
- [ ] 2.3.3 Create `integrations.controller.ts` with REST endpoints:
  - POST /api/integrations
  - GET /api/integrations
  - GET /api/integrations/:id
  - PATCH /api/integrations/:id
  - DELETE /api/integrations/:id
  - GET /api/integrations/providers
  - GET /api/integrations/providers/:type/schema
- [ ] 2.3.4 Create DTOs: CreateIntegrationDto, UpdateIntegrationDto
- [ ] 2.3.5 Add guards and scopes (`integrations:read`, `integrations:write`, `integrations:delete`)

### 2.4 Integration Sync Worker

- [ ] 2.4.1 Create `integration-sync.worker.ts` extending existing sync pattern
- [ ] 2.4.2 Query integrations with `sync_mode: 'recurring'` due for sync
- [ ] 2.4.3 Dispatch to appropriate provider for sync operation
- [ ] 2.4.4 Update `last_synced_at` on completion

## Phase 3: Backend - IMAP Provider

### 3.1 IMAP Core Services

- [ ] 3.1.1 Install `imapflow` and `mailparser` packages
- [ ] 3.1.2 Create `providers/imap/imap.provider.ts` implementing IntegrationProvider
- [ ] 3.1.3 Create `providers/imap/imap.service.ts` for IMAP operations
- [ ] 3.1.4 Create `providers/imap/imap-connection.service.ts` for connection management
- [ ] 3.1.5 Register IMAP provider in provider registry

### 3.2 IMAP Configuration

- [ ] 3.2.1 Create `providers/imap/dto/imap-config.dto.ts` with validation
- [ ] 3.2.2 Create JSON schema for IMAP configuration (for UI form generation)
- [ ] 3.2.3 Implement `testConnection()` method

### 3.3 IMAP Browsing

- [ ] 3.3.1 Create `providers/imap/dto/imap-folder.dto.ts`
- [ ] 3.3.2 Create `providers/imap/dto/imap-email-preview.dto.ts`
- [ ] 3.3.3 Create `providers/imap/dto/imap-filter.dto.ts`
- [ ] 3.3.4 Add endpoint: GET /api/integrations/:id/imap/folders
- [ ] 3.3.5 Add endpoint: POST /api/integrations/:id/imap/preview
- [ ] 3.3.6 Implement IMAP SEARCH with filter criteria

### 3.4 IMAP Import

- [ ] 3.4.1 Create `providers/imap/imap-import.service.ts`
- [ ] 3.4.2 Implement email body extraction (handle text/plain, text/html)
- [ ] 3.4.3 Implement attachment extraction and child document creation
- [ ] 3.4.4 Implement Message-ID deduplication
- [ ] 3.4.5 Add endpoint: POST /api/integrations/:id/imap/import
- [ ] 3.4.6 Add endpoint: GET /api/integrations/:id/imap/import/:jobId/status

### 3.5 IMAP Sync

- [ ] 3.5.1 Create `providers/imap/imap-sync.service.ts`
- [ ] 3.5.2 Implement incremental sync (emails since last_synced_at)
- [ ] 3.5.3 Add endpoint: POST /api/integrations/:id/sync
- [ ] 3.5.4 Integrate with sync worker

### 3.6 Backend Tests

- [ ] 3.6.1 Unit tests for IMAP filter building
- [ ] 3.6.2 Unit tests for email-to-document transformation
- [ ] 3.6.3 Unit tests for Message-ID deduplication
- [ ] 3.6.4 Integration tests with mock IMAP server (or mailhog)

## Phase 4: Backend - Document Enhancements

### 4.1 Source Type Queries

- [ ] 4.1.1 Add `source_type` filter to GET /api/documents
- [ ] 4.1.2 Add `integration_id` filter to GET /api/documents
- [ ] 4.1.3 Add `root_only` filter (where parent_document_id IS NULL)
- [ ] 4.1.4 Add endpoint: GET /api/documents/source-types (distinct source types with counts)

### 4.2 Document Hierarchy

- [ ] 4.2.1 Add `include_children` option to document queries
- [ ] 4.2.2 Add `child_count` to document response (aggregated)
- [ ] 4.2.3 Update deletion to cascade to children
- [ ] 4.2.4 Update deletion impact to include child counts

### 4.3 Integration Join

- [ ] 4.3.1 Add `include_integration` option to document queries
- [ ] 4.3.2 Return integration.name in document response for display

## Phase 5: Frontend - Source Type Plugins

### 5.1 Plugin Infrastructure

- [ ] 5.1.1 Create `plugins/source-types/registry.ts` for plugin registration
- [ ] 5.1.2 Define `SourceTypePlugin` interface
- [ ] 5.1.3 Create `useSourceTypePlugin` hook for accessing plugins

### 5.2 Built-in Plugins

- [ ] 5.2.1 Create `plugins/source-types/upload.plugin.ts` (Documents)
- [ ] 5.2.2 Create `plugins/source-types/email.plugin.ts` (Emails)
- [ ] 5.2.3 Register plugins at app initialization

## Phase 6: Frontend - Data Sources Section

### 6.1 Sidebar Updates

- [ ] 6.1.1 Create `useSourceTypesWithDocuments` hook (query distinct source_types)
- [ ] 6.1.2 Add "Data Sources" section to `layout.tsx`
- [ ] 6.1.3 Render Documents item (always visible)
- [ ] 6.1.4 Render dynamic source type items based on existing documents

### 6.2 Source Type Pages

- [ ] 6.2.1 Create `/admin/data-sources/[sourceType]/index.tsx` page
- [ ] 6.2.2 Create `SourceTypeTable.tsx` component (dynamic columns from plugin)
- [ ] 6.2.3 Create `ExpandableChunksRow.tsx` component
- [ ] 6.2.4 Implement lazy-loading of chunks on expand
- [ ] 6.2.5 Add pagination within expanded chunks view
- [ ] 6.2.6 Add "Source" column for non-upload source types (shows integration name)

### 6.3 Route Registration

- [ ] 6.3.1 Add routes for `/admin/data-sources/*`
- [ ] 6.3.2 Add redirect from `/admin/data-sources` to `/admin/data-sources/upload`

## Phase 7: Frontend - Integration Management

### 7.1 Integration Hooks

- [ ] 7.1.1 Create `useIntegrations` hook for CRUD operations
- [ ] 7.1.2 Create `useIntegrationProviders` hook for available providers

### 7.2 Integration Settings Page

- [ ] 7.2.1 Update Settings > Integrations to list configured integrations
- [ ] 7.2.2 Show integrations grouped by provider type
- [ ] 7.2.3 Add "Add Integration" button with provider selection

### 7.3 IMAP Integration UI

- [ ] 7.3.1 Create `ImapConnectionForm.tsx` component
- [ ] 7.3.2 Implement form validation
- [ ] 7.3.3 Add "Test Connection" button with loading/success/error states
- [ ] 7.3.4 Create add/edit modal

### 7.4 IMAP Folder Browser

- [ ] 7.4.1 Create `ImapFolderBrowser.tsx` component
- [ ] 7.4.2 Display folder tree with checkboxes and counts
- [ ] 7.4.3 Persist folder selection in integration filters

### 7.5 IMAP Email Browser

- [ ] 7.5.1 Create `ImapEmailBrowser.tsx` component
- [ ] 7.5.2 Create filter form (from, to, subject, date range, folder)
- [ ] 7.5.3 Create email preview list with checkboxes
- [ ] 7.5.4 Display total matching count
- [ ] 7.5.5 Implement pagination (100 per page)
- [ ] 7.5.6 Add "Import Selected" and "Import All" buttons
- [ ] 7.5.7 Show import progress modal

### 7.6 IMAP Sync Settings

- [ ] 7.6.1 Create `ImapSyncSettings.tsx` component
- [ ] 7.6.2 Add sync mode toggle (Manual / Recurring)
- [ ] 7.6.3 Add interval dropdown (15m, 1h, 6h, 24h)
- [ ] 7.6.4 Display last sync time and next scheduled
- [ ] 7.6.5 Add "Sync Now" button

## Phase 8: Validation & Polish

### 8.1 E2E Testing

- [ ] 8.1.1 E2E test: Create IMAP integration
- [ ] 8.1.2 E2E test: Browse folders and preview emails
- [ ] 8.1.3 E2E test: Import selected emails
- [ ] 8.1.4 E2E test: View emails in Data Sources > Emails
- [ ] 8.1.5 E2E test: Expand document to see chunks
- [ ] 8.1.6 E2E test: Filter documents by source type

### 8.2 Security Review

- [ ] 8.2.1 Audit credential encryption implementation
- [ ] 8.2.2 Verify credentials never logged
- [ ] 8.2.3 Test with invalid/expired credentials

### 8.3 Documentation

- [ ] 8.3.1 API documentation for integration endpoints
- [ ] 8.3.2 User guide for IMAP setup
- [ ] 8.3.3 Document plugin interface for future providers

### 8.4 Final Review

- [ ] 8.4.1 Performance review of large email imports
- [ ] 8.4.2 UI/UX review of integration flow
- [ ] 8.4.3 Code review and PR approval
