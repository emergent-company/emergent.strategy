
# Google Drive Integration - Final Architecture Plan

## Executive Summary

Based on decisions:

1. ✅ Unified storage solution for uploads + integrations (aligned with Dockling)
2. ✅ Document schema extension with external_source, storage_ref, versioning
3. ✅ Document versioning - new version = new snapshot (treat as new file)
4. ✅ 50MB file limit, store in storage, extract locally (can re-trigger anytime)
5. ✅ Multi-account per integration - each account = separate integration instance with email
6. ✅ Async suggestion classifier - Phase 1: filename/path, Phase 2: content analysis

---

## 1. Unified Storage Architecture

### 1.1 Storage Backend

// Storage abstraction layer
interface StorageProvider {
  put(key: string, data: Buffer | Stream, metadata?: Record<string, any>): Promise<string>;
  get(key: string): Promise<{ data: Buffer | Stream; metadata: Record<string, any> }>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
  getUrl(key: string, expiresIn?: number): Promise<string>; // Pre-signed URL for preview
}

// Implementations
class LocalFileSystemStorage implements StorageProvider { ... }
class S3Storage implements StorageProvider { ... }
class GCSStorage implements StorageProvider { ... }

### 1.2 Storage Key Structure

Format: {org_id}/{project_id}/documents/{document_id}/v{version}/{filename}

Examples:
- org_123/proj_456/documents/doc_789/v1/architecture.pdf
- org_123/proj_456/documents/doc_789/v2/architecture.pdf  (new version after Drive change)

### 1.3 Configuration

// Environment variables
STORAGE_PROVIDER=local|s3|gcs
STORAGE_BASE_PATH=/var/lib/spec-server/storage  // for local
STORAGE_BUCKET=spec-server-documents  // for S3/GCS
STORAGE_REGION=us-east-1  // for S3
MAX_FILE_SIZE_MB=50

---

## 2. Database Schema Changes

### 2.1 Extend Documents Table

-- Migration: Add storage and external source tracking to documents
ALTER TABLE kb.documents
  -- Storage reference
  ADD COLUMN storage_provider TEXT CHECK (storage_provider IN ('local', 's3', 'gcs', 'inline')),
  ADD COLUMN storage_key TEXT, -- Path in storage system
  ADD COLUMN file_size BIGINT, -- Bytes
  ADD COLUMN file_hash TEXT, -- SHA-256 for deduplication

  -- External source tracking (aligned with graph_objects)
  ADD COLUMN external_source TEXT, -- 'google_drive', 'clickup', 'upload', etc.
  ADD COLUMN external_id TEXT, -- Drive file ID, ClickUp task ID, etc.
  ADD COLUMN external_url TEXT, -- Link to source
  ADD COLUMN external_metadata JSONB, -- Source-specific metadata
  ADD COLUMN synced_at TIMESTAMPTZ,
  ADD COLUMN external_updated_at TIMESTAMPTZ,

  -- Versioning
  ADD COLUMN document_version INT DEFAULT 1,
  ADD COLUMN previous_version_id UUID REFERENCES kb.documents(id),
  ADD COLUMN is_latest_version BOOLEAN DEFAULT TRUE;

-- For inline storage (legacy/small files), content stays in 'content' column
-- For file storage, content is NULL, data lives in storage_provider at storage_key

CREATE INDEX idx_documents_storage_key ON kb.documents(storage_key) WHERE storage_key IS NOT NULL;
CREATE INDEX idx_documents_external_source ON kb.documents(external_source, external_id)
  WHERE external_source IS NOT NULL;
CREATE INDEX idx_documents_latest_version ON kb.documents(is_latest_version)
  WHERE is_latest_version = TRUE;
CREATE INDEX idx_documents_file_hash ON kb.documents(file_hash) WHERE file_hash IS NOT NULL;

COMMENT ON COLUMN kb.documents.storage_provider IS 'Where file is stored: inline (content column), local, s3, gcs';
COMMENT ON COLUMN kb.documents.storage_key IS 'Storage path/key for retrieving file';
COMMENT ON COLUMN kb.documents.external_source IS 'Integration that created this document (google_drive, clickup, upload, etc.)';
COMMENT ON COLUMN kb.documents.document_version IS 'Version number for this document, increments on re-import from source';
COMMENT ON COLUMN kb.documents.previous_version_id IS 'Previous version of this document (linked list of versions)';
COMMENT ON COLUMN kb.documents.is_latest_version IS 'Quick filter for latest version of multi-version documents';

