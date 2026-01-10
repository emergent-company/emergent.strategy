# Change: Add IMAP Data Sources Integration

## Why

Users need to ingest emails as knowledge sources alongside traditional document uploads. Currently, the system only supports file uploads and URL ingestion. Many organizations have valuable knowledge trapped in email archives that should be searchable and queryable through the knowledge base.

This change introduces:

1. **IMAP integration** - Connect to email servers and selectively import emails as documents
2. **Data Sources navigation** - A new sidebar section grouping all content sources (Documents, Emails, future types)
3. **Plugin-friendly architecture** - Generic integration model supporting multiple providers per source type
4. **Document hierarchy** - Parent-child relationships between documents (e.g., email → attachments)
5. **Expandable chunks view** - View document chunks inline within the documents table

## What Changes

### 1. Sidebar Navigation

- **NEW** "Data Sources" section in sidebar:
  - **Documents** - Built-in, always visible (uploaded files)
  - **Emails** - Visible when documents with `source_type: 'email'` exist
  - Future source types appear dynamically based on existing documents
- Each source type shows ALL documents of that type in one table (across integrations)

### 2. Generic Integration Entity

- **NEW** `Integration` entity (replaces provider-specific entities):
  - `provider_type: string` - The provider implementation (`'imap'`, `'gmail_api'`, `'slack'`, etc.)
  - `source_type: string` - What kind of documents it produces (`'email'`, `'message'`, etc.)
  - `name: string` - User-defined display name ("Work Gmail", "Personal Outlook")
  - `config_encrypted: jsonb` - Provider-specific configuration (credentials, filters, etc.)
  - Sync configuration: `sync_mode`, `sync_interval_minutes`, `last_synced_at`, `status`
- Multiple integrations can share the same `source_type` (e.g., two IMAP connections both produce emails)

### 3. Document Entity Enhancements

- **MODIFIED** `source_type` field: Change from TypeScript union to plain `string` for plugin extensibility
  - Built-in types: `'upload'`, `'email'`
  - Plugins can register additional types at runtime
- **NEW** `integration_id` FK: Reference to the integration that created the document (null for uploads)
- **EXISTING** `parent_document_id` FK: Self-reference for document hierarchy (already exists)
- Existing documents default to `source_type: 'upload'`

### 4. Documents Table - Expandable Chunks

- **NEW** Expandable row feature to view chunks inline within documents table
- Similar UX to existing chunk detail view, but embedded in the table row
- Chunks page remains accessible (not removed in this change)

### 5. Source Type Tables

Each source type gets its own table view in Data Sources:

**Emails Table** (when viewing Data Sources > Emails):
| Subject | From | Date | Source | Status | Actions |
|---------|------|------|--------|--------|---------|
| Project Update | alice@work.com | Jan 5 | Work Gmail | Processed | ... |
| Invoice #123 | billing@vendor.com | Jan 4 | Personal Outlook | Processed | ... |

- "Source" column shows the integration `name` for easy identification
- All emails from all integrations in one table with filtering options

### 6. IMAP Provider Implementation

- **NEW** IMAP provider (first implementation of the integration framework):
  - Connection configuration: server, port, encryption, credentials
  - Mailbox/folder browser with message counts
  - Email filters: from, to, subject, date range, folder
  - Progressive loading: counts → preview 100 → selection
  - Sync modes: manual and recurring
- Email processing:
  - Email body → Document with `source_type: 'email'`
  - Attachments → Child documents with `parent_document_id`

### 7. Plugin Architecture (Foundation)

- **NEW** Source type plugin interface:
  ```typescript
  interface SourceTypePlugin {
    sourceType: string; // 'email'
    displayName: string; // 'Emails'
    icon: string; // 'lucide--mail'
    tableColumns: ColumnDef[]; // Custom columns for this source type
  }
  ```
- Built-in plugins: `upload` (Documents), `email` (Emails)
- Future plugins can register new source types without schema changes

## Impact

- **Affected specs:**

  - `sidebar-navigation` (new capability) - Data Sources section with dynamic source types
  - `document-management` - Source types as strings, parent-child relationships, expandable chunks
  - `imap-integration` (new capability) - Generic integration model + IMAP provider

- **Affected code:**

  - `apps/admin/src/pages/admin/layout.tsx` - Sidebar structure
  - `apps/admin/src/pages/admin/apps/data-sources/` - New section with source type pages
  - `apps/server/src/entities/document.entity.ts` - source_type as string, integration_id FK
  - `apps/server/src/entities/integration.entity.ts` - **NEW** generic integration entity
  - `apps/server/src/modules/integrations/` - Integration framework + IMAP provider
  - `apps/server/src/modules/documents/` - Parent-child queries, source type filtering
  - Database migrations for new tables and columns

- **NOT breaking changes:**
  - Existing documents continue to work (default `source_type: 'upload'`)
  - Chunks page remains (can be deprecated later)
  - New fields are nullable/have defaults

## Design Considerations

See `design.md` for:

- Generic integration entity design
- Plugin architecture and source type registration
- IMAP library selection and connection pooling
- Credential storage and encryption
- Email deduplication strategy (by Message-ID)
- Sync job architecture
- Progressive loading implementation
- Parent-child document queries
