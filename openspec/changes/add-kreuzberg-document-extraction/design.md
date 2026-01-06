# Design: Kreuzberg Document Extraction with MinIO Storage

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                     USER UPLOADS DOCUMENT                        │
│                  POST /documents/upload                          │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│              CREATE kb.document_parsing_jobs                     │
│                   status: 'pending'                              │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│           DocumentParsingWorkerService (polling)                 │
│                                                                  │
│  ┌─────────────────┐         ┌─────────────────────────────┐   │
│  │ Plain Text?     │──YES───▶│ Read as UTF-8               │   │
│  │ (.txt,.md,.csv) │         │ (No external service call)  │   │
│  └────────┬────────┘         └──────────────┬──────────────┘   │
│           │NO                               │                   │
│           ▼                                 │                   │
│  ┌─────────────────────┐                    │                   │
│  │ Kreuzberg Service   │                    │                   │
│  │ POST /extract       │                    │                   │
│  │ (PDF,DOCX,images)   │                    │                   │
│  └──────────┬──────────┘                    │                   │
│             │                               │                   │
│             ▼                               ▼                   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              Upload to MinIO/GCS                         │   │
│  │  • Original file → documents bucket                      │   │
│  │  • Extracted images → documents bucket (optional)        │   │
│  └──────────────────────────┬──────────────────────────────┘   │
│                              │                                  │
│                              ▼                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              Create Database Records                     │   │
│  │  • kb.documents (with storage_key, storage_url)          │   │
│  │  • kb.document_artifacts (tables, images)                │   │
│  └──────────────────────────┬──────────────────────────────┘   │
│                              │                                  │
│                              ▼                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              Auto-Extract? (optional)                    │   │
│  │  • Create kb.object_extraction_jobs                      │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

## Decision Records

### ADR-001: Use Pre-built Docker Images

**Context**: Both Kreuzberg and MinIO have official Docker images.

**Decision**: Use pre-built images for both services.

**Rationale**:

- No custom Dockerfile maintenance
- Faster setup and deployment
- Automatic security updates
- Consistent behavior across environments

**Images**:

- Kreuzberg: `goldziher/kreuzberg:latest`
- MinIO: `minio/minio:latest`
- MinIO Client: `minio/mc:latest`

### ADR-002: Provider-Agnostic Storage Service

**Context**: Need storage that works in dev (no cloud costs) and prod (scalable).

**Decision**: Implement `StorageService` abstraction supporting MinIO, GCS, and S3.

**Rationale**:

- Same interface regardless of provider
- Switch providers via environment variable
- S3 API compatibility enables MinIO → GCS/S3 migration
- Real storage behavior in local development

**Consequences**:

- Additional npm dependencies (@aws-sdk/client-s3, @google-cloud/storage)
- Need to test with multiple providers

### ADR-003: Store Original Files in Object Storage

**Context**: Original binary files could be stored in DB (BLOB) or object storage.

**Decision**: Store original files in MinIO/GCS, reference via `storage_key`.

**Rationale**:

- Database size remains manageable
- Signed URLs for direct download
- Can implement retention policies (30-day default)
- Separate storage concerns from transactional data

**Consequences**:

- Must handle storage cleanup on document deletion
- Need migration for existing documents

### ADR-004: Follow Existing Worker Pattern

**Context**: System already has `ExtractionWorkerService` for async job processing.

**Decision**: Model `DocumentParsingWorkerService` after existing extraction worker.

**Rationale**:

- Consistent patterns across codebase
- Proven retry/recovery logic
- Team familiarity with approach
- Same monitoring/logging patterns

**Reference**: `apps/server/src/modules/extraction-jobs/extraction-worker.service.ts`

### ADR-005: Separate Artifacts Table

**Context**: Extracted tables/images need storage.

**Decision**: Create `kb.document_artifacts` table with foreign key to documents.

**Rationale**:

- Tables stored as structured JSON (queryable)
- Images stored in MinIO with reference in artifacts
- Cascade delete with parent document
- Supports future artifact types (charts, formulas)

## Docker Service Configuration

### Infrastructure Location

Services are deployed via `/root/emergent-infra/kreuzberg/` following the existing infrastructure pattern (similar to `postgres/`, `zitadel/`, `langfuse/`).

```
emergent-infra/
├── kreuzberg/                 # NEW - Document extraction + storage
│   ├── docker-compose.yaml
│   ├── .env.example
│   ├── .env                   # gitignored
│   ├── README.md
│   └── scripts/
│       ├── health-check.sh
│       └── test-extraction.sh
├── postgres/                  # Existing - Application database
├── zitadel/                   # Existing - Identity provider
└── langfuse/                  # Existing - AI observability
```