### 2.2 Google Drive Sync State

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
  state TEXT NOT NULL CHECK (state IN (
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
  suggestion_status TEXT CHECK (suggestion_status IN ('pending', 'processing', 'completed', 'failed')),
  relevance_score REAL CHECK (relevance_score >= 0 AND relevance_score <= 1),
  relevance_reasoning TEXT,
  classification_method TEXT, -- 'filename', 'path', 'content', 'manual'
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
  document_versions UUID[], -- Array of all document_id versions

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(integration_id, drive_file_id)
);

CREATE INDEX idx_google_drive_sync_integration ON kb.google_drive_sync_state(integration_id);
CREATE INDEX idx_google_drive_sync_state_pending ON kb.google_drive_sync_state(state)
  WHERE state IN ('pending', 'dirty', 'approved');
CREATE INDEX idx_google_drive_sync_suggestion ON kb.google_drive_sync_state(suggestion_status)
  WHERE suggestion_status = 'pending';
CREATE INDEX idx_google_drive_sync_document ON kb.google_drive_sync_state(current_document_id);

### 2.3 Multi-Account Integration Support

-- Update integrations table to support account_email
ALTER TABLE kb.integrations
  ADD COLUMN account_email TEXT, -- user@gmail.com for Google Drive
  ADD COLUMN account_name TEXT;  -- Display name

-- Drop old unique constraint, add new one with account_email
DROP INDEX IF EXISTS integrations_name_project_id_key;

CREATE UNIQUE INDEX integrations_name_project_account_unique
  ON kb.integrations(name, project_id, COALESCE(account_email, ''))
  WHERE deleted_at IS NULL;

COMMENT ON COLUMN kb.integrations.account_email IS 'Account identifier for multi-account integrations (e.g., email for Google Drive)';
COMMENT ON COLUMN kb.integrations.account_name IS 'Display name for the account';

---

## 3. Document Versioning Flow

### 3.1 Version Chain Example

User imports: architecture.pdf from Google Drive
│
├─ v1: doc_789 (Drive revision abc123, synced_at: 2025-01-15)
│  └─ storage: org/proj/documents/doc_789/v1/architecture.pdf
│
[User edits file in Drive]
│
├─ v2: doc_790 (Drive revision def456, synced_at: 2025-01-20)
│  ├─ previous_version_id: doc_789
│  ├─ is_latest_version: TRUE
│  └─ storage: org/proj/documents/doc_789/v2/architecture.pdf  (same base ID!)
│
└─ v1: doc_789 (is_latest_version: FALSE)

sync_state:
  current_document_id: doc_790
  document_versions: [doc_789, doc_790]

### 3.2 Re-extraction on Version Change

async handleDriveFileChange(syncState: GoogleDriveSyncState) {
  // 1. Download new version from Drive
  const fileContent = await this.driveClient.downloadFile(syncState.drive_file_id);

  // 2. Create NEW document record (snapshot)
  const newVersion = await this.documentsService.createVersion({
    previous_version_id: syncState.current_document_id,
    document_version: currentDoc.document_version + 1,
    filename: syncState.file_name,
    storage_provider: 'local', // or s3, gcs
    storage_key: `${orgId}/${projectId}/documents/${baseDocId}/v${newVersion}/...`,
    external_source: 'google_drive',
    external_id: syncState.drive_file_id,
    external_updated_at: syncState.drive_modified_time,
    is_latest_version: true
  });

  // 3. Update old version to not latest
  await this.documentsService.update(syncState.current_document_id, {
    is_latest_version: false
  });

  // 4. Store file in storage
  await this.storage.put(newVersion.storage_key, fileContent);

  // 5. Trigger extraction job for new version
  await this.extractionJobsService.createJob({
    document_id: newVersion.id,
    source_integration_id: syncState.integration_id
  });

  // 6. Update sync state
  await this.db.query(`
    UPDATE kb.google_drive_sync_state
    SET current_document_id = $1,
        document_versions = array_append(document_versions, $1),
        state = 'synced',
        last_synced_at = now()
    WHERE id = $2
  `, [newVersion.id, syncState.id]);
}

---

## 4. Async Suggestion Classifier

### 4.1 Classification Queue Architecture

// Background job processes suggestion queue
interface SuggestionJob {
  sync_state_id: string;
  drive_file_id: string;
  file_name: string;
  file_path: string;
  mime_type: string;
  classification_method: 'filename' | 'content';
}

// Priority: filename first (fast), content second (expensive)
class GoogleDriveSuggestionService {

  // Phase 1: Fast filename/path classification
  async classifyByFilename(job: SuggestionJob): Promise<ClassificationResult> {
    const kbPurpose = await this.getProjectKbPurpose(job.project_id);

    // Simple heuristics + optional LLM call
    const signals = {
      path_depth: job.file_path.split('/').length,
      folder_names: this.extractFolderNames(job.file_path),
      filename: job.file_name,
      extension: path.extname(job.file_name),

      // Keyword matching against KB purpose
      keyword_matches: this.findKeywords(job.file_name + ' ' + job.file_path, kbPurpose)
    };

    // Scoring rules
    let score = 0.5; // Neutral baseline

    // Boost score for relevant folder names
    if (signals.folder_names.some(f =>
      ['docs', 'documentation', 'architecture', 'design', 'specs'].includes(f.toLowerCase())
    )) {
      score += 0.2;
    }

    // Boost for keyword matches
    score += Math.min(signals.keyword_matches.length * 0.1, 0.3);

    // Reduce for common non-relevant patterns
    if (signals.folder_names.some(f =>
      ['archive', 'old', 'backup', 'temp'].includes(f.toLowerCase())
    )) {
      score -= 0.3;
    }

    return {
      relevance_score: Math.max(0, Math.min(1, score)),
      reasoning: this.generateReasoning(signals),
      classification_method: 'filename'
    };
  }

  // Phase 2: Content-based classification (Google Drive API)
  async classifyByContent(job: SuggestionJob): Promise<ClassificationResult> {
    // Use Google Drive API to export as plain text
    const textContent = await this.driveClient.exportAsText(job.drive_file_id);
    const preview = textContent.substring(0, 2000); // First 2KB

    const kbPurpose = await this.getProjectKbPurpose(job.project_id);

    // LLM classification
    const prompt = `
      Knowledge Base Purpose:
      ${kbPurpose}

      Document: ${job.file_name}
      Path: ${job.file_path}
      Preview: ${preview}

      Is this document relevant? Provide:
      - relevance_score (0.0-1.0)
      - reasoning (brief)
    `;

    const result = await this.llm.classify(prompt);

    return {
      relevance_score: result.relevance_score,
      reasoning: result.reasoning,
      classification_method: 'content'
    };
  }

  // Batch classification for efficiency
  async classifyBatch(jobs: SuggestionJob[], method: 'filename' | 'content'): Promise<void> {
    const batchSize = method === 'filename' ? 50 : 10;

    for (let i = 0; i < jobs.length; i += batchSize) {
      const batch = jobs.slice(i, i + batchSize);

      await Promise.all(
        batch.map(job => this.classifyOne(job, method))
      );

      // Rate limiting for content method (LLM calls)
      if (method === 'content') {
        await this.sleep(1000); // 1 second between batches
      }
    }
  }
}

### 4.2 Suggestion Queue Processing

// Cron job or message queue consumer
@Cron('*/5 * * * *') // Every 5 minutes
async processSuggestionQueue() {
  // Get pending suggestions (limit 100 per run)
  const pending = await this.db.query(`
    SELECT *
    FROM kb.google_drive_sync_state
    WHERE suggestion_status = 'pending'
    ORDER BY created_at ASC
    LIMIT 100
  `);

  if (!pending.rows.length) return;

  // Mark as processing
  await this.db.query(`
    UPDATE kb.google_drive_sync_state
    SET suggestion_status = 'processing'
    WHERE id = ANY($1)
  `, [pending.rows.map(r => r.id)]);

  // Classify batch (filename-based first)
  for (const syncState of pending.rows) {
    try {
      const result = await this.suggestionService.classifyByFilename({
        sync_state_id: syncState.id,
        drive_file_id: syncState.drive_file_id,
        file_name: syncState.file_name,
        file_path: syncState.file_path,
        mime_type: syncState.mime_type
      });

      await this.db.query(`
        UPDATE kb.google_drive_sync_state
        SET suggestion_status = 'completed',
            relevance_score = $1,
            relevance_reasoning = $2,
            classification_method = $3,
            classification_date = now(),
            state = 'suggested'
        WHERE id = $4
      `, [
        result.relevance_score,
        result.reasoning,
        result.classification_method,
        syncState.id
      ]);

    } catch (error) {
      await this.db.query(`
        UPDATE kb.google_drive_sync_state
        SET suggestion_status = 'failed',
            last_error = $1,
            last_error_at = now()
        WHERE id = $2
      `, [error.message, syncState.id]);
    }
  }
}

---

## 5. Multi-Account Integration UI

### 5.1 Integration List View

// Shows all connected Drive accounts
<IntegrationSection name="Google Drive">
  {driveAccounts.map(account => (
    <IntegrationCard
      key={account.id}
      icon={<GoogleDriveIcon />}
      title="Google Drive"
      subtitle={account.account_email}  // user1@gmail.com
      status={account.enabled ? 'connected' : 'disconnected'}
      lastSync={account.last_sync_at}
      onConfigure={() => openConfig(account.id)}
      onSync={() => openSyncWizard(account.id)}
      onDisconnect={() => revokeAccess(account.id)}
    />
  ))}

  <Button onClick={connectNewAccount}>
    + Connect Another Account
  </Button>
</IntegrationSection>

### 5.2 Selection Wizard with Suggestions

<GoogleDriveSelectionWizard accountEmail="user@gmail.com">
  <Step1: Browse & Select>
    <FolderTree
      onSelect={handleSelect}
      selectedIds={selectedIds}
    />
    <Button onClick={requestSuggestions}>
      Get AI Suggestions
    </Button>
  </Step1>

  <Step2: Review Suggestions>
    {/* Show classification results */}
    <SuggestionList>
      <SuggestionGroup title="Highly Relevant (>0.7)" defaultExpanded>
        {highRelevance.map(file => (
          <FileRow
            key={file.id}
            name={file.name}
            path={file.path}
            score={file.relevance_score}
            reasoning={file.relevance_reasoning}
            selected={true}  // Auto-selected
            onToggle={() => toggleSelection(file.id)}
          />
        ))}
      </SuggestionGroup>

      <SuggestionGroup title="Maybe Relevant (0.4-0.7)">
        {mediumRelevance.map(file => (
          <FileRow
            key={file.id}
            name={file.name}
            path={file.path}
            score={file.relevance_score}
            reasoning={file.relevance_reasoning}
            selected={false}  // User decides
            onToggle={() => toggleSelection(file.id)}
          />
        ))}
      </SuggestionGroup>

      <SuggestionGroup title="Not Relevant (<0.4)" defaultCollapsed>
        {lowRelevance.map(file => (
          <FileRow
            key={file.id}
            name={file.name}
            path={file.path}
            score={file.relevance_score}
            reasoning={file.relevance_reasoning}
            selected={false}
            onToggle={() => toggleSelection(file.id)}
          />
        ))}
      </SuggestionGroup>
    </SuggestionList>

    <Actions>
      <Button onClick={approveSelected}>
        Import {selectedCount} Files
      </Button>
    </Actions>
  </Step2>

  <Step3: Import Progress>
    {/* Real-time progress */}
  </Step3>
</GoogleDriveSelectionWizard>

---

## 6. Storage Migration Plan

### 6.1 Migration Strategy for Existing Documents

// Migration script: Move inline documents to storage
async migrateDocumentsToStorage() {
  const inlineDocs = await this.db.query(`
    SELECT id, content, filename, mime_type, org_id, project_id
    FROM kb.documents
    WHERE storage_provider IS NULL
      AND content IS NOT NULL
      AND length(content) > 0
    ORDER BY created_at ASC
  `);

  for (const doc of inlineDocs.rows) {
    try {
      // Generate storage key
      const storageKey = `${doc.org_id}/${doc.project_id}/documents/${doc.id}/v1/${doc.filename}`;

      // Upload to storage
      await this.storage.put(storageKey, Buffer.from(doc.content, 'utf-8'));

      // Calculate file hash
      const hash = crypto.createHash('sha256').update(doc.content).digest('hex');

      // Update document record
      await this.db.query(`
        UPDATE kb.documents
        SET storage_provider = $1,
            storage_key = $2,
            file_size = $3,
            file_hash = $4,
            content = NULL,  -- Clear inline content
            document_version = 1,
            is_latest_version = TRUE
        WHERE id = $5
      `, [
        process.env.STORAGE_PROVIDER || 'local',
        storageKey,
        Buffer.from(doc.content, 'utf-8').length,
        hash,
        doc.id
      ]);

      console.log(`Migrated document ${doc.id} to storage`);

    } catch (error) {
      console.error(`Failed to migrate document ${doc.id}:`, error);
      // Continue with next document
    }
  }
}

### 6.2 Backward Compatibility

// Document service handles both inline and storage-based docs
class DocumentsService {
  async getDocumentContent(documentId: string): Promise<Buffer> {
    const doc = await this.db.query(`
      SELECT storage_provider, storage_key, content
      FROM kb.documents
      WHERE id = $1
    `, [documentId]);

    if (!doc.rows.length) {
      throw new NotFoundException('Document not found');
    }

    const row = doc.rows[0];

    // Backward compat: inline content
    if (!row.storage_provider || row.storage_provider === 'inline') {
      return Buffer.from(row.content || '', 'utf-8');
    }

    // Storage-based
    const { data } = await this.storage.get(row.storage_key);
    return data;
  }
}

---

## 7. API Endpoints

// Multi-account OAuth
GET  /api/v1/integrations/google-drive/oauth/authorize
     ?project_id=xxx
     &org_id=xxx
     &redirect_uri=...

GET  /api/v1/integrations/google-drive/oauth/callback
     ?code=xxx
     &state=xxx

// Account management
GET  /api/v1/integrations/google-drive/accounts
     ?project_id=xxx

DELETE /api/v1/integrations/google-drive/accounts/:integrationId

// Browsing
GET  /api/v1/integrations/google-drive/:integrationId/browse
     ?folder_id=root

// Selection & Suggestions
POST /api/v1/integrations/google-drive/:integrationId/discover
     Body: { folder_ids: [...], recursive: true }
     Response: { job_id: xxx }

GET  /api/v1/integrations/google-drive/:integrationId/suggestions
     ?status=pending|completed
     Response: { files: [ ... ], total: 123 }

POST /api/v1/integrations/google-drive/:integrationId/suggestions/:fileId/approve
POST /api/v1/integrations/google-drive/:integrationId/suggestions/:fileId/reject

// Bulk operations
POST /api/v1/integrations/google-drive/:integrationId/import
     Body: { drive_file_ids: [...] }
     Response: { job_id: xxx }

// Sync state
GET  /api/v1/integrations/google-drive/:integrationId/sync-state
     ?state=dirty|synced

POST /api/v1/integrations/google-drive/:integrationId/sync-dirty
     Body: { drive_file_ids: [...] }

// Webhooks
POST /webhooks/google-drive/:integrationId

---

## Implementation Phases

### Phase 1: Storage Foundation (Week 1)

• Design & implement storage abstraction layer
• Database schema migrations (documents + sync_state)
• Migration script for existing documents
• File size validation (50MB limit)

### Phase 2: OAuth & Multi-Account (Week 1-2)

• Google OAuth2 flow with multi-account support
• Integration management UI (list accounts)
• Account connection/disconnection
• Token refresh logic

### Phase 3: Browse & Discover (Week 2)

• Drive API client implementation
• Folder browsing API
• File filtering by MIME type
• Discovery job (find all files in selected folders)

### Phase 4: Async Suggestions (Week 2-3)

• Suggestion queue architecture
• Filename/path-based classifier
• Background job processor
• Suggestion UI (3-tier: high/medium/low)

### Phase 5: Import & Versioning (Week 3)

• Document import with storage
• Version snapshot system
• Extraction job triggering
• Import progress tracking

### Phase 6: Change Detection (Week 3-4)

• Webhook setup & renewal
• Change detection (dirty marking)
• Re-import workflow
• Polling fallback

### Phase 7: Content Classifier (Phase 2)

• Google Drive text export
• LLM-based content classification
• Batch processing optimization

---

## Open Items to Resolve

1. Storage Provider Choice: Local filesystem (dev) + S3 (prod)? Or GCS to match Drive?
2. Migration Timeline: Migrate existing docs immediately or gradually?
3. Suggestion Queue: Use existing job queue or new microservice?
4. Preview URLs: Pre-signed URLs for storage? Or stream through backend?
5. Deduplication: Use file_hash to detect duplicate files across integrations?

This plan is now complete and actionable. Shall I proceed with creating the first implementation files?
Build claude-sonnet-4-5 (20 Oct 2025 11:58 PM)

1. on production we will use google cloud storage, on dev services which has same API but runs in docker (same as for dockling)
2. we can remove all files and start fresh
3. I don't know, definitelly we should use same meachnism, i guess good practices is to have different workers but the queue can be the same? what is your recommendation?
4. Pre-signed directly from storage - anything agains this solution?
5. yes
mcj (12:03 AM)

Updating plan

[✓] Design unified storage solution with GCS (prod) and GCS emulator (dev)
[ ] Create migration to remove existing document content and add storage schema
[ ] Design worker architecture - separate workers, shared queue infrastructure
[ ] Implement pre-signed URL generation for document preview/download
[ ] Add file deduplication logic using file_hash
[ ] Set up GCS emulator in Docker for dev environment
[ ] Implement Google Drive API client with OAuth2 multi-account
[ ] Build document import with storage integration and versioning
[ ] Create async suggestion worker and queue
[ ] Build integration UI with multi-account management

Perfect! Let me finalize the architecture with these decisions:

---

# Google Drive Integration - Final Architecture (v2)

## Decisions Finalized

1. ✅ Storage: GCS (production) + GCS emulator in Docker (dev) - same API
2. ✅ Migration: Remove all existing document content, start fresh with storage
3. ✅ Workers: Separate workers (extraction, suggestion, import), shared queue (Bull/BullMQ)
4. ✅ Preview: Pre-signed URLs directly from GCS (no proxy through backend)
5. ✅ Deduplication: Use file_hash to detect duplicates across all sources

---

## 1. Storage Architecture - Google Cloud Storage

### 1.1 GCS Configuration

// Environment variables
STORAGE_PROVIDER=gcs
GCS_BUCKET=spec-server-documents
GCS_PROJECT_ID=spec-server-prod
GCS_EMULATOR_HOST=localhost:4443  // For dev only
GCS_CREDENTIALS_PATH=/path/to/service-account.json  // Prod only
STORAGE_PRESIGNED_URL_EXPIRY=3600  // 1 hour
MAX_FILE_SIZE_MB=50

### 1.2 Docker Compose - GCS Emulator

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

  # Ensure backend can reach emulator
  backend:
    environment:
      - GCS_EMULATOR_HOST=gcs-emulator:4443
      - STORAGE_PROVIDER=gcs
      - GCS_BUCKET=spec-server-dev
    depends_on:
      - gcs-emulator

### 1.3 Storage Service Implementation

// apps/server-nest/src/common/storage/storage.service.ts

import { Injectable, Logger } from '@nestjs/common';
import { Storage, Bucket } from '@google-cloud/storage';
import { Readable } from 'stream';
import * as crypto from 'crypto';

export interface StorageMetadata {
  contentType?: string;
  contentDisposition?: string;
  cacheControl?: string;
  customMetadata?: Record<string, string>;
}

export interface StoredObject {
  data: Buffer | Readable;
  metadata: StorageMetadata;
  size: number;
}

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private storage: Storage;
  private bucket: Bucket;
  private readonly bucketName: string;
  private readonly maxFileSizeMB: number;

  constructor() {
    const emulatorHost = process.env.GCS_EMULATOR_HOST;

    // Configure GCS client
    this.storage = new Storage({
      projectId: process.env.GCS_PROJECT_ID || 'spec-server-dev',
      ...(emulatorHost && {
        apiEndpoint: `http://${emulatorHost}`,
        projectId: 'test-project',
      }),
      ...(process.env.GCS_CREDENTIALS_PATH && {
        keyFilename: process.env.GCS_CREDENTIALS_PATH,
      }),
    });

    this.bucketName = process.env.GCS_BUCKET || 'spec-server-dev';
    this.maxFileSizeMB = parseInt(process.env.MAX_FILE_SIZE_MB || '50', 10);

    this.initBucket();
  }

  private async initBucket() {
    try {
      this.bucket = this.storage.bucket(this.bucketName);
      const [exists] = await this.bucket.exists();

      if (!exists) {
        this.logger.log(`Creating bucket: ${this.bucketName}`);
        await this.storage.createBucket(this.bucketName, {
          location: process.env.GCS_LOCATION || 'US',
          storageClass: 'STANDARD',
        });
      }

      this.logger.log(`Storage initialized: ${this.bucketName}`);
    } catch (error) {
      this.logger.error(`Failed to initialize storage: ${error.message}`);
      throw error;
    }
  }

  /**
   * Upload file to storage
   */
  async put(
    key: string,
    data: Buffer | Readable,
    metadata?: StorageMetadata,
  ): Promise<{ key: string; size: number; hash: string }> {
    const file = this.bucket.file(key);

    // Check file size for Buffer
    if (Buffer.isBuffer(data)) {
      const sizeMB = data.length / (1024 * 1024);
      if (sizeMB > this.maxFileSizeMB) {
        throw new Error(`File size ${sizeMB.toFixed(2)}MB exceeds limit of ${this.maxFileSizeMB}MB`);
      }
    }

    // Calculate hash
    const hash = Buffer.isBuffer(data)
      ? crypto.createHash('sha256').update(data).digest('hex')
      : null; // Hash will be null for streams, calculate separately if needed

    await file.save(data, {
      metadata: {
        contentType: metadata?.contentType || 'application/octet-stream',
        metadata: metadata?.customMetadata || {},
      },
      resumable: false, // Faster for files < 10MB
    });

    const [fileMetadata] = await file.getMetadata();

    this.logger.debug(`Stored file: ${key} (${fileMetadata.size} bytes)`);

    return {
      key,
      size: parseInt(fileMetadata.size, 10),
      hash: hash || '', // Return empty string if hash not calculated
    };
  }

  /**
   * Download file from storage
   */
  async get(key: string): Promise<StoredObject> {
    const file = this.bucket.file(key);

    const [exists] = await file.exists();
    if (!exists) {
      throw new Error(`File not found: ${key}`);
    }

    const [metadata] = await file.getMetadata();
    const [data] = await file.download();

    return {
      data,
      metadata: {
        contentType: metadata.contentType,
        customMetadata: metadata.metadata || {},
      },
      size: parseInt(metadata.size, 10),
    };
  }

  /**
   * Get a readable stream for large files
   */
  getStream(key: string): Readable {
    return this.bucket.file(key).createReadStream();
  }

  /**
   * Delete file from storage
   */
  async delete(key: string): Promise<void> {
    const file = this.bucket.file(key);
    await file.delete({ ignoreNotFound: true });
    this.logger.debug(`Deleted file: ${key}`);
  }

  /**
   * Check if file exists
   */
  async exists(key: string): Promise<boolean> {
    const [exists] = await this.bucket.file(key).exists();
    return exists;
  }

  /**
   * Generate pre-signed URL for direct access
   */
  async getSignedUrl(
    key: string,
    expiresIn: number = 3600, // 1 hour default
    action: 'read' | 'write' = 'read',
  ): Promise<string> {
    const file = this.bucket.file(key);

    const [url] = await file.getSignedUrl({
      version: 'v4',
      action,
      expires: Date.now() + expiresIn * 1000,
    });

    return url;
  }

  /**
   * Copy file to new location (for versioning)
   */
  async copy(sourceKey: string, destKey: string): Promise<void> {
    await this.bucket.file(sourceKey).copy(this.bucket.file(destKey));
    this.logger.debug(`Copied file: ${sourceKey} -> ${destKey}`);
  }

  /**
   * List files with prefix
   */
  async list(prefix: string): Promise<string[]> {
    const [files] = await this.bucket.getFiles({ prefix });
    return files.map(f => f.name);
  }

  /**
   * Calculate hash of existing file
   */
  async getFileHash(key: string): Promise<string> {
    const { data } = await this.get(key);
    return crypto.createHash('sha256').update(data as Buffer).digest('hex');
  }
}

