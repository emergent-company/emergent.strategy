# Design: External Sources Framework

## Context

The system currently supports document ingestion via:

1. Direct file upload (UI)
2. URL fetch (API)
3. Batch upload (API)

Users need a more flexible way to import documents from external sources - pasting links in chat, triggering imports via API, and keeping content synced with external systems. This requires a pluggable framework that can support multiple source types with different access patterns, authentication methods, and sync behaviors.

**Stakeholders:**

- End users who share documents via Google Drive, Dropbox, etc.
- External systems that need to trigger imports via API/webhooks
- Chat system that needs to detect and process links
- Ingestion pipeline that needs source tracking and sync coordination
- Background workers that handle periodic sync and retries

**Constraints:**

- Initial phase: Only public/shared documents (no OAuth complexity)
- Must handle rate limits from external APIs gracefully
- Must support eventual consistency (external changes may take time to reflect)
- Must not block user interactions on slow external fetches

## Goals / Non-Goals

**Goals:**

- Create extensible provider architecture for external sources
- Enable importing from Google Drive (public files) via chat and API
- Track external source origin and sync state for documents
- Support background sync with configurable policies
- Provide API and webhook endpoints for external triggers
- Handle failures gracefully with retry logic
- Make imported documents immediately available for queries

**Non-Goals (Phase 1):**

- OAuth-based integrations (future phase)
- Real-time streaming sync
- Full "Sources" terminology rename in UI
- Folder-level sync (importing entire Drive folders)
- Source-level permissions beyond project scope

## Decisions

### Decision 1: External Source Provider Interface

**What:** Define a standard interface for external source providers:

```typescript
interface ExternalSourceProvider {
  // Provider identification
  readonly providerType: ExternalSourceType; // 'google_drive', 'dropbox', 'url', etc.
  readonly displayName: string;

  // Link detection and parsing
  canHandle(url: string): boolean;
  parseUrl(url: string): ExternalSourceReference | null;

  // Access validation
  checkAccess(ref: ExternalSourceReference): Promise<AccessCheckResult>;

  // Content fetching
  fetchMetadata(ref: ExternalSourceReference): Promise<SourceMetadata>;
  fetchContent(ref: ExternalSourceReference): Promise<FetchedContent>;

  // Sync support
  checkForUpdates(
    ref: ExternalSourceReference,
    lastSync: Date
  ): Promise<UpdateCheckResult>;

  // Configuration
  getDefaultSyncPolicy(): SyncPolicy;
  getRateLimitConfig(): RateLimitConfig;
}

interface ExternalSourceReference {
  providerType: ExternalSourceType;
  externalId: string; // Provider-specific ID (e.g., Google Drive file ID)
  originalUrl: string; // Original URL as provided
  normalizedUrl: string; // Canonical URL for deduplication
}

interface AccessCheckResult {
  accessible: boolean;
  reason?:
    | 'not_found'
    | 'permission_denied'
    | 'rate_limited'
    | 'unsupported_type';
  metadata?: Partial<SourceMetadata>;
}

interface SourceMetadata {
  name: string;
  mimeType: string;
  size: number;
  modifiedAt: Date;
  etag?: string; // For change detection
  providerMetadata?: Record<string, unknown>;
}

interface FetchedContent {
  content: string | Buffer;
  mimeType: string;
  encoding?: string;
}

type SyncPolicy = 'manual' | 'on_access' | 'periodic' | 'webhook';
```

**Why:**

- Standard interface enables pluggable providers
- Clear separation of concerns (detection, validation, fetching)
- Each provider can have custom sync and rate limit behaviors
- Easier testing via mock providers

**Alternatives Considered:**

- Single monolithic service - Less extensible, harder to test
- Event-driven architecture only - Over-complex for initial needs

### Decision 2: ExternalSource Entity Model

**What:** Create a separate `ExternalSource` entity to track external references:

