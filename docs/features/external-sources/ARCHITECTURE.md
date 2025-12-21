# External Sources Architecture

## Overview

The External Sources Framework provides a pluggable architecture for importing documents from various external platforms. It uses a provider-based pattern that allows easy extension for new source types.

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Entry Points                              │
├─────────────────────────────────────────────────────────────────┤
│  REST API                          │  Chat MCP Tool              │
│  ExternalSourcesController         │  ImportDocumentTool         │
│  POST /external-sources/import     │  import_document            │
└─────────────────┬──────────────────┴─────────────┬───────────────┘
                  │                                │
                  ▼                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                    ExternalSourcesService                        │
│  - importFromUrl()     - findExistingSource()                   │
│  - createSource()      - updateSyncState()                      │
│  - triggerSync()       - getSourcesForSync()                    │
└─────────────────────────────────┬───────────────────────────────┘
                                  │
                  ┌───────────────┴───────────────┐
                  ▼                               ▼
┌─────────────────────────────┐   ┌─────────────────────────────┐
│  ExternalSourceProvider     │   │  ExternalSourceSyncWorker   │
│  Registry                   │   │  - Periodic sync            │
│  - detectProvider()         │   │  - Manual sync              │
│  - getProvider()            │   │  - Retry logic              │
└──────────────┬──────────────┘   └─────────────────────────────┘
               │
    ┌──────────┴──────────┐
    ▼                     ▼
┌────────────────┐  ┌────────────────┐
│ GoogleDrive    │  │ URL            │
│ Provider       │  │ Provider       │
└────────────────┘  └────────────────┘
```

## Core Components

### 1. ExternalSourcesService

The main orchestration service that coordinates imports and syncs.

**Location**: `apps/server/src/modules/external-sources/external-sources.service.ts`

**Responsibilities**:

- Coordinate the import workflow
- Handle deduplication logic
- Manage source lifecycle (create, update, delete)
- Delegate to appropriate providers
- Integrate with ingestion pipeline

**Key Methods**:

```typescript
// Main import entry point
async importFromUrl(url: string, projectId: string, options?: ImportOptions): Promise<ImportResult>

// Deduplication lookup
async findExistingSource(projectId: string, reference: ExternalSourceReference): Promise<ExternalSource | null>

// Trigger sync for a source
async triggerSync(sourceId: string): Promise<SyncResult>

// Get sources due for periodic sync
async getSourcesForSync(limit: number): Promise<ExternalSource[]>
```

### 2. ExternalSourceProviderRegistry

Manages provider registration and URL-to-provider mapping.

**Location**: `apps/server/src/modules/external-sources/external-source-provider-registry.service.ts`

**Responsibilities**:

- Register available providers
- Detect which provider handles a URL
- Provide provider instances by type

**Key Methods**:

```typescript
// Auto-detect provider from URL
detectProvider(url: string): ExternalSourceProvider | null

// Get provider by type
getProvider(type: string): ExternalSourceProvider | null

// Register a new provider
registerProvider(provider: ExternalSourceProvider): void
```

### 3. ExternalSourceProvider Interface

The contract that all providers must implement.

**Location**: `apps/server/src/modules/external-sources/interfaces/provider.interface.ts`

```typescript
interface ExternalSourceProvider {
  // Provider identification
  readonly providerType: string;
  readonly displayName: string;

  // URL handling
  canHandle(url: string): boolean;
  parseUrl(url: string): ExternalSourceReference | null;

  // Access and content
  checkAccess(ref: ExternalSourceReference): Promise<AccessCheckResult>;
  fetchMetadata(ref: ExternalSourceReference): Promise<SourceMetadata>;
  fetchContent(ref: ExternalSourceReference): Promise<FetchedContent>;

  // Sync support
  checkForUpdates(
    ref: ExternalSourceReference,
    lastSync: Date,
    lastEtag?: string
  ): Promise<UpdateCheckResult>;
  getDefaultSyncPolicy(): SyncPolicy;
  getRateLimitConfig(): RateLimitConfig;
}
```

### 4. Sync Worker

Background service for periodic and manual sync operations.

**Location**: `apps/server/src/modules/external-sources/external-source-sync-worker.service.ts`

**Responsibilities**:

- Poll for sources due for sync
- Execute sync operations
- Handle retry logic with exponential backoff
- Track sync state and errors

**Sync Flow**:

```
1. Load source and provider
2. Check for updates (etag, modified time)
3. If updates detected:
   a. Fetch new content
   b. Create new document version
   c. Update sync state
4. Handle errors with retry logic
```

### 5. Chat Integration

#### ExternalLinkDetector

Extracts and classifies URLs from chat messages.

**Location**: `apps/server/src/modules/external-sources/external-link-detector.service.ts`

#### ImportDocumentTool

MCP tool for chat-based imports.

**Location**: `apps/server/src/modules/external-sources/import-document.tool.ts`

**Tool Definition**:

```typescript
{
  name: 'import_document',
  description: 'Import a document from an external URL into the knowledge base',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'The URL to import' },
      displayName: { type: 'string', description: 'Optional display name' }
    },
    required: ['url']
  }
}
```

## Data Model

### ExternalSource Entity

```typescript
@Entity('external_sources', { schema: 'kb' })
class ExternalSource {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  projectId: string;

