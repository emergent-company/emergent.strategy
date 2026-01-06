# Proposal: Add Kreuzberg Document Extraction Service with MinIO Storage

## Summary

Integrate [Kreuzberg](https://kreuzberg.dev/) as a Docker Compose service for document extraction and text parsing, along with **MinIO** for S3-compatible object storage. This enables:

1. **Document Parsing**: Extract text from 56+ file formats (PDF, Office, images, HTML)
2. **Object Storage**: Store original files and extracted artifacts in MinIO (dev) / GCS (prod)
3. **Worker Pipeline**: Async job processing following existing extraction worker patterns

## Motivation

### Why Document Extraction?

The existing document management system supports text-based documents but lacks native parsing capabilities for binary formats like PDF, DOCX, PPTX, and images. Users must manually convert documents to text before ingestion.

### Why MinIO Storage?

From the archived Docling plan, several compelling reasons for dedicated object storage:

| Requirement            | Solution                                 |
| ---------------------- | ---------------------------------------- |
| Dev: No cloud costs    | MinIO (Docker container)                 |
| Prod: Scalable storage | Google Cloud Storage                     |
| Dev-prod parity        | S3-compatible API for both               |
| Audit trail            | Keep original files for 30 days          |
| Artifact storage       | Store extracted tables/images separately |

### Why Kreuzberg over Docling?

| Aspect               | Kreuzberg                               | Docling                        |
| -------------------- | --------------------------------------- | ------------------------------ |
| **Core Language**    | Rust (fast, memory-safe)                | Python (slower, higher memory) |
| **Docker Image**     | Pre-built: `goldziher/kreuzberg:latest` | Must build custom image        |
| **Memory Footprint** | ~500MB–1GB                              | 3GB–6GB (with OCR models)      |
| **Startup Time**     | ~2 seconds                              | 30–60 seconds (model loading)  |
| **Format Support**   | 56+ formats out-of-box                  | ~15 formats                    |

## What Changes

### New Docker Services

1. **Kreuzberg**: Document extraction (`goldziher/kreuzberg:latest`)
2. **MinIO**: S3-compatible object storage (`minio/minio:latest`)
3. **MinIO Init**: Bucket initialization (`minio/mc:latest`)

### New NestJS Components

1. **StorageModule**: Provider-agnostic storage abstraction
   - `StorageService`: Upload/download/delete/getSignedUrl
   - Supports MinIO (dev), GCS (prod), S3 (AWS)
2. **KreuzbergClientService**: HTTP client for Kreuzberg API

3. **DocumentParsingWorkerService**: Job processor following existing worker pattern

### New Database Tables

1. **kb.document_parsing_jobs**: Track parsing job status (like extraction jobs)
2. **kb.document_artifacts**: Store extracted tables, images, charts

### Modified Database Tables

1. **kb.documents**: Add `storage_key`, `storage_url`, `metadata` columns

### New Environment Variables

```bash
# Kreuzberg
KREUZBERG_SERVICE_URL=http://kreuzberg:8000
KREUZBERG_SERVICE_TIMEOUT=300000
KREUZBERG_ENABLED=true

# Storage (MinIO for dev)
STORAGE_PROVIDER=minio
STORAGE_ENDPOINT=http://minio:9000
STORAGE_ACCESS_KEY=minioadmin
STORAGE_SECRET_KEY=minioadmin
STORAGE_BUCKET_DOCUMENTS=documents
STORAGE_BUCKET_TEMP=document-temp
STORAGE_REGION=us-east-1

# Worker
DOCUMENT_PARSING_WORKER_ENABLED=true
DOCUMENT_PARSING_WORKER_POLL_INTERVAL_MS=5000
```

## Key Patterns from Docling Plan

### 1. Smart Routing (Keep)

```
Plain Text (.txt, .md, .csv) → Direct Storage (1-3 sec)
Complex (PDF, DOCX, images) → Kreuzberg Service (5-60 sec)
```

### 2. Storage Service Abstraction (Keep)

```typescript
interface StorageService {
  upload(buffer, key, options): Promise<StorageUploadResult>;
  download(key, bucket?): Promise<Buffer>;
  delete(key, bucket?): Promise<void>;
  getSignedUrl(key, expiresIn): Promise<string>;
}
```

### 3. Worker Pattern (Keep)

- Poll `kb.document_parsing_jobs` for pending jobs
- Set tenant context per job
- Retry with exponential backoff
- Orphaned job recovery on startup

### 4. Auto-Extraction Chaining (Keep)

- Optional `autoExtract` flag on upload
- Creates `kb.object_extraction_jobs` after parsing completes

### 5. Artifact Storage (Keep)

- Store extracted tables as JSON in `kb.document_artifacts`
- Store images in MinIO with reference in artifacts table

### 6. Decisions from Docling Plan (Adopt)

| Decision          | Value                      |
| ----------------- | -------------------------- |
| Storage retention | 30 days                    |
| Max file size     | 100MB                      |
| Rate limit        | 100 uploads/user/hour      |
| Retries           | 3 with exponential backoff |
| OCR               | Handled by Kreuzberg       |

## Impact Assessment

### Risk Level: Medium

- **Multiple services**: Kreuzberg + MinIO + MinIO-init
- **Database changes**: New tables + column additions
- **New module**: StorageModule with provider abstraction

### Resource Requirements

| Service   | CPU       | Memory | Storage             |
| --------- | --------- | ------ | ------------------- |
| Kreuzberg | 2 cores   | 2GB    | Stateless           |
| MinIO     | 0.5 cores | 512MB  | Volume (minio_data) |

### Dependencies

```json
{
  "@aws-sdk/client-s3": "^3.500.0",
  "@aws-sdk/s3-request-presigner": "^3.500.0",
  "@google-cloud/storage": "^7.0.0"
}
```

## Alternatives Considered

1. **Database BLOB storage**: Doesn't scale, no signed URLs
2. **Local filesystem**: Not portable, no redundancy
3. **Cloud-only (GCS)**: Dev environment costs, requires credentials

## Success Criteria

1. Kreuzberg + MinIO containers start and pass health checks
2. PDF/DOCX files upload to MinIO and text extracts successfully
3. Original files preserved in MinIO with signed URL access
4. Extracted tables/images stored as artifacts
5. Worker processes jobs with retry on failure
6. Same code works with MinIO (dev) and GCS (prod)

## Timeline Estimate

- **Phase 1 (2-3 days)**: Docker services (Kreuzberg + MinIO)
- **Phase 2 (2-3 days)**: Database migrations + StorageModule
- **Phase 3 (3-4 days)**: KreuzbergClient + Worker integration
- **Phase 4 (2-3 days)**: Testing + documentation

Total: **9-13 days**

## References

- [Kreuzberg Documentation](https://kreuzberg.dev/)
- [Kreuzberg API Server Guide](https://kreuzberg.dev/guides/api-server/)
- [Archived Docling Plan](docs/plans/archive/DOCKLING_IMPLEMENTATION_PLAN.md)
- [MinIO Docker Guide](https://min.io/docs/minio/container/index.html)
- [Document Management Spec](openspec/specs/document-management/spec.md)