```typescript
@Entity({ name: 'external_sources', schema: 'kb' })
export class ExternalSource {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'project_id', type: 'uuid' })
  projectId: string;

  @Column({ name: 'provider_type', type: 'text' })
  providerType: ExternalSourceType; // 'google_drive', 'dropbox', 'url', etc.

  @Column({ name: 'external_id', type: 'text' })
  externalId: string; // Provider-specific ID

  @Column({ name: 'original_url', type: 'text' })
  originalUrl: string;

  @Column({ name: 'normalized_url', type: 'text' })
  normalizedUrl: string;

  @Column({ name: 'display_name', type: 'text', nullable: true })
  displayName: string | null;

  @Column({ name: 'mime_type', type: 'text', nullable: true })
  mimeType: string | null;

  @Column({ name: 'sync_policy', type: 'text', default: 'manual' })
  syncPolicy: SyncPolicy;

  @Column({ name: 'sync_interval_minutes', type: 'int', nullable: true })
  syncIntervalMinutes: number | null; // For 'periodic' policy

  @Column({ name: 'last_checked_at', type: 'timestamptz', nullable: true })
  lastCheckedAt: Date | null;

  @Column({ name: 'last_synced_at', type: 'timestamptz', nullable: true })
  lastSyncedAt: Date | null;

  @Column({ name: 'last_etag', type: 'text', nullable: true })
  lastEtag: string | null; // For change detection

  @Column({ name: 'status', type: 'text', default: 'active' })
  status: 'active' | 'error' | 'disabled';

  @Column({ name: 'error_count', type: 'int', default: 0 })
  errorCount: number;

  @Column({ name: 'last_error', type: 'text', nullable: true })
  lastError: string | null;

  @Column({ name: 'last_error_at', type: 'timestamptz', nullable: true })
  lastErrorAt: Date | null;

  @Column({ name: 'provider_metadata', type: 'jsonb', nullable: true })
  providerMetadata: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  // Relationships
  @OneToMany(() => Document, (doc) => doc.externalSource)
  documents: Document[];
}
```

**Document Entity Updates:**

```typescript
// Add to Document entity
@Column({ name: 'source_type', type: 'text', default: 'upload' })
sourceType: 'upload' | 'url' | 'google_drive' | 'dropbox' | 'external';

@Column({ name: 'external_source_id', type: 'uuid', nullable: true })
externalSourceId: string | null;

@ManyToOne(() => ExternalSource, (es) => es.documents)
@JoinColumn({ name: 'external_source_id' })
externalSource: ExternalSource | null;

@Column({ name: 'sync_version', type: 'int', default: 1 })
syncVersion: number; // Incremented on each sync
```

**Why:**

- Separates "source reference" from "document content"
- One external source can have multiple document versions (sync history)
- Centralizes sync state and error tracking
- Enables bulk operations on sources (disable, re-sync all)

**Relationships:**

```
ExternalSource (1) ──────< (N) Document
     │
     │ - tracks the canonical external reference
     │ - stores sync policy and state
     │ - tracks error history
     │
     └──> Documents are imports/versions from this source
```

### Decision 3: Sync Infrastructure

**What:** Background worker for external source sync with configurable policies:

```typescript
// Sync policies
type SyncPolicy = 'manual' | 'on_access' | 'periodic' | 'webhook';

// Sync worker handles:
// 1. Periodic sync - poll sources at configured intervals
// 2. Retry failed imports - exponential backoff
// 3. Webhook-triggered sync - process external notifications
// 4. On-access sync - check when document is queried (with cache)

interface SyncJob {
  externalSourceId: string;
  trigger: 'periodic' | 'retry' | 'webhook' | 'on_access' | 'manual';
  priority: 'high' | 'normal' | 'low';
}

// Retry policy
const RETRY_POLICY = {
  maxRetries: 5,
  initialDelayMs: 1000, // 1 second
  maxDelayMs: 3600000, // 1 hour
  backoffMultiplier: 2,
};
```

**Worker Flow:**

```
┌─────────────────────────────────────────────────────────────┐
│                    External Source Sync Worker               │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  1. Poll for due syncs:                                     │
│     - Periodic sources past sync interval                   │
│     - Failed sources ready for retry                        │
│                                                              │
│  2. Process sync job:                                       │
│     a. Load ExternalSource and provider                     │
│     b. Check for updates (etag, modifiedAt)                 │
│     c. If changed: fetch content, create new Document       │
│     d. Update sync state (lastSyncedAt, etag)               │
│     e. Handle errors (increment errorCount, schedule retry) │
│                                                              │
│  3. Emit events:                                            │
│     - external_source.synced                                │
│     - external_source.error                                 │
│     - document.created (via ingestion)                      │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

**Why:**

- Decouples sync from user requests (non-blocking)
- Centralized retry logic with backoff
- Configurable per-source behavior
- Can scale horizontally (multiple workers)

### Decision 4: External Triggers API

**What:** API endpoints for programmatic import and webhook handling:

```typescript
// Import API
@Post('/api/external-sources/import')
async importFromUrl(
  @Body() dto: ImportExternalSourceDto,
  @Headers('x-project-id') projectId: string,
): Promise<ImportResult> {
  // 1. Detect provider from URL
  // 2. Parse and validate
  // 3. Check for existing source (dedup)
  // 4. Queue import job or process immediately
  // 5. Return job ID or document ID
}