---

## 2. Worker Architecture - Shared Queue, Separate Workers

### 2.1 Queue Infrastructure (Bull)

// apps/server-nest/src/common/queue/queue.module.ts

import { Module, Global } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { ConfigService } from '../config/config.service';

export const QUEUE_NAMES = {
  EXTRACTION: 'extraction',
  SUGGESTION: 'suggestion', // NEW
  IMPORT: 'import',         // NEW
  WEBHOOK: 'webhook',
} as const;

@Global()
@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        redis: {
          host: config.get('REDIS_HOST') || 'localhost',
          port: parseInt(config.get('REDIS_PORT') || '6379', 10),
          password: config.get('REDIS_PASSWORD'),
          db: parseInt(config.get('REDIS_DB') || '0', 10),
        },
        defaultJobOptions: {
          removeOnComplete: 100, // Keep last 100 completed jobs
          removeOnFail: 500,     // Keep last 500 failed jobs
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 2000,
          },
        },
      }),
    }),

    // Register all queues
    BullModule.registerQueue(
      { name: QUEUE_NAMES.EXTRACTION },
      { name: QUEUE_NAMES.SUGGESTION },
      { name: QUEUE_NAMES.IMPORT },
      { name: QUEUE_NAMES.WEBHOOK },
    ),
  ],
  exports: [BullModule],
})
export class QueueModule {}

