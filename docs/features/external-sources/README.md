# External Sources Framework

The External Sources Framework enables importing documents from external platforms like Google Drive, web URLs, and other cloud storage providers. Documents can be imported via API or through the chat interface.

## Overview

- **Purpose**: Import and sync documents from external sources
- **Supported Providers**: Google Drive (public), Web URLs
- **Integration Points**: REST API, Chat MCP Tool
- **Sync Modes**: Manual, Periodic (configurable)

## Quick Start

### Import via API

```bash
# Import a Google Doc
curl -X POST http://localhost:3002/api/external-sources/import \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://docs.google.com/document/d/YOUR_DOC_ID/edit",
    "projectId": "your-project-id"
  }'

# Import a web page
curl -X POST http://localhost:3002/api/external-sources/import \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://example.com/document.pdf",
    "projectId": "your-project-id"
  }'
```

### Import via Chat

Simply share a link in the chat:

- "Can you import this document? https://docs.google.com/document/d/ABC123/edit"
- "Please add this to the knowledge base: https://example.com/report.pdf"

The AI assistant will use the `import_document` tool to fetch and import the document.

## Documentation

| Document                                  | Description                          |
| ----------------------------------------- | ------------------------------------ |
| [API Reference](./API.md)                 | REST API endpoints and DTOs          |
| [Architecture](./ARCHITECTURE.md)         | Provider framework and system design |
| [Adding Providers](./ADDING_PROVIDERS.md) | Guide for implementing new providers |
| [Troubleshooting](./TROUBLESHOOTING.md)   | Common issues and solutions          |

## Supported URL Formats

### Google Drive

| Format          | Example                                                |
| --------------- | ------------------------------------------------------ |
| Drive file      | `https://drive.google.com/file/d/{fileId}/view`        |
| Drive open      | `https://drive.google.com/open?id={fileId}`            |
| Google Docs     | `https://docs.google.com/document/d/{fileId}/edit`     |
| Google Sheets   | `https://docs.google.com/spreadsheets/d/{fileId}/edit` |
| Google Slides   | `https://docs.google.com/presentation/d/{fileId}/edit` |
| Google Drawings | `https://docs.google.com/drawings/d/{fileId}/edit`     |

**Note**: Only publicly shared documents are supported. Private documents require OAuth integration (Phase 2).

### Web URLs

Any publicly accessible URL with supported content types:

- `text/plain`, `text/html`, `text/markdown`
- `application/pdf`
- `application/json`, `application/xml`

## Database Schema

The framework uses the `kb.external_sources` table to track imported sources:

```sql
CREATE TABLE kb.external_sources (
  id UUID PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES kb.projects(id),
  provider_type TEXT NOT NULL,  -- 'google_drive', 'url'
  external_id TEXT NOT NULL,    -- Provider-specific ID
  original_url TEXT NOT NULL,
  normalized_url TEXT NOT NULL,
  display_name TEXT,
  mime_type TEXT,
  sync_policy TEXT DEFAULT 'manual',
  last_synced_at TIMESTAMPTZ,
  status TEXT DEFAULT 'active',
  error_count INT DEFAULT 0,
  last_error TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
);
```

Documents linked to external sources have:

- `source_type`: 'external' (vs 'upload')
- `external_source_id`: FK to `external_sources.id`
- `sync_version`: Incremented on each sync

## Architecture

```
┌─────────────────┐     ┌──────────────────────┐
│   Chat/API      │────>│  ExternalSourcesService │
└─────────────────┘     └──────────┬───────────┘
                                   │
                    ┌──────────────┴──────────────┐
                    │                             │
           ┌────────▼────────┐          ┌────────▼────────┐
           │ ProviderRegistry │          │   SyncWorker    │
           └────────┬────────┘          └─────────────────┘
                    │
        ┌───────────┼───────────┐
        │           │           │
   ┌────▼────┐ ┌────▼────┐ ┌────▼────┐
   │ Google  │ │   URL   │ │ Future  │
   │  Drive  │ │Provider │ │Providers│
   └─────────┘ └─────────┘ └─────────┘
```

## Testing

```bash
# Unit tests (115 tests)
cd apps/server && npx vitest run tests/unit/external-sources

# E2E tests (24 tests)
cd apps/server && npx vitest run -c vitest.e2e.config.ts tests/e2e/external-sources.api.e2e.spec.ts
```

## Future Enhancements (Phase 2)

- OAuth integration for private Google Drive files
- Dropbox, OneDrive, S3 providers
- Folder-level sync
- Webhook-based real-time sync
- UI for managing external sources
