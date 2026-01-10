# Change: Add External Sources Framework

## Why

Users need to import documents from external sources (e.g., Google Drive, Dropbox, URLs) directly through the chat interface or programmatic APIs without going through the file upload UI. This enables:

1. **Conversational workflow** - Paste a link in chat, system validates accessibility and ingests the document
2. **Programmatic integration** - External systems trigger imports via webhooks or API
3. **Continuous sync** - Periodic refresh of external sources to keep content up-to-date
4. **Unified data layer** - All content (uploaded, fetched, synced) stored as plain text chunks for consistent querying

The conceptual shift from "documents" to "sources" better represents the evolving nature of content ingestion - sources can be uploaded files, URLs, external service links (Google Drive, Dropbox, Notion, etc.), or other future integrations.

## What Changes

### Phase 1: External Sources Framework (This Proposal)

#### 1.1 External Source Provider Architecture

- **NEW** `ExternalSourceProvider` interface for pluggable source integrations

  - Standard lifecycle: detect → validate → fetch → transform → store
  - Provider-specific metadata and configuration
  - Error handling and retry policies per provider
  - Rate limiting per provider

- **NEW** Provider implementations:
  - `GoogleDriveProvider` - Public shared files (no OAuth)
  - `UrlProvider` - Generic URL fetching (existing, refactored)
  - Future: `DropboxProvider`, `OneDriveProvider`, `S3Provider`, `NotionProvider`

#### 1.2 External Source Entity Model

- **NEW** `ExternalSource` entity to track source references independently of documents

  - Represents the "canonical" external resource (e.g., a Google Drive file)
  - Links to one or more Document versions (imports/syncs)
  - Tracks sync state, last check time, error history

- **MODIFIED** Document entity to support external sources
  - Add `source_type` enum: `upload`, `url`, `google_drive`, `dropbox`, `external`
  - Add `external_source_id` FK to ExternalSource entity
  - Existing documents default to `source_type: 'upload'`

#### 1.3 Sync and Retry Infrastructure

- **NEW** Background sync worker for external sources

  - Periodic polling for changes (configurable per source)
  - Retry failed imports with exponential backoff
  - Webhook/event-driven sync triggers
  - Batch processing for folder-level sources

- **NEW** Sync policies:
  - `manual` - Only sync when explicitly requested
  - `on_access` - Check for updates when document is queried
  - `periodic` - Background polling at configured interval
  - `webhook` - Triggered by external system notifications

#### 1.4 External Triggers (API/Webhooks)

- **NEW** Import API endpoint: `POST /api/external-sources/import`

  - Accept URL, detect provider, queue for processing
  - Return job ID for status tracking
  - Support batch imports

- **NEW** Webhook endpoint: `POST /api/external-sources/webhook/:provider`
  - Receive change notifications from external systems
  - Trigger sync jobs for affected sources
  - Validate webhook signatures per provider

#### 1.5 Chat Integration

- **NEW** Chat-based external source import
  - Detect external source links in chat messages
  - Invoke import via MCP tool
  - Report progress and status conversationally
  - Make imported content immediately available for queries

### Phase 2: Future Enhancements (Out of Scope)

- Full "Sources" terminology rename across UI
- OAuth-based integrations (Google Drive, Dropbox, OneDrive)
- Notion, Confluence, Slack integrations
- Real-time streaming sync (vs. polling)
- Source-level permissions and access control
- Folder/collection sync (import entire Drive folders)

## Impact

- Affected specs:

  - `document-management` - New source type fields, ExternalSource entity
  - `chat-ui` - Link detection, import flow, document context awareness
  - **NEW** `external-sources` - Framework requirements and sync behavior

- Affected code:

  - `apps/server/src/entities/document.entity.ts` - New fields, FK
  - `apps/server/src/entities/external-source.entity.ts` - **NEW**
  - `apps/server/src/modules/external-sources/` - **NEW** module
    - `providers/` - Provider implementations
    - `external-sources.service.ts` - Core service
    - `external-source-sync.worker.ts` - Background sync
    - `external-sources.controller.ts` - API endpoints
  - `apps/server/src/modules/chat/` - Link detection and import orchestration
  - Database migrations for new tables and fields

- **NOT** breaking changes:
  - Existing documents continue to work (default `source_type: 'upload'`)
  - Existing APIs unchanged, new fields are optional
  - New endpoints are additive

## Design Considerations

See `design.md` for:

- External source provider interface design
- Sync infrastructure and retry policies
- ExternalSource entity relationships
- Google Drive link parsing and validation
- Error handling for inaccessible documents
- Deduplication strategy
- Chat context injection for imported documents
