# Design: IMAP Data Sources Integration

## Context

This change introduces IMAP email integration as a knowledge source alongside traditional document uploads. Users want to import emails from their mailboxes, filter them by criteria (from, to, subject, folder), select specific emails, and process them through the existing document pipeline.

**Stakeholders:**

- End users: Need to search email content alongside documents
- Project admins: Configure integrations per project
- System: Process content through existing ingestion pipeline
- Future plugin developers: Need extensible architecture

**Constraints:**

- IMAP servers may have hundreds of thousands of emails - must not sync all at once
- Credentials must be stored securely (encrypted at rest)
- Must integrate with existing sync infrastructure
- Emails with attachments create parent-child document hierarchies
- Architecture must support future source types without schema changes

## Goals / Non-Goals

**Goals:**

- Enable IMAP email import as document source
- Provide Gmail-like filtering (from, to, subject, date range, folder)
- Support manual and recurring sync modes
- Extract attachments as child documents
- Progressive loading for large mailboxes (counts → preview → selection)
- Reorganize sidebar with "Data Sources" section
- **Plugin-friendly architecture** for future source types

**Non-Goals:**

- OAuth-based email providers (Gmail API, Outlook API) - IMAP only for v1
- Two-way sync (sending/deleting emails)
- Real-time push notifications (IDLE) - polling only for v1
- Full-text search within IMAP (rely on local filtering after fetch)

## Decisions

### 1. Generic Integration Entity

**Decision:** Create a single `Integration` entity that supports multiple provider types.

**Rationale:** Instead of creating provider-specific tables (`imap_integrations`, `slack_integrations`, etc.), a generic integration entity allows adding new providers without schema migrations.

```typescript
// Generic Integration entity
@Entity({ schema: 'kb', name: 'integrations' })
export class Integration {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'project_id', type: 'uuid' })
  projectId: string;

  @Column({ name: 'provider_type', type: 'text' })
  providerType: string; // 'imap', 'gmail_api', 'slack', 'notion', etc.

  @Column({ name: 'source_type', type: 'text' })
  sourceType: string; // 'email', 'message', 'page', etc.

  @Column({ type: 'text' })
  name: string; // User-defined: "Work Gmail", "Personal Outlook"

  @Column({ name: 'config_encrypted', type: 'text' })
  configEncrypted: string; // AES-256-GCM encrypted JSON

  @Column({ name: 'sync_mode', type: 'text', default: 'manual' })
  syncMode: 'manual' | 'recurring';

  @Column({ name: 'sync_interval_minutes', type: 'int', nullable: true })
  syncIntervalMinutes: number | null;

  @Column({ name: 'last_synced_at', type: 'timestamptz', nullable: true })
  lastSyncedAt: Date | null;

  @Column({ type: 'text', default: 'active' })
  status: 'active' | 'error' | 'disabled';

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
```

**Provider-specific config stored in `configEncrypted`:**

```typescript
// IMAP provider config
interface ImapConfig {
  host: string;
  port: number;
  encryption: 'ssl' | 'starttls' | 'none';
  username: string;
  password: string; // Encrypted at rest
  filters: {
    folders: string[];
    from: string[];
    to: string[];
    subject: string;
    dateFrom: string;
    dateTo: string;
  };
}
```

### 2. Source Type as Plain String

**Decision:** Change `source_type` on Document from TypeScript union to plain string.

**Rationale:** Enables plugins to register new source types at runtime without code changes.

```typescript
// Before (restrictive)
export type DocumentSourceType = 'upload' | 'url' | 'google_drive' | 'dropbox' | 'external';

// After (extensible)
@Column({ name: 'source_type', type: 'text', default: 'upload' })
sourceType: string;

// Well-known types as constants (not exhaustive)
export const SOURCE_TYPES = {
  UPLOAD: 'upload',
  EMAIL: 'email',
  URL: 'url',
} as const;
```

### 3. Source Type Plugin Interface

**Decision:** Define a plugin interface for source types that controls sidebar display and table columns.