### 2.2 Suggestion Worker

// apps/server-nest/src/modules/google-drive/workers/suggestion.worker.ts

import { Processor, Process, OnQueueCompleted, OnQueueFailed } from '@nestjs/bull';
import { Job } from 'bull';
import { Logger } from '@nestjs/common';
import { QUEUE_NAMES } from '@/common/queue/queue.module';
import { GoogleDriveSuggestionService } from '../services/google-drive-suggestion.service';

export interface SuggestionJob {
  sync_state_id: string;
  drive_file_id: string;
  integration_id: string;
  file_name: string;
  file_path: string;
  mime_type: string;
  classification_method: 'filename' | 'content';
  project_id: string;
  org_id: string;
}

@Processor(QUEUE_NAMES.SUGGESTION)
export class GoogleDriveSuggestionWorker {
  private readonly logger = new Logger(GoogleDriveSuggestionWorker.name);

  constructor(
    private readonly suggestionService: GoogleDriveSuggestionService,
  ) {}

  @Process({ name: 'classify-file', concurrency: 10 })
  async handleClassification(job: Job<SuggestionJob>): Promise<void> {
    const { data } = job;

    this.logger.log(
      `[${job.id}] Classifying file: ${data.file_name} (method: ${data.classification_method})`
    );

    await job.progress(10);

    try {
      const result = await this.suggestionService.classify(
        data,
        data.classification_method,
      );

      await job.progress(90);

      await this.suggestionService.saveClassificationResult(
        data.sync_state_id,
        result,
      );

      await job.progress(100);

      this.logger.log(
        `[${job.id}] Classification complete: ${data.file_name} (score: ${result.relevance_score})`
      );
    } catch (error) {
      this.logger.error(
        `[${job.id}] Classification failed: ${error.message}`,
        error.stack,
      );
      throw error; // Will trigger retry
    }
  }