interface ImportExternalSourceDto {
  url: string;
  syncPolicy?: SyncPolicy;        // Override default
  syncIntervalMinutes?: number;   // For periodic
  immediate?: boolean;            // Process now vs queue
  metadata?: Record<string, unknown>; // Custom metadata
}

interface ImportResult {
  success: boolean;
  externalSourceId?: string;
  documentId?: string;
  status: 'created' | 'duplicate' | 'queued' | 'error';
  jobId?: string;                 // If queued
  error?: string;
}

// Webhook endpoint (provider-specific)
@Post('/api/external-sources/webhook/:provider')
async handleWebhook(
  @Param('provider') provider: string,
  @Body() payload: unknown,
  @Headers() headers: Record<string, string>,
): Promise<void> {
  // 1. Validate webhook signature (provider-specific)
  // 2. Parse payload to identify affected sources
  // 3. Queue sync jobs for affected sources
}
```

**Why:**

- External systems can trigger imports programmatically
- Webhook support enables event-driven sync
- Batch import support for migrations
- Status tracking via job IDs

### Decision 5: Google Drive Provider Implementation

**What:** First provider implementation for Google Drive public files:

```typescript
class GoogleDriveProvider implements ExternalSourceProvider {
  readonly providerType = 'google_drive';
  readonly displayName = 'Google Drive';

  // URL patterns
  private readonly patterns = [
    /https:\/\/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/,
    /https:\/\/drive\.google\.com\/open\?id=([a-zA-Z0-9_-]+)/,
    /https:\/\/docs\.google\.com\/document\/d\/([a-zA-Z0-9_-]+)/,
    /https:\/\/docs\.google\.com\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/,
    /https:\/\/docs\.google\.com\/presentation\/d\/([a-zA-Z0-9_-]+)/,
  ];

  canHandle(url: string): boolean {
    return this.patterns.some((p) => p.test(url));
  }

  parseUrl(url: string): ExternalSourceReference | null {
    for (const pattern of this.patterns) {
      const match = url.match(pattern);
      if (match) {
        return {
          providerType: 'google_drive',
          externalId: match[1],
          originalUrl: url,
          normalizedUrl: `https://drive.google.com/file/d/${match[1]}`,
        };
      }
    }
    return null;
  }

  async checkAccess(ref: ExternalSourceReference): Promise<AccessCheckResult> {
    // GET https://www.googleapis.com/drive/v3/files/{fileId}?fields=...
    // No auth for public files, API key optional
  }

  async fetchContent(ref: ExternalSourceReference): Promise<FetchedContent> {
    // For native Google formats (Docs, Sheets, Slides):
    //   - Export to appropriate format (text, CSV, PDF)
    // For other files:
    //   - Direct download via alt=media
  }

  getDefaultSyncPolicy(): SyncPolicy {
    return 'manual'; // No auto-sync for public files
  }

  getRateLimitConfig(): RateLimitConfig {
    return {
      requestsPerMinute: 60,
      requestsPerDay: 1000,
      backoffOnRateLimit: true,
    };
  }
}
```

**Google Native Format Handling:**

| Source Type   | Export Format   | Notes                  |
| ------------- | --------------- | ---------------------- |
| Google Docs   | text/plain      | Preserves text content |
| Google Sheets | text/csv        | First sheet only       |
| Google Slides | application/pdf | Then extract text      |
| Other files   | Original        | Direct download        |

### Decision 6: Chat Integration

**What:** Detect links in chat and import via MCP tool:

```typescript
// Link detector service
class ExternalLinkDetector {
  constructor(private providers: ExternalSourceProvider[]) {}

