# Google Drive Integration - Complete Architecture Plan

## Executive Summary

A comprehensive Google Drive integration that enables users to connect multiple Drive accounts, browse and select documents, receive AI-powered relevance suggestions, and automatically sync changes. All files are stored in Google Cloud Storage with version tracking, deduplication, and seamless extraction pipeline integration.

## Key Decisions

1. ✅ **Storage**: Google Cloud Storage (prod) + GCS Emulator (dev) - unified API
2. ✅ **Migration**: Clean slate - remove existing document content, start fresh with storage
3. ✅ **Workers**: Postgres-based polling workers (like extraction worker), no Redis/Bull
4. ✅ **Preview**: Pre-signed URLs directly from GCS (no backend proxy)
5. ✅ **Deduplication**: SHA-256 file_hash to detect duplicates across all sources
6. ✅ **File Limit**: 50MB maximum file size
7. ✅ **Multi-Account**: Multiple Google accounts per project, each as separate integration
8. ✅ **Suggestions**: Async classification - Phase 1: filename/path, Phase 2: content analysis
9. ✅ **Versioning**: New Drive version = new document snapshot (treat as new file)
10. ✅ **Hierarchy**: Flat storage with full path in metadata for display

---

## Table of Contents

1. [Storage Architecture](#1-storage-architecture)
2. [Database Schema](#2-database-schema)
3. [Worker Architecture](#3-worker-architecture)
4. [Google Drive API Integration](#4-google-drive-api-integration)
5. [Document Versioning Flow](#5-document-versioning-flow)
6. [Async Suggestion Classifier](#6-async-suggestion-classifier)
7. [Multi-Account Integration UI](#7-multi-account-integration-ui)
8. [Change Detection](#8-change-detection)
9. [Deduplication](#9-deduplication)
10. [API Endpoints](#10-api-endpoints)
11. [Implementation Phases](#11-implementation-phases)

---

## 1. Storage Architecture

### 1.1 Google Cloud Storage Configuration

```typescript
// Environment variables
STORAGE_PROVIDER=gcs
GCS_BUCKET=spec-server-documents
GCS_PROJECT_ID=spec-server-prod
GCS_EMULATOR_HOST=localhost:4443  // Dev only
GCS_CREDENTIALS_PATH=/path/to/service-account.json  // Prod only
STORAGE_PRESIGNED_URL_EXPIRY=3600  // 1 hour
MAX_FILE_SIZE_MB=50
```

### 1.2 Docker Compose - GCS Emulator for Development

```yaml
# docker-compose.yml
services:
  gcs-emulator:
    image: fsouza/fake-gcs-server:latest
    ports:
      - "4443:4443"
    volumes:
      - ./dev-storage:/data
    command: -scheme http -port 4443 -external-url http://localhost:4443
    networks:
      - spec-network
  
  # Backend service
  backend:
    environment:
      - GCS_EMULATOR_HOST=gcs-emulator:4443
      - STORAGE_PROVIDER=gcs
      - GCS_BUCKET=spec-server-dev
      - GCS_PROJECT_ID=test-project
    depends_on:
      - gcs-emulator
    networks:
      - spec-network
```

### 1.3 Storage Service Implementation

**File**: `apps/server/src/common/storage/storage.service.ts`

Key features:
- GCS client with emulator support for dev
- Pre-signed URL generation for direct file access
- File size validation (50MB limit)
- SHA-256 hash calculation for deduplication
- Stream support for large files

Storage key format: `{org_id}/{project_id}/documents/{doc_id}/v{version}/{filename}`

---

## 2. Database Schema

### 2.1 Documents Table Refactor

```sql
-- Migration: 0XXX_storage_and_documents_refactor.sql

BEGIN;

-- Backup existing documents
CREATE TABLE IF NOT EXISTS kb.documents_backup_20250121 AS 
SELECT * FROM kb.documents;

-- Drop content column, add storage columns
ALTER TABLE kb.documents
  DROP COLUMN IF EXISTS content CASCADE,
  
  -- Storage reference
  ADD COLUMN storage_provider TEXT DEFAULT 'gcs' 
    CHECK (storage_provider IN ('gcs', 'inline')),
  ADD COLUMN storage_key TEXT,
  ADD COLUMN file_size BIGINT,
  ADD COLUMN file_hash TEXT,
  
  -- External source tracking
  ADD COLUMN external_source TEXT,
  ADD COLUMN external_id TEXT,
  ADD COLUMN external_url TEXT,
  ADD COLUMN external_metadata JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN synced_at TIMESTAMPTZ,
  ADD COLUMN external_updated_at TIMESTAMPTZ,
  
  -- Versioning
  ADD COLUMN document_version INT DEFAULT 1,
  ADD COLUMN previous_version_id UUID REFERENCES kb.documents(id),
  ADD COLUMN is_latest_version BOOLEAN DEFAULT TRUE,
  
  -- Soft delete
  ADD COLUMN deleted_at TIMESTAMPTZ;

-- Indexes
CREATE INDEX idx_documents_storage_key ON kb.documents(storage_key) 
  WHERE storage_key IS NOT NULL;
  
CREATE INDEX idx_documents_external_source ON kb.documents(external_source, external_id) 
  WHERE external_source IS NOT NULL;
  
CREATE INDEX idx_documents_latest_version ON kb.documents(is_latest_version) 
  WHERE is_latest_version = TRUE;
  
CREATE INDEX idx_documents_file_hash ON kb.documents(file_hash) 
  WHERE file_hash IS NOT NULL;

CREATE INDEX idx_documents_deleted ON kb.documents(deleted_at)
  WHERE deleted_at IS NOT NULL;

COMMIT;
```

### 2.2 Google Drive Sync State Table

```sql
-- Migration: 0XXX_create_google_drive_sync_state.sql

BEGIN;

CREATE TABLE kb.google_drive_sync_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id UUID NOT NULL REFERENCES kb.integrations(id) ON DELETE CASCADE,
  
  -- Drive file identification
  drive_file_id TEXT NOT NULL,
  drive_account_email TEXT NOT NULL,
  
  -- Current document reference (latest version)
  current_document_id UUID REFERENCES kb.documents(id) ON DELETE SET NULL,
  
  -- File metadata
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL, -- /My Drive/Projects/Architecture/design.pdf
  mime_type TEXT NOT NULL,
  file_size BIGINT,
  
  -- State tracking
  state TEXT NOT NULL DEFAULT 'discovered' CHECK (state IN (
    'discovered',    -- Found in Drive, not yet processed
    'pending',       -- In suggestion queue, awaiting classification
    'suggested',     -- Classified, awaiting user approval
    'approved',      -- User approved, ready to import
    'importing',     -- Currently downloading/importing
    'synced',        -- Successfully imported and up-to-date
    'dirty',         -- Changed in Drive, needs re-import
    'deleted',       -- Deleted from Drive
    'no_access',     -- User lost access to file
    'rejected',      -- User rejected as not relevant
    'error'          -- Import/classification error
  )),
  
  -- Change detection
  drive_revision_id TEXT NOT NULL,
  drive_modified_time TIMESTAMPTZ NOT NULL,
  last_synced_at TIMESTAMPTZ,
  
  -- Suggestion/classification
  suggestion_status TEXT CHECK (suggestion_status IN (
    'pending', 'processing', 'completed', 'failed'
  )),
  relevance_score REAL CHECK (relevance_score >= 0 AND relevance_score <= 1),
  relevance_reasoning TEXT,
  classification_method TEXT CHECK (classification_method IN (
    'filename', 'path', 'content', 'manual'
  )),
  classification_date TIMESTAMPTZ,
  user_decision TEXT CHECK (user_decision IN ('approved', 'rejected', 'pending')),
  user_decision_at TIMESTAMPTZ,
  
  -- Change notification (webhook)
  watch_channel_id TEXT,
  watch_resource_id TEXT,
  watch_expiration TIMESTAMPTZ,
  
  -- Error tracking
  last_error TEXT,
  last_error_at TIMESTAMPTZ,
  retry_count INT DEFAULT 0,
  
  -- Version history tracking
  document_versions UUID[] DEFAULT ARRAY[]::UUID[],
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  UNIQUE(integration_id, drive_file_id)
);

-- Indexes
CREATE INDEX idx_google_drive_sync_integration 
  ON kb.google_drive_sync_state(integration_id);
  
CREATE INDEX idx_google_drive_sync_state_pending 
  ON kb.google_drive_sync_state(state) 
  WHERE state IN ('pending', 'dirty', 'approved');
  
CREATE INDEX idx_google_drive_sync_suggestion 
  ON kb.google_drive_sync_state(suggestion_status)
  WHERE suggestion_status = 'pending';
  
CREATE INDEX idx_google_drive_sync_document 
  ON kb.google_drive_sync_state(current_document_id);
  
CREATE INDEX idx_google_drive_sync_watch_expiry 
  ON kb.google_drive_sync_state(watch_expiration)
  WHERE watch_expiration IS NOT NULL;

COMMIT;
```

### 2.3 Multi-Account Integration Support

```sql
-- Migration: 0XXX_integrations_multi_account.sql

BEGIN;

ALTER TABLE kb.integrations
  ADD COLUMN IF NOT EXISTS account_email TEXT,
  ADD COLUMN IF NOT EXISTS account_name TEXT;

DROP INDEX IF EXISTS integrations_name_project_id_key;

CREATE UNIQUE INDEX integrations_name_project_account_unique 
  ON kb.integrations(name, project_id, COALESCE(account_email, ''))
  WHERE deleted_at IS NULL;

COMMIT;
```

---

## 3. Worker Architecture

### Postgres-Based Polling Workers (No Redis/Bull)

Following the existing `ExtractionWorkerService` pattern:

**Pattern**: setTimeout-based polling → query pending jobs with `FOR UPDATE SKIP LOCKED` → process → repeat

### 3.1 Suggestion Worker

**File**: `apps/server/src/modules/google-drive/workers/suggestion-worker.service.ts`

- Polls every 5 seconds
- Processes batch of 10 files
- Classifies by filename/path (Phase 1)
- Updates suggestion_status and relevance_score

### 3.2 Import Worker

**File**: `apps/server/src/modules/google-drive/workers/import-worker.service.ts`

- Polls every 10 seconds
- Processes 3 files concurrently (I/O heavy)
- Downloads from Drive
- Stores in GCS
- Creates document record
- Triggers extraction job

### 3.3 Polling Worker (Change Detection Fallback)

**File**: `apps/server/src/modules/google-drive/workers/polling-worker.service.ts`

- Runs daily (24 hours)
- Checks all synced files for changes
- Backup for webhook failures
- Marks changed files as 'dirty'

---

## 4. Google Drive API Integration

### 4.1 OAuth2 Service

**File**: `apps/server/src/modules/google-drive/google-drive-oauth.service.ts`

Features:
- Generate authorization URL
- Exchange code for tokens (access + refresh)
- Refresh expired tokens
- Revoke tokens on disconnect

Scopes:
- `https://www.googleapis.com/auth/drive.readonly`
- `https://www.googleapis.com/auth/drive.metadata.readonly`
- `https://www.googleapis.com/auth/userinfo.email`

### 4.2 Drive API Client

**File**: `apps/server/src/modules/google-drive/google-drive-api.client.ts`

Methods:
- `listFiles()` - Browse folders with pagination
- `getFile()` - Get file metadata
- `downloadFile()` - Download regular files
- `exportFile()` - Export Google Workspace files (Docs → DOCX, Sheets → CSV)
- `exportAsText()` - Get plain text for classification
- `getRevisions()` - Check file changes
- `watchFile()` - Setup push notifications
- `stopChannel()` - Cancel webhooks

---

## 5. Document Versioning Flow

### Version Chain Example

```
User imports: architecture.pdf from Google Drive

v1: doc_789 (Drive revision abc123, synced: 2025-01-15)
├─ storage: org/proj/documents/doc_789/v1/architecture.pdf
├─ file_hash: sha256:abcd1234...
└─ is_latest_version: TRUE

[User edits file in Drive]

v2: doc_790 (Drive revision def456, synced: 2025-01-20)
├─ previous_version_id: doc_789
├─ storage: org/proj/documents/doc_789/v2/architecture.pdf
├─ file_hash: sha256:efgh5678...
└─ is_latest_version: TRUE

v1: doc_789
└─ is_latest_version: FALSE

sync_state:
  current_document_id: doc_790
  document_versions: [doc_789, doc_790]
```

### Key Points

- Each Drive change creates a NEW document record
- Storage key uses base document ID + version number
- Old versions kept with `is_latest_version = FALSE`
- Extraction runs on each new version
- Can view version history

---

## 6. Async Suggestion Classifier

### Phase 1: Filename/Path-Based (MVP)

**File**: `apps/server/src/modules/google-drive/services/google-drive-suggestion.service.ts`

**Algorithm**:
1. Start with neutral score (0.5)
2. Boost for relevant folder names (docs, architecture, specs, etc.)
3. Boost for KB purpose keyword matches
4. Reduce for irrelevant patterns (archive, backup, temp, etc.)
5. Reduce for deep nesting (>5 levels)
6. Clamp to 0-1 range

**Example**:
- `/My Drive/Architecture/System Design.pdf` → 0.85 (high)
- `/My Drive/Personal/Archive/old-notes.txt` → 0.25 (low)

### Phase 2: Content-Based (Future)

Uses Google Drive API to export as plain text, analyzes content with LLM.

---

## 7. Multi-Account Integration UI

### Account List View

```tsx
<IntegrationSection name="Google Drive">
  {driveAccounts.map(account => (
    <IntegrationCard
      icon={<GoogleDriveIcon />}
      title="Google Drive"
      subtitle={account.account_email}  // user@gmail.com
      status={account.enabled ? 'connected' : 'disconnected'}
      lastSync={account.last_sync_at}
    />
  ))}
  
  <Button onClick={connectNewAccount}>
    + Connect Another Account
  </Button>
</IntegrationSection>
```

### Selection Wizard

**Steps**:
1. **Browse & Select** - Tree view of folders/files
2. **AI Suggestions** - Processing classification
3. **Review** - High/Medium/Low relevance groups
4. **Import** - Progress tracking

**3-Tier Suggestion UI**:
- High Relevance (>0.7): Auto-selected, green badge
- Medium Relevance (0.4-0.7): User review, yellow badge
- Low Relevance (<0.4): Not selected, gray badge

Users can override any suggestion.

---

## 8. Change Detection

### 8.1 Google Drive Push Notifications (Webhooks)

**Setup**:
```typescript
POST https://www.googleapis.com/drive/v3/files/{fileId}/watch
Body: {
  id: 'channel-id',
  type: 'web_hook',
  address: 'https://your-domain.com/webhooks/google-drive/{integrationId}',
  expiration: timestamp  // Max 24 hours, must renew
}
```

**Webhook Payload**:
```
Headers:
  X-Goog-Channel-ID: channel-id
  X-Goog-Resource-State: change | sync
  X-Goog-Resource-ID: resource-id
```

**Handler**: Marks file as 'dirty' when change detected

### 8.2 Polling Fallback

Runs daily to catch missed webhooks:
- Query all synced files
- Check revisions via API
- Mark changed files as dirty

### 8.3 Re-Import Flow

1. User sees notification: "3 documents changed in Google Drive"
2. Clicks "Re-extract All" or reviews individually
3. Import worker downloads new versions
4. Creates new document records (version snapshots)
5. Triggers extraction jobs

---

## 9. Deduplication

### Hash-Based Detection

```typescript
// Before creating document, check hash
const existing = await documentsService.findByHash(fileHash, projectId, orgId);

if (existing) {
  // Skip upload, link to existing document
  return { document: existing, isDuplicate: true };
}
```

### Use Cases

1. **Same file in multiple folders**: Only stored once
2. **Re-upload of existing file**: Detected, not duplicated
3. **Across integrations**: File from Drive = same file from upload

---

## 10. API Endpoints

```
# OAuth
GET  /api/v1/integrations/google-drive/oauth/authorize
GET  /api/v1/integrations/google-drive/oauth/callback

# Account Management
GET  /api/v1/integrations/google-drive/accounts
DELETE /api/v1/integrations/google-drive/accounts/:integrationId

# Browsing
GET  /api/v1/integrations/google-drive/:integrationId/browse
GET  /api/v1/integrations/google-drive/:integrationId/files/:fileId

# Discovery & Suggestions
POST /api/v1/integrations/google-drive/:integrationId/discover
GET  /api/v1/integrations/google-drive/:integrationId/suggestions
POST /api/v1/integrations/google-drive/:integrationId/suggestions/:fileId/approve
POST /api/v1/integrations/google-drive/:integrationId/suggestions/:fileId/reject
POST /api/v1/integrations/google-drive/:integrationId/suggestions/bulk-approve

# Import
POST /api/v1/integrations/google-drive/:integrationId/import
GET  /api/v1/integrations/google-drive/:integrationId/import-status

# Sync State
GET  /api/v1/integrations/google-drive/:integrationId/sync-state
POST /api/v1/integrations/google-drive/:integrationId/sync-dirty

# Webhooks (Internal)
POST /webhooks/google-drive/:integrationId
```

---

## 11. Implementation Phases

### Phase 1: Storage Foundation (Week 1)
- [x] GCS emulator in Docker
- [x] StorageService implementation
- [x] Documents table migration
- [x] File size validation (50MB)
- [x] Pre-signed URLs

### Phase 2: OAuth & Multi-Account (Week 1-2)
- [ ] Google OAuth2 service
- [ ] OAuth endpoints
- [ ] Multi-account database support
- [ ] Account management UI
- [ ] Token refresh logic

### Phase 3: Browse & Discover (Week 2)
- [ ] Drive API client
- [ ] Browse folders endpoint
- [ ] File filtering
- [ ] Discovery job
- [ ] Frontend folder browser

### Phase 4: Async Suggestions (Week 2-3)
- [ ] Suggestion worker service
- [ ] Filename/path classifier
- [ ] Sync state table
- [ ] Suggestion API
- [ ] Review UI (3-tier)

### Phase 5: Import & Versioning (Week 3)
- [ ] Import worker service
- [ ] Download & store logic
- [ ] Document versioning
- [ ] Extraction trigger
- [ ] Deduplication

### Phase 6: Change Detection (Week 3-4)
- [ ] Webhook controller
- [ ] Webhook service
- [ ] Polling fallback
- [ ] Change notifications
- [ ] Re-import flow

### Phase 7: Content Classifier (Future)
- [ ] Content export
- [ ] LLM classification
- [ ] Cost optimization

---

## 12. Environment Variables

```bash
# Google Drive
GOOGLE_DRIVE_ENABLED=true
GOOGLE_DRIVE_CLIENT_ID=xxx.apps.googleusercontent.com
GOOGLE_DRIVE_CLIENT_SECRET=xxx
GOOGLE_DRIVE_OAUTH_REDIRECT_URI=http://localhost:3000/api/v1/integrations/google-drive/oauth/callback

# Storage (GCS)
STORAGE_PROVIDER=gcs
GCS_BUCKET=spec-server-documents
GCS_PROJECT_ID=spec-server-prod
GCS_LOCATION=US
GCS_CREDENTIALS_PATH=/path/to/service-account.json  # Prod
GCS_EMULATOR_HOST=localhost:4443  # Dev
STORAGE_PRESIGNED_URL_EXPIRY=3600
MAX_FILE_SIZE_MB=50

# Workers
GOOGLE_DRIVE_SUGGESTION_POLL_INTERVAL_MS=5000
GOOGLE_DRIVE_SUGGESTION_BATCH_SIZE=10
GOOGLE_DRIVE_IMPORT_POLL_INTERVAL_MS=10000
GOOGLE_DRIVE_IMPORT_CONCURRENCY=3
GOOGLE_DRIVE_POLLING_INTERVAL_MS=86400000  # 24h

# Webhooks
PUBLIC_URL=https://your-domain.com
```

---

## 13. Testing Strategy

### Unit Tests
- StorageService: CRUD operations, pre-signed URLs
- Suggestion classifier: scoring logic
- Import service: versioning, deduplication
- OAuth service: token management

### Integration Tests
- OAuth flow end-to-end
- Browse folders with pagination
- Import flow: download → store → extract
- Change detection: webhook → re-import
- Deduplication: same file twice

### E2E Tests (Playwright)
1. Connect Drive account
2. Browse and select files
3. Get AI suggestions
4. Review and approve
5. Import files
6. Verify documents created
7. Simulate change
8. Re-import changed file

---

## 14. Security

- OAuth tokens encrypted at rest
- Minimal scopes (read-only)
- Pre-signed URLs expire (1 hour)
- File size limits enforced
- Webhook channel ID validation
- Audit logging
- User can revoke access anytime

---

## 15. Monitoring

- Worker metrics: processed, failed, queue depth
- Storage: upload/download counts, sizes
- API: request counts, latencies
- Classification: accuracy, score distribution
- Import: success rate, duration
- Webhooks: received, processed, failed
- Cost tracking: GCS storage, LLM calls

---

## Conclusion

This plan provides a complete, production-ready architecture for Google Drive integration:

✅ **Storage**: GCS with emulator for dev  
✅ **Workers**: Postgres-based polling (no Redis)  
✅ **Multi-account**: Multiple Drive accounts per project  
✅ **Suggestions**: AI-powered relevance classification  
✅ **Versioning**: Document snapshots for each Drive change  
✅ **Deduplication**: SHA-256 hash-based duplicate detection  
✅ **Change Detection**: Webhooks + polling fallback  
✅ **UX**: Comprehensive wizard with suggestion review  

The architecture follows existing patterns in the codebase (extraction workers, integrations module) and is ready for implementation.