  @OnQueueCompleted()
  onCompleted(job: Job) {
    this.logger.debug(`Job ${job.id} completed`);
  }

  @OnQueueFailed()
  onFailed(job: Job, error: Error) {
    this.logger.error(`Job ${job.id} failed: ${error.message}`);
  }
}

### 2.3 Import Worker

// apps/server-nest/src/modules/google-drive/workers/import.worker.ts

import { Processor, Process } from '@nestjs/bull';
import { Job } from 'bull';
import { Logger } from '@nestjs/common';
import { QUEUE_NAMES } from '@/common/queue/queue.module';
import { GoogleDriveImportService } from '../services/google-drive-import.service';

export interface ImportJob {
  sync_state_id: string;
  drive_file_id: string;
  integration_id: string;
  project_id: string;
  org_id: string;
  is_new_version: boolean;
  previous_document_id?: string;
}

@Processor(QUEUE_NAMES.IMPORT)
export class GoogleDriveImportWorker {
  private readonly logger = new Logger(GoogleDriveImportWorker.name);

  constructor(
    private readonly importService: GoogleDriveImportService,
  ) {}

  @Process({ name: 'import-file', concurrency: 5 }) // Lower concurrency for I/O heavy
  async handleImport(job: Job<ImportJob>): Promise<void> {
    const { data } = job;

    this.logger.log(`[${job.id}] Importing file: ${data.drive_file_id}`);

    try {
      // Download from Drive
      await job.progress(10);
      const fileData = await this.importService.downloadFile(
        data.integration_id,
        data.drive_file_id,
      );

      // Store in GCS
      await job.progress(40);
      const storageResult = await this.importService.storeFile(
        data.project_id,
        data.org_id,
        data.sync_state_id,
        fileData,
        data.is_new_version ? data.previous_document_id : undefined,
      );

      // Create/update document record
      await job.progress(60);
      const document = await this.importService.createDocumentRecord(
        data,
        storageResult,
      );

      // Trigger extraction job
      await job.progress(80);
      await this.importService.triggerExtraction(
        document.id,
        data.integration_id,
      );

      // Update sync state
      await job.progress(95);
      await this.importService.updateSyncState(
        data.sync_state_id,
        'synced',
        document.id,
      );

      await job.progress(100);

      this.logger.log(`[${job.id}] Import complete: document ${document.id}`);
    } catch (error) {
      await this.importService.updateSyncState(
        data.sync_state_id,
        'error',
        null,
        error.message,
      );
      throw error;
    }
  }
}