  detectLinks(message: string): DetectedLink[] {
    const links: DetectedLink[] = [];
    const urlRegex = /https?:\/\/[^\s<>"{}|\\^`\[\]]+/g;

    for (const match of message.matchAll(urlRegex)) {
      const url = match[0];
      for (const provider of this.providers) {
        if (provider.canHandle(url)) {
          const ref = provider.parseUrl(url);
          if (ref) {
            links.push({
              url,
              provider: provider.providerType,
              reference: ref,
            });
            break;
          }
        }
      }
    }
    return links;
  }
}

// MCP Tool for chat agent
const importDocumentTool = {
  name: 'import_document',
  description:
    'Import a document from an external URL (Google Drive, Dropbox, etc.)',
  parameters: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'The URL of the document to import' },
    },
    required: ['url'],
  },
  execute: async ({ url }, context) => {
    // 1. Detect provider
    // 2. Check access
    // 3. Import or return existing
    // 4. Return status for chat response
  },
};
```

**Chat Flow:**

```
User: "Import this doc: https://drive.google.com/file/d/abc123/view"

Agent: [detects Google Drive link]
       [invokes import_document tool]

Tool:  1. Parse URL → { provider: 'google_drive', externalId: 'abc123' }
       2. Check existing → not found
       3. Check access → accessible
       4. Fetch metadata → { name: 'Q4 Report.pdf', size: 2.5MB }
       5. Download content
       6. Create ExternalSource record
       7. Ingest document (chunk, embed)
       8. Return { success: true, documentId: '...', name: 'Q4 Report.pdf' }

Agent: "I've imported 'Q4 Report.pdf' from Google Drive. It has 45 chunks
        and is ready for questions. What would you like to know about it?"
```

### Decision 7: Deduplication Strategy

**What:** Multi-level deduplication:

1. **External Source ID** (primary) - Same provider + externalId = same source
2. **Normalized URL** - Same canonical URL = same source
3. **Content Hash** (fallback) - Same content = potential duplicate

```typescript
async findExistingSource(
  projectId: string,
  ref: ExternalSourceReference,
): Promise<ExternalSource | null> {
  // First: exact match on provider + externalId
  const byExternalId = await this.repo.findOne({
    where: {
      projectId,
      providerType: ref.providerType,
      externalId: ref.externalId,
    },
  });
  if (byExternalId) return byExternalId;

  // Second: match on normalized URL
  const byNormalizedUrl = await this.repo.findOne({
    where: {
      projectId,
      normalizedUrl: ref.normalizedUrl,
    },
  });
  return byNormalizedUrl;
}
```

**Why:**

- External ID is most reliable (same file ID = same file)
- Normalized URL catches different link formats for same resource
- Content hash helps detect uploads of same content from different sources

## Risks / Trade-offs

| Risk                       | Impact                     | Mitigation                                    |
| -------------------------- | -------------------------- | --------------------------------------------- |
| Provider API changes       | Detection/fetch failures   | Flexible patterns, fallback to URL fetch      |
| Rate limits from providers | Import failures, slow sync | Per-provider rate limiting, backoff, queuing  |
| Large files                | Timeouts, memory issues    | Size limits, streaming, async processing      |
| Stale content              | Outdated information       | Configurable sync policies, on-demand refresh |
| Provider downtime          | Import failures            | Retry with backoff, status tracking           |
| Complex error states       | User confusion             | Clear status messages, actionable guidance    |

## Migration Plan

1. **Database Migration:**

   - Create `kb.external_sources` table
   - Add columns to `kb.documents`: `source_type`, `external_source_id`, `sync_version`
   - Add indexes for efficient queries
   - Set defaults for existing documents (`source_type = 'upload'`)

2. **Code Deployment:**

   - Deploy provider framework (no impact on existing)
   - Deploy API endpoints (new, opt-in)
   - Deploy sync worker (background, no impact)
   - Enable chat integration (feature flag if needed)

3. **Rollback:**
   - New tables/columns can remain unused
   - Feature flags disable new functionality
   - No breaking changes to existing flows

## Open Questions

1. **Q:** Should sync create new document versions or update in place?
   **Proposed:** Create new version, mark old as superseded. Preserves history.

2. **Q:** How to handle Google Docs native format (needs export)?
   **Proposed:** Export to plain text (Docs) or CSV (Sheets). PDF for Slides.

3. **Q:** Rate limiting for chat-based imports?
   **Proposed:** Max 5 imports per conversation, 20 per hour per user.

4. **Q:** Should imported documents be auto-associated with conversation?
   **Proposed:** Yes, for immediate context availability.

5. **Q:** How to handle webhook authentication for different providers?
   **Proposed:** Provider-specific signature validation. Start with simple shared secrets.

6. **Q:** What's the default sync policy for chat-imported sources?
   **Proposed:** `manual` - user explicitly requests re-import. Can be changed via API.