  @Column()
  providerType: string; // 'google_drive', 'url'

  @Column()
  externalId: string; // Provider-specific identifier

  @Column()
  originalUrl: string;

  @Column()
  normalizedUrl: string;

  @Column({ nullable: true })
  displayName?: string;

  @Column({ nullable: true })
  mimeType?: string;

  @Column({ default: 'manual' })
  syncPolicy: SyncPolicy;

  @Column({ nullable: true })
  syncIntervalMinutes?: number;

  @Column({ nullable: true })
  lastCheckedAt?: Date;

  @Column({ nullable: true })
  lastSyncedAt?: Date;

  @Column({ nullable: true })
  lastEtag?: string;

  @Column({ default: 'active' })
  status: 'active' | 'error' | 'disabled';

  @Column({ default: 0 })
  errorCount: number;

  @Column({ nullable: true })
  lastError?: string;

  @Column({ nullable: true })
  lastErrorAt?: Date;

  @Column('jsonb', { nullable: true })
  providerMetadata?: Record<string, unknown>;
}
```

### Document Entity Extensions

Documents linked to external sources have additional fields:

```typescript
@Column({ default: 'upload' })
sourceType: 'upload' | 'external';

@Column('uuid', { nullable: true })
externalSourceId?: string;

@Column({ default: 1 })
syncVersion: number;
```

## Import Flow

```
User Request (API or Chat)
         │
         ▼
┌─────────────────────────────────────┐
│ 1. Parse URL & Detect Provider      │
│    - Extract URL from request       │
│    - Match against provider patterns│
│    - Get provider instance          │
└─────────────────┬───────────────────┘
                  │
                  ▼
┌─────────────────────────────────────┐
│ 2. Check Access                     │
│    - Verify URL is accessible       │
│    - Check permissions (public)     │
│    - Return early if inaccessible   │
└─────────────────┬───────────────────┘
                  │
                  ▼
┌─────────────────────────────────────┐
│ 3. Deduplication Check              │
│    - Check by external_id           │
│    - Check by normalized_url        │
│    - Return existing if found       │
└─────────────────┬───────────────────┘
                  │
                  ▼
┌─────────────────────────────────────┐
│ 4. Fetch Content                    │
│    - Download/export file           │
│    - Handle format conversion       │
│    - Extract text content           │
└─────────────────┬───────────────────┘
                  │
                  ▼
┌─────────────────────────────────────┐
│ 5. Create Records                   │
│    - Create ExternalSource record   │
│    - Create Document via ingestion  │
│    - Link document to source        │
└─────────────────┬───────────────────┘
                  │
                  ▼
┌─────────────────────────────────────┐
│ 6. Return Result                    │
│    - Source ID and details          │
│    - Document ID                    │
│    - Status (created/duplicate)     │
└─────────────────────────────────────┘
```

## Provider Implementation Guide

See [ADDING_PROVIDERS.md](./ADDING_PROVIDERS.md) for detailed instructions on implementing new providers.

## Error Handling

### Error Codes

```typescript
enum ExternalSourceErrorCode {
  SOURCE_NOT_ACCESSIBLE = 'SOURCE_NOT_ACCESSIBLE',
  SOURCE_NOT_FOUND = 'SOURCE_NOT_FOUND',
  RATE_LIMITED = 'RATE_LIMITED',
  UNSUPPORTED_TYPE = 'UNSUPPORTED_TYPE',
  FILE_TOO_LARGE = 'FILE_TOO_LARGE',
  NETWORK_ERROR = 'NETWORK_ERROR',
  PROVIDER_ERROR = 'PROVIDER_ERROR',
  CONTENT_FETCH_FAILED = 'CONTENT_FETCH_FAILED',
  PARSE_ERROR = 'PARSE_ERROR',
  AUTH_REQUIRED = 'AUTH_REQUIRED',
  QUOTA_EXCEEDED = 'QUOTA_EXCEEDED',
  INVALID_RESPONSE = 'INVALID_RESPONSE',
}
```

### Retry Strategy

The sync worker uses exponential backoff:

| Attempt | Delay      |
| ------- | ---------- |
| 1       | 1 second   |
| 2       | 2 seconds  |
| 3       | 4 seconds  |
| 4       | 8 seconds  |
| 5       | 16 seconds |
| Max     | 1 hour     |

After 5 consecutive failures, the source is marked as `disabled`.

## Observability

### Langfuse Tracing

All sync operations are traced in Langfuse with:

- Trace type: `external-source-sync`
- Tags: `provider_type`, `sync_type`
- Metadata: source ID, project ID, sync policy

### Logging

Key log points:

- Provider registration
- URL detection and parsing
- Access check results
- Content fetch operations
- Sync operations and results
- Errors and retries

## Security Considerations

1. **URL Validation**: All URLs are validated before processing
2. **Project Scope**: Sources are scoped to projects with proper authorization
3. **Public Access Only**: Phase 1 only supports publicly accessible resources
4. **Rate Limiting**: Per-provider rate limits prevent abuse
5. **Content Scanning**: Content passes through ingestion pipeline with existing security checks