### docker-compose.yaml (in emergent-infra/kreuzberg/)

```yaml
# Kreuzberg Document Extraction Service + MinIO Object Storage
services:
  kreuzberg:
    image: goldziher/kreuzberg:latest
    container_name: emergent-kreuzberg
    restart: unless-stopped
    ports:
      - '${KREUZBERG_PORT:-8000}:8000'
    environment:
      - LOG_LEVEL=${KREUZBERG_LOG_LEVEL:-info}
    healthcheck:
      test: ['CMD', 'curl', '-f', 'http://localhost:8000/health']
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 10s
    deploy:
      resources:
        limits:
          memory: 2G
        reservations:
          memory: 512M
    networks:
      - kreuzberg-network

  minio:
    image: minio/minio:latest
    container_name: emergent-minio
    restart: unless-stopped
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: ${MINIO_ROOT_USER:-minioadmin}
      MINIO_ROOT_PASSWORD: ${MINIO_ROOT_PASSWORD:?MINIO_ROOT_PASSWORD is required}
      MINIO_DOMAIN: ${MINIO_DOMAIN:-minio}
    ports:
      - '${MINIO_API_PORT:-9000}:9000'
      - '${MINIO_CONSOLE_PORT:-9001}:9001'
    volumes:
      - minio_data:/data
    healthcheck:
      test: ['CMD', 'curl', '-f', 'http://localhost:9000/minio/health/live']
      interval: 30s
      timeout: 10s
      retries: 3
    networks:
      - kreuzberg-network

  minio-init:
    image: minio/mc:latest
    container_name: emergent-minio-init
    depends_on:
      minio:
        condition: service_healthy
    entrypoint: >
      /bin/sh -c "
      sleep 2;
      /usr/bin/mc alias set myminio http://minio:9000 $${MINIO_ROOT_USER:-minioadmin} $${MINIO_ROOT_PASSWORD};
      /usr/bin/mc mb myminio/documents --ignore-existing;
      /usr/bin/mc mb myminio/document-temp --ignore-existing;
      echo 'MinIO buckets initialized: documents, document-temp';
      exit 0;
      "
    environment:
      MINIO_ROOT_USER: ${MINIO_ROOT_USER:-minioadmin}
      MINIO_ROOT_PASSWORD: ${MINIO_ROOT_PASSWORD:?MINIO_ROOT_PASSWORD is required}
    networks:
      - kreuzberg-network

networks:
  kreuzberg-network:
    name: kreuzberg-network
    driver: bridge

volumes:
  minio_data:
    driver: local
```

### Starting Services

```bash
cd /root/emergent-infra/kreuzberg
cp .env.example .env
# Edit .env - set MINIO_ROOT_PASSWORD!
docker compose up -d
./scripts/health-check.sh
```

## Database Schema

### New Table: kb.document_parsing_jobs

```sql
CREATE TABLE kb.document_parsing_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL,
    project_id UUID NOT NULL,

    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    -- 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'

    source_type VARCHAR(20) NOT NULL,  -- 'upload' | 'url'
    source_filename VARCHAR(512),
    source_url TEXT,
    mime_type VARCHAR(100),
    file_size_bytes BIGINT,

    -- Storage references
    storage_key TEXT,              -- Key in MinIO/GCS
    storage_url TEXT,              -- Full URL to file
    temp_file_path TEXT,           -- Local temp path during processing

    document_id UUID REFERENCES kb.documents(id),
    extraction_job_id UUID REFERENCES kb.object_extraction_jobs(id),

    parsing_config JSONB DEFAULT '{}',
    -- { enableOcr, extractTables, extractImages, autoExtract, extractionConfig }

    parsed_content TEXT,
    metadata JSONB,
    tables_extracted INTEGER DEFAULT 0,
    images_extracted INTEGER DEFAULT 0,

    error_message TEXT,
    error_details JSONB,
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    duration_ms INTEGER,

    created_by UUID,

    CONSTRAINT valid_status CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled'))
);

CREATE INDEX idx_document_parsing_jobs_status
    ON kb.document_parsing_jobs(status) WHERE status = 'pending';
CREATE INDEX idx_document_parsing_jobs_project
    ON kb.document_parsing_jobs(project_id);
CREATE INDEX idx_document_parsing_jobs_orphaned
    ON kb.document_parsing_jobs(status, updated_at) WHERE status = 'running';
```

### New Table: kb.document_artifacts