### 2.4 Queue Management Service

// apps/server-nest/src/modules/google-drive/services/google-drive-queue.service.ts

import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { QUEUE_NAMES } from '@/common/queue/queue.module';
import { SuggestionJob } from '../workers/suggestion.worker';
import { ImportJob } from '../workers/import.worker';

@Injectable()
export class GoogleDriveQueueService {
  private readonly logger = new Logger(GoogleDriveQueueService.name);

  constructor(
    @InjectQueue(QUEUE_NAMES.SUGGESTION)
    private suggestionQueue: Queue<SuggestionJob>,

    @InjectQueue(QUEUE_NAMES.IMPORT)
    private importQueue: Queue<ImportJob>,
  ) {}

  /**
   * Queue file for classification
   */
  async queueSuggestion(job: SuggestionJob, priority?: number): Promise<string> {
    const result = await this.suggestionQueue.add('classify-file', job, {
      priority: priority || 5,
      jobId: `suggest-${job.sync_state_id}`,
      removeOnComplete: true,
    });

    return result.id.toString();
  }

  /**
   * Queue multiple files for classification
   */
  async queueSuggestionBatch(jobs: SuggestionJob[]): Promise<void> {
    const bulkJobs = jobs.map(job => ({
      name: 'classify-file',
      data: job,
      opts: {
        jobId: `suggest-${job.sync_state_id}`,
        removeOnComplete: true,
      },
    }));

    await this.suggestionQueue.addBulk(bulkJobs);

    this.logger.log(`Queued ${jobs.length} files for suggestion`);
  }