```typescript
interface SourceTypePlugin {
  // Identity
  sourceType: string; // 'email' - stored on documents
  displayName: string; // 'Emails' - shown in sidebar
  icon: string; // 'lucide--mail' - sidebar icon

  // Table configuration
  tableColumns: ColumnDef[]; // Custom columns for this source type
  defaultSort: { field: string; direction: 'asc' | 'desc' };

  // Optional customization
  detailView?: React.ComponentType; // Custom detail view
  filterOptions?: FilterConfig[]; // Source-specific filters
}

// Built-in plugins
const uploadPlugin: SourceTypePlugin = {
  sourceType: 'upload',
  displayName: 'Documents',
  icon: 'lucide--file-text',
  tableColumns: [
    { header: 'Name', accessorKey: 'filename' },
    { header: 'Size', accessorKey: 'fileSizeBytes' },
    { header: 'Uploaded', accessorKey: 'createdAt' },
  ],
  defaultSort: { field: 'createdAt', direction: 'desc' },
};

const emailPlugin: SourceTypePlugin = {
  sourceType: 'email',
  displayName: 'Emails',
  icon: 'lucide--mail',
  tableColumns: [
    { header: 'Subject', accessorKey: 'integrationMetadata.email_subject' },
    { header: 'From', accessorKey: 'integrationMetadata.email_from' },
    { header: 'Date', accessorKey: 'integrationMetadata.email_date' },
    { header: 'Source', accessorKey: 'integration.name' }, // Integration display name
  ],
  defaultSort: { field: 'integrationMetadata.email_date', direction: 'desc' },
};
```

### 4. Provider Interface

**Decision:** Define a provider interface for integration implementations.

```typescript
interface IntegrationProvider {
  // Identity
  providerType: string; // 'imap', 'gmail_api', 'slack'
  sourceType: string; // 'email', 'message' - what it produces
  displayName: string; // 'IMAP Email'

  // Configuration
  configSchema: JSONSchema; // For validation and form generation

  // Operations
  testConnection(
    config: unknown
  ): Promise<{ success: boolean; error?: string }>;
  browse(config: unknown, options: BrowseOptions): Promise<BrowseResult>;
  import(config: unknown, items: string[]): Promise<ImportResult>;

  // Sync
  getNewItems(config: unknown, since: Date): Promise<string[]>;
}
```

### 5. Document Storage Model

**Decision:** Store all imported content as Documents with source-specific metadata.

```typescript
// Email document
{
  id: uuid,
  projectId: uuid,
  sourceType: 'email',           // Plain string
  integrationId: uuid,           // FK to Integration
  parentDocumentId: null,        // Emails are root documents

  filename: 'Re: Project Update',  // Email subject as filename
  content: '...',                  // Email body (plain text)

  integrationMetadata: {
    message_id: '<abc123@mail.example.com>',
    folder: 'INBOX',
    email_from: 'alice@example.com',
    email_to: ['bob@example.com'],
    email_cc: [],
    email_subject: 'Re: Project Update',
    email_date: '2026-01-06T10:30:00Z',
    has_attachments: true,
  },
}

// Attachment as child document
{
  id: uuid,
  projectId: uuid,
  sourceType: 'email',           // Same source type as parent
  integrationId: uuid,           // Same integration as parent
  parentDocumentId: <email_doc_id>,  // Points to email

  filename: 'report.pdf',
  content: '...',                // Extracted text
  mimeType: 'application/pdf',

  integrationMetadata: {
    attachment_index: 0,
    original_filename: 'Q4 Report.pdf',
  },
}
```

### 6. Sidebar Dynamic Rendering

**Decision:** Sidebar shows source types dynamically based on existing documents.

```typescript
// Pseudo-code for sidebar rendering
function DataSourcesSidebar() {
  // Query distinct source types that have documents in this project
  const sourceTypes = useSourceTypesWithDocuments(projectId);
  // Returns: ['upload', 'email'] if both types have documents

  // Get plugin configuration for each
  const plugins = sourceTypes.map((type) => getSourceTypePlugin(type));

  return (
    <SidebarSection title="Data Sources">
      {plugins.map((plugin) => (
        <SidebarMenuItem
          key={plugin.sourceType}
          icon={plugin.icon}
          url={`/admin/data-sources/${plugin.sourceType}`}
        >
          {plugin.displayName}
        </SidebarMenuItem>
      ))}
    </SidebarSection>
  );
}
```

**Special case:** "Documents" (upload) is always visible as the default/built-in source.

### 7. IMAP Library: `imapflow`

**Decision:** Use `imapflow` npm package for IMAP operations.

**Alternatives considered:**

- `node-imap`: Callback-based, older API, less maintained
- `imap-simple`: Wrapper around node-imap, still callback-based
- `imapflow`: Modern async/await API, actively maintained, supports IDLE, good TypeScript support

**Rationale:** `imapflow` provides a clean Promise-based API, handles connection pooling, and has excellent TypeScript definitions.

### 8. Credential Storage

**Decision:** Encrypt integration credentials using AES-256-GCM with a server-side key.

**Implementation:**

- Encryption key stored in environment variable `INTEGRATION_CREDENTIALS_KEY`
- Entire config JSON is encrypted (not just password fields)
- Encrypt on save, decrypt on use
- Never log or expose decrypted credentials

```typescript
// CredentialsService
encrypt(config: object): string   // Returns base64 encoded ciphertext
decrypt(encrypted: string): object // Returns config object
```

### 9. Progressive Loading Strategy