```sql
CREATE TABLE kb.document_artifacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES kb.documents(id) ON DELETE CASCADE,

    artifact_type VARCHAR(50) NOT NULL,  -- 'table' | 'image' | 'chart' | 'formula'
    content JSONB,                        -- Structured data (tables as JSON)
    storage_key TEXT,                     -- If stored in MinIO (images)
    position_in_document INTEGER,
    metadata JSONB DEFAULT '{}',

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_document_artifacts_document_id ON kb.document_artifacts(document_id);
CREATE INDEX idx_document_artifacts_type ON kb.document_artifacts(artifact_type);
```

### Alter Table: kb.documents

```sql
ALTER TABLE kb.documents
    ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS storage_key TEXT,
    ADD COLUMN IF NOT EXISTS storage_url TEXT;

CREATE INDEX idx_documents_metadata_gin ON kb.documents USING gin(metadata);
CREATE INDEX idx_documents_storage_key ON kb.documents(storage_key) WHERE storage_key IS NOT NULL;
```

## NestJS Module Structure

### StorageModule

```
apps/server/src/modules/storage/
├── storage.module.ts
├── storage.service.ts
├── interfaces/
│   ├── storage-upload-result.interface.ts
│   └── storage-options.interface.ts
└── providers/
    ├── minio.provider.ts
    ├── gcs.provider.ts
    └── s3.provider.ts
```

### StorageService Interface

```typescript
export interface StorageUploadResult {
  key: string;
  url: string;
  bucket: string;
  size: number;
}

export interface StorageService {
  upload(
    buffer: Buffer,
    key: string,
    options?: {
      bucket?: string;
      contentType?: string;
      metadata?: Record<string, string>;
    }
  ): Promise<StorageUploadResult>;

  download(key: string, bucket?: string): Promise<Buffer>;

  delete(key: string, bucket?: string): Promise<void>;

  getSignedUrl(
    key: string,
    expiresInSeconds?: number,
    bucket?: string
  ): Promise<string>;

  exists(key: string, bucket?: string): Promise<boolean>;
}
```

### KreuzbergClientService

```typescript
@Injectable()
export class KreuzbergClientService {
  async extractText(
    fileBuffer: Buffer,
    filename: string,
    mimeType: string
  ): Promise<KreuzbergExtractResult>;

  async healthCheck(): Promise<boolean>;
}

interface KreuzbergExtractResult {
  content: string;
  metadata: {
    filename: string;
    content_type: string;
    size_bytes: number;
    page_count?: number;
    processing_method: 'kreuzberg';
  };
  tables?: Array<{
    index: number;
    data: Record<string, any>[];
    headers: string[];
  }>;
  images?: Array<{
    index: number;
    caption?: string;
    storage_key?: string;
  }>;
}
```

### DocumentParsingWorkerService

Following pattern from `ExtractionWorkerService`:

```typescript
@Injectable()
export class DocumentParsingWorkerService
  implements OnModuleInit, OnModuleDestroy
{
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  async onModuleInit() {
    if (!this.config.documentParsingWorkerEnabled) return;
    await this.recoverOrphanedJobs();
    this.start();
  }

  private async processBatch(): Promise<void> {
    const jobs = await this.jobService.claimPendingJobs(this.batchSize);
    await Promise.all(jobs.map((job) => this.processJob(job)));
  }

  private async processJob(job: ParsingJobRow): Promise<void> {
    // 1. Set tenant context
    // 2. Update status to 'running'
    // 3. Route: plain text vs Kreuzberg
    // 4. Upload original to MinIO
    // 5. Create document record
    // 6. Store artifacts (tables/images)
    // 7. Optional: create extraction job
    // 8. Update status to 'completed'
  }

  private isPlainText(mimeType: string, filename: string): boolean {
    const plainTextTypes = ['text/plain', 'text/markdown', 'text/csv'];
    const plainTextExtensions = ['.txt', '.md', '.csv'];
    // ... routing logic
  }
}
```

## Storage Key Strategy

```
{project_id}/{organization_id}/{uuid}-{original_filename}

Example:
550e8400-e29b-41d4-a716-446655440000/
  660e8400-e29b-41d4-a716-446655440001/
    7f1c84c0-4b3e-4e1a-9c3a-1234567890ab-annual-report-2024.pdf
```

## Environment Variables

### emergent-infra/kreuzberg/.env

```bash
# Kreuzberg Service
KREUZBERG_PORT=8000
KREUZBERG_LOG_LEVEL=info

# MinIO Object Storage
MINIO_ROOT_USER=minioadmin
MINIO_ROOT_PASSWORD=your-secure-password-here
MINIO_API_PORT=9000
MINIO_CONSOLE_PORT=9001
```