  /**
   * Queue file for import
   */
  async queueImport(job: ImportJob): Promise<string> {
    const result = await this.importQueue.add('import-file', job, {
      jobId: `import-${job.sync_state_id}`,
      timeout: 300000, // 5 minutes
    });

    return result.id.toString();
  }

  /**
   * Queue multiple files for import
   */
  async queueImportBatch(jobs: ImportJob[]): Promise<void> {
    const bulkJobs = jobs.map(job => ({
      name: 'import-file',
      data: job,
      opts: {
        jobId: `import-${job.sync_state_id}`,
        timeout: 300000,
      },
    }));

    await this.importQueue.addBulk(bulkJobs);

    this.logger.log(`Queued ${jobs.length} files for import`);
  }

  /**
   * Get queue statistics
   */
  async getStats(queueName: 'suggestion' | 'import') {
    const queue = queueName === 'suggestion' ? this.suggestionQueue : this.importQueue;

    const [waiting, active, completed, failed] = await Promise.all([
      queue.getWaitingCount(),
      queue.getActiveCount(),
      queue.getCompletedCount(),
      queue.getFailedCount(),
    ]);

    return { waiting, active, completed, failed };
  }

  /**
   * Get job status
   */
  async getJobStatus(jobId: string, queueName: 'suggestion' | 'import') {
    const queue = queueName === 'suggestion' ? this.suggestionQueue : this.importQueue;
    const job = await queue.getJob(jobId);

    if (!job) {
      return null;
    }

    return {
      id: job.id,
      name: job.name,
      progress: job.progress(),
      state: await job.getState(),
      finishedOn: job.finishedOn,
      failedReason: job.failedReason,
      returnvalue: job.returnvalue,
    };
  }
}

---

## 3. Deduplication Using File Hash

// apps/server-nest/src/modules/documents/documents.service.ts (extended)

class DocumentsService {

  /**
   * Check if file already exists by hash
   */
  async findByHash(
    fileHash: string,
    projectId: string,
    orgId: string,
  ): Promise<DocumentDto | null> {
    const result = await this.db.query(`
      SELECT *
      FROM kb.documents
      WHERE file_hash = $1
        AND project_id = $2
        AND org_id = $3
        AND is_latest_version = TRUE
        AND deleted_at IS NULL
      LIMIT 1
    `, [fileHash, projectId, orgId]);

    return result.rows.length ? this.mapRow(result.rows[0]) : null;
  }

  /**
   * Create document with deduplication check
   */
  async createWithDedup(params: CreateDocumentParams): Promise<{
    document: DocumentDto;
    isDuplicate: boolean;
    duplicateOf?: string;
  }> {
    // Check for duplicate
    const existing = await this.findByHash(
      params.file_hash,
      params.project_id,
      params.org_id,
    );

    if (existing) {
      this.logger.log(
        `Duplicate file detected: ${params.filename} ` +
        `(hash: ${params.file_hash.substring(0, 8)}..., ` +
        `existing: ${existing.id})`
      );

      // Option 1: Return existing document (don't create duplicate)
      return {
        document: existing,
        isDuplicate: true,
        duplicateOf: existing.id,
      };

      // Option 2: Create link/reference (future enhancement)
      // Could add a "duplicate_of" field to documents table
    }

    // Not a duplicate, create new document
    const document = await this.create(params);

    return {
      document,
      isDuplicate: false,
    };
  }
}

---

## 4. Migration - Clean Slate for Documents

-- Migration: 0XXX_storage_and_documents_refactor.sql

-- WARNING: This migration removes all existing document content!
-- Backup any critical data before running.

BEGIN;

-- Step 1: Backup old documents (optional, for rollback)
CREATE TABLE IF NOT EXISTS kb.documents_backup_20250121 AS
SELECT * FROM kb.documents;