**Decision:** Three-phase loading to handle large mailboxes:

**Phase 1: Folder Discovery**

- Connect to IMAP, list folders with message counts
- User selects folders to browse
- Show total counts per folder (e.g., "Inbox: 45,230 messages")

**Phase 2: Preview with Filters**

- Apply user filters (from, to, subject, date)
- Fetch first 100 matching emails (headers only, no body)
- Display in paginated list with checkboxes
- Show "X of Y matching emails" count

**Phase 3: Selection & Import**

- User checks emails to import (or "select all matching")
- Queue import jobs for selected emails
- Process in batches (configurable, default 50/batch)
- Fetch full email body + attachments during import

### 10. Sync Architecture

**Decision:** Extend existing sync worker pattern for integrations.

**Manual Sync:**

- User clicks "Sync Now" button
- Creates immediate sync job
- Fetches new emails matching filters since last sync
- Uses Message-ID for deduplication

**Recurring Sync:**

- Uses existing worker infrastructure
- Configurable interval (15min, 1hr, 6hr, 24hr)
- Only fetches items newer than last sync timestamp
- Respects rate limits and connection pooling

### 11. UI: Expandable Chunks in Documents Table

**Decision:** Add expandable row feature to all source type tables.

**Implementation:**

- Click on row expands to show chunks below
- Lazy-load chunks on expand (don't fetch until needed)
- Reuse existing chunk list component styling
- Collapse on click again or when navigating away

## Risks / Trade-offs

| Risk                                       | Mitigation                                                         |
| ------------------------------------------ | ------------------------------------------------------------------ |
| IMAP connection failures (network, auth)   | Graceful error handling, clear status messages, retry with backoff |
| Large mailboxes overwhelming system        | Progressive loading, pagination, filters, batch processing         |
| Credential security                        | AES-256-GCM encryption, no logging, key rotation support           |
| Attachment processing time                 | Background job queue, progress indicators, size limits             |
| Rate limiting by IMAP servers              | Configurable connection limits, respectful polling intervals       |
| Email format variations (HTML, RTF, plain) | Use `mailparser` for robust parsing, prefer plain text extraction  |
| Plugin complexity                          | Start with built-in plugins, extract plugin system later if needed |

## Migration Plan

1. **Phase 1: Schema Migration**

   - Create `kb.integrations` table
   - Add `integration_id` FK to documents
   - Change `source_type` to plain string (no enum constraint)
   - No breaking changes to existing documents

2. **Phase 2: Backend Implementation**

   - Generic integration CRUD service
   - IMAP provider implementation
   - Sync worker integration
   - Source type plugin registry

3. **Phase 3: Frontend Implementation**

   - Data Sources sidebar section
   - Source type table pages (Documents, Emails)
   - Integration settings UI
   - Email browser/filter UI
   - Expandable chunks in tables

4. **Rollback:** Remove IMAP integration option from UI, disable sync worker. Existing documents remain searchable.

## Open Questions

1. **Attachment size limit?** Suggest 25MB per attachment, 100MB per email total.
2. **Max emails per import batch?** Suggest 50 emails, configurable.
3. **HTML email handling?** Convert to plain text for chunking, or store both?
4. **Plugin loading mechanism?** Built-in for v1, consider npm packages later.

## File Structure

```
apps/server/src/modules/integrations/
├── integrations.module.ts
├── integrations.controller.ts       # Generic CRUD endpoints
├── integrations.service.ts          # Generic integration management
├── credentials.service.ts           # Encryption/decryption
├── integration-sync.worker.ts       # Sync worker
├── entities/
│   └── integration.entity.ts        # Generic integration entity
├── providers/
│   ├── provider.interface.ts        # Provider interface definition
│   ├── provider.registry.ts         # Provider registration
│   └── imap/
│       ├── imap.provider.ts         # IMAP provider implementation
│       ├── imap.service.ts          # IMAP operations
│       ├── imap-connection.service.ts
│       └── dto/
│           ├── imap-config.dto.ts
│           └── imap-filter.dto.ts
└── dto/
    ├── create-integration.dto.ts
    └── update-integration.dto.ts

apps/admin/src/
├── pages/admin/data-sources/
│   ├── index.tsx                    # Redirects to first source type
│   ├── [sourceType]/
│   │   └── index.tsx                # Generic source type table page
│   └── components/
│       ├── SourceTypeTable.tsx      # Dynamic table based on plugin
│       └── ExpandableChunksRow.tsx  # Expandable row component
├── plugins/
│   └── source-types/
│       ├── registry.ts              # Plugin registration
│       ├── upload.plugin.ts         # Documents plugin
│       └── email.plugin.ts          # Emails plugin
└── pages/admin/pages/settings/integrations/
    └── [providerType]/
        └── index.tsx                # Provider-specific config UI
```