### emergent/.env (Application)

```bash
# Kreuzberg Service (connects to emergent-infra/kreuzberg)
KREUZBERG_SERVICE_URL=http://localhost:8000
KREUZBERG_SERVICE_TIMEOUT=300000
KREUZBERG_ENABLED=true

# Storage Configuration (connects to MinIO from emergent-infra)
STORAGE_PROVIDER=minio           # 'minio' | 'gcs' | 's3'
STORAGE_ENDPOINT=http://localhost:9000
STORAGE_ACCESS_KEY=minioadmin
STORAGE_SECRET_KEY=your-secure-password-here
STORAGE_BUCKET_DOCUMENTS=documents
STORAGE_BUCKET_TEMP=document-temp
STORAGE_REGION=us-east-1

# GCS (production)
# STORAGE_PROVIDER=gcs
# GCS_PROJECT_ID=your-project-id
# GCS_BUCKET_DOCUMENTS=your-prod-bucket
# GCS_CREDENTIALS_PATH=/run/secrets/gcs-key.json

# Document Parsing Worker
DOCUMENT_PARSING_WORKER_ENABLED=true
DOCUMENT_PARSING_WORKER_POLL_INTERVAL_MS=5000
DOCUMENT_PARSING_WORKER_BATCH_SIZE=5

# Document Processing Limits
MAX_DOCUMENT_SIZE=104857600      # 100MB
STORAGE_RETENTION_DAYS=30
```

## Error Handling Strategy

### Retry Policy

```typescript
const RETRY_CONFIG = {
  maxRetries: 3,
  initialDelayMs: 10000, // 10 seconds
  maxDelayMs: 60000, // 60 seconds
  backoffMultiplier: 3, // 10s → 30s → 60s
};
```

### Error Categories

| Error Type                     | Retry?     | Action             |
| ------------------------------ | ---------- | ------------------ |
| Kreuzberg connection refused   | Yes        | Retry with backoff |
| Kreuzberg timeout              | Yes (once) | Retry, then fail   |
| MinIO connection error         | Yes        | Retry with backoff |
| 400 Bad Request (invalid file) | No         | Fail immediately   |
| Unsupported format             | No         | Fail immediately   |
| File too large                 | No         | Fail immediately   |

### Orphaned Job Recovery

On worker startup:

```typescript
async recoverOrphanedJobs(): Promise<void> {
  // Find jobs stuck in 'running' for >5 minutes
  const orphaned = await this.jobService.findOrphanedJobs(5 * 60 * 1000);

  for (const job of orphaned) {
    if (job.retry_count < job.max_retries) {
      await this.jobService.updateStatus(job.id, 'pending', {
        retry_count: job.retry_count + 1,
      });
    } else {
      await this.jobService.updateStatus(job.id, 'failed', {
        error_message: 'Job orphaned after max retries',
      });
    }
  }
}
```

## Monitoring & Observability

### Health Checks

Services are verified via the health-check script:

```bash
cd /root/emergent-infra/kreuzberg
./scripts/health-check.sh
```

Add to workspace health dashboard:

- `kreuzberg`: `GET http://localhost:8000/health`
- `minio`: `GET http://localhost:9000/minio/health/live`

### Metrics to Track

- `document_parsing_jobs_total` by status
- `document_parsing_duration_seconds` histogram
- `storage_upload_bytes_total`
- `storage_upload_duration_seconds`
- `kreuzberg_requests_total` by status

### Log Patterns

```typescript
// Job lifecycle
this.logger.log(`Parsing job ${job.id} started: ${job.source_filename}`);
this.logger.log(`Parsing job ${job.id} completed in ${durationMs}ms`);
this.logger.error(`Parsing job ${job.id} failed: ${error.message}`);

// Storage operations
this.logger.log(`Uploaded ${key} to ${bucket} (${size} bytes)`);
this.logger.error(`Storage upload failed for ${key}: ${error.message}`);
```

## Security Considerations

1. **Network Isolation**: Kreuzberg/MinIO only accessible from server container
2. **No External MinIO Access**: Ports 9000/9001 not exposed in production
3. **Signed URLs**: Time-limited access to stored files (default: 1 hour)
4. **File Validation**: Validate MIME type before processing
5. **Size Limits**: Enforce 100MB max file size

## Future Enhancements

1. **Virus Scanning**: Integrate ClamAV before storage
2. **Image Extraction**: Store extracted images to MinIO
3. **Full-Text Search**: Index extracted text in PostgreSQL
4. **Retention Policies**: Auto-delete files after 30 days
5. **Batch Processing**: Parallel document processing