-- Step 2: Drop content column and add storage columns
ALTER TABLE kb.documents
  DROP COLUMN IF EXISTS content CASCADE,

  -- Storage reference
  ADD COLUMN storage_provider TEXT DEFAULT 'gcs' CHECK (storage_provider IN ('gcs', 'inline')),
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

-- Step 3: Create indexes
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

-- Step 4: Add comments
COMMENT ON COLUMN kb.documents.storage_provider IS 'Storage backend: gcs (Google Cloud Storage), inline (legacy small files)';
COMMENT ON COLUMN kb.documents.storage_key IS 'GCS object key: {org_id}/{project_id}/documents/{doc_id}/v{version}/{filename}';
COMMENT ON COLUMN kb.documents.file_hash IS 'SHA-256 hash of file content for deduplication';
COMMENT ON COLUMN kb.documents.external_source IS 'Integration that created this document: google_drive, clickup, upload';
COMMENT ON COLUMN kb.documents.document_version IS 'Version number, increments on re-import from source';
COMMENT ON COLUMN kb.documents.previous_version_id IS 'Previous version in version chain';

-- Step 5: Create Google Drive sync state table
CREATE TABLE kb.google_drive_sync_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id UUID NOT NULL REFERENCES kb.integrations(id) ON DELETE CASCADE,

  drive_file_id TEXT NOT NULL,
  drive_account_email TEXT NOT NULL,
  current_document_id UUID REFERENCES kb.documents(id) ON DELETE SET NULL,

  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  file_size BIGINT,

  state TEXT NOT NULL DEFAULT 'discovered' CHECK (state IN (
    'discovered', 'pending', 'suggested', 'approved', 'importing',
    'synced', 'dirty', 'deleted', 'no_access', 'rejected', 'error'
  )),

  drive_revision_id TEXT NOT NULL,
  drive_modified_time TIMESTAMPTZ NOT NULL,
  last_synced_at TIMESTAMPTZ,

  suggestion_status TEXT CHECK (suggestion_status IN ('pending', 'processing', 'completed', 'failed')),
  relevance_score REAL CHECK (relevance_score >= 0 AND relevance_score <= 1),
  relevance_reasoning TEXT,
  classification_method TEXT CHECK (classification_method IN ('filename', 'path', 'content', 'manual')),
  classification_date TIMESTAMPTZ,
  user_decision TEXT CHECK (user_decision IN ('approved', 'rejected', 'pending')),
  user_decision_at TIMESTAMPTZ,

  watch_channel_id TEXT,
  watch_resource_id TEXT,
  watch_expiration TIMESTAMPTZ,

  last_error TEXT,
  last_error_at TIMESTAMPTZ,
  retry_count INT DEFAULT 0,

  document_versions UUID[] DEFAULT ARRAY[]::UUID[],

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(integration_id, drive_file_id)
);

CREATE INDEX idx_google_drive_sync_integration ON kb.google_drive_sync_state(integration_id);
CREATE INDEX idx_google_drive_sync_state ON kb.google_drive_sync_state(state)
  WHERE state IN ('pending', 'dirty', 'approved');
CREATE INDEX idx_google_drive_sync_suggestion ON kb.google_drive_sync_state(suggestion_status)
  WHERE suggestion_status = 'pending';
CREATE INDEX idx_google_drive_sync_document ON kb.google_drive_sync_state(current_document_id);
CREATE INDEX idx_google_drive_sync_watch_expiry ON kb.google_drive_sync_state(watch_expiration)
  WHERE watch_expiration IS NOT NULL;

-- Step 6: Add multi-account support to integrations
ALTER TABLE kb.integrations
  ADD COLUMN IF NOT EXISTS account_email TEXT,
  ADD COLUMN IF NOT EXISTS account_name TEXT;

-- Drop old unique constraint if exists
DROP INDEX IF EXISTS integrations_name_project_id_key;

-- Create new unique index with account email
CREATE UNIQUE INDEX integrations_name_project_account_unique
  ON kb.integrations(name, project_id, COALESCE(account_email, ''))
  WHERE deleted_at IS NULL;

COMMENT ON COLUMN kb.integrations.account_email IS 'Account identifier for multi-account integrations (e.g., user@gmail.com for Google Drive)';

COMMIT;

---

## 5. Summary - Worker Recommendation

Recommendation: Separate workers, shared queue infrastructure

### Why This Approach?

1. Separation of Concerns
 • Suggestion worker: Lightweight, CPU-bound (classification logic)
 • Import worker: I/O-heavy (download, storage, DB writes)
 • Extraction worker: Already exists, CPU/memory-heavy (LLM calls)
2. Independent Scaling
 • Run 10 suggestion workers (fast, parallel classification)
 • Run 5 import workers (limited by storage bandwidth)
 • Run 3 extraction workers (limited by LLM quotas)
3. Resource Optimization
 • Suggestion workers: Low memory, high concurrency
 • Import workers: Moderate memory, moderate concurrency
 • Extraction workers: High memory, low concurrency
4. Shared Infrastructure Benefits
 • Single Redis instance
 • Single Bull/BullMQ setup
 • Unified monitoring/observability
 • Consistent retry/error handling


### Worker Architecture Diagram

┌─────────────────────────────────────────────────┐
│              Redis (Queue Backend)              │
└────────┬────────────┬────────────┬──────────────┘
         │            │            │
         ▼            ▼            ▼
    ┌────────┐  ┌─────────┐  ┌──────────┐
    │Suggest │  │ Import  │  │Extraction│
    │Workers │  │ Workers │  │ Workers  │
    │(x10)   │  │  (x5)   │  │  (x3)    │
    └────────┘  └─────────┘  └──────────┘

This architecture is production-ready, scalable, and follows best practices. 
