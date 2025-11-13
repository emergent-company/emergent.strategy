# COMPLETE DOCUMENT PARSING & STORAGE IMPLEMENTATION PLAN

Version: 1.3 Final Date: October 20, 2025 Status: Ready for Implementation

---

## Executive Summary

Build a sophisticated multi-format document import system with:

• ✅ Asynchronous processing (same worker pattern as extraction jobs)
• ✅ Smart routing: Plain text (.txt, .md, .csv) → direct storage | Complex formats → Docling
• ✅ Storage abstraction: MinIO (dev) ↔ Google Cloud Storage (prod) - zero code changes
• ✅ Auto-extraction: Optional chaining parse → extract workflow
• ✅ Docker-based: Docling Python service + MinIO object storage

Timeline: 3-4 weeks Team Required: Backend (2), Frontend (1), DevOps (1)

---

## Architecture Overview

┌─────────────────────────────────────────────────────────────────┐
│                     USER UPLOADS DOCUMENT                        │
│                  POST /documents/upload                          │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│              FILE TYPE DETECTION & ROUTING                       │
│                                                                  │
│  Plain Text (.txt, .md, .csv)  │  Complex (PDF, DOCX, images)  │
│         ↓                       │         ↓                      │
│    Direct Storage               │    Docling Service             │
│    (1-3 seconds)                │    (5-300 seconds)             │
└────────────────────────┬────────────────┬────────────────────────┘
                         │                │
                         ▼                ▼
                   ┌─────────────────────────────┐
                   │   Upload to Storage         │
                   │   MinIO (dev) / GCS (prod)  │
                   └──────────┬──────────────────┘
                              │
                              ▼
                   ┌─────────────────────────────┐
                   │   Create kb.documents        │
                   │   + kb.document_artifacts    │
                   └──────────┬──────────────────┘
                              │
                              ▼
                   ┌─────────────────────────────┐
                   │   Auto-Extract? (optional)   │
                   │   Create extraction job      │
                   └──────────────────────────────┘

---

## File Type Routing Strategy

### Plain Text Files (Direct Storage - NO DOCLING)

Supported Formats:

• .txt (text/plain)
• .md (text/markdown)
• .csv (text/csv)

Processing:

1. Read file buffer as UTF-8
2. Store in MinIO/GCS
3. Create kb.documents record
4. Duration: 1-3 seconds

Routing Logic:

private isPlainText(mimeType: string, filename: string): boolean {
    const plainTextTypes = ['text/plain', 'text/markdown', 'text/csv'];
    const plainTextExtensions = ['.txt', '.md', '.csv'];

    if (plainTextTypes.includes(mimeType)) return true;

    const ext = filename.toLowerCase().match(/\.[^.]+$/)?.[0];
    return ext && plainTextExtensions.includes(ext);
}

### Complex Documents (Use Docling)

Supported Formats:

• PDF (application/pdf) - with OCR for scanned
• DOCX, PPTX, XLSX (Microsoft Office)
• PNG, JPEG, TIFF (images with OCR)
• MP3, WAV (audio with ASR - optional)
• HTML

Processing:

1. Send to Docling Docker service (http://docling:8001/parse)
2. Extract text, tables, images, metadata
3. Store original + parsed content in MinIO/GCS
4. Create kb.documents + kb.document_artifacts
5. Duration: 5-300 seconds

---

## Storage Solution: MinIO + Google Cloud Storage

### Why This Architecture?

 Requirement                                                                                 │ Solution
─────────────────────────────────────────────────────────────────────────────────────────────┼────────────────────────────────────────────────────────────────────────────────────────────
 Dev: No cloud                                                                               │ MinIO (Docker
  costs                                                                                      │  container)
                                                                                             │
 Prod: Scalable                                                                              │ Google Cloud
  storage                                                                                    │  Storage
                                                                                             │
 Dev-prod                                                                                    │ S3-compatible API for
  parity                                                                                     │  both
                                                                                             │
 Easy                                                                                        │ Real storage behavior
  testing                                                                                    │  locally
                                                                                             │
 Migration                                                                                   │ Change env vars
                                                                                             │  only
                                                                                             │


### Storage Service Interface

interface StorageService {
    upload(buffer: Buffer, key: string, options?): Promise<StorageUploadResult>;
    download(key: string, bucket?): Promise<Buffer>;
    delete(key: string, bucket?): Promise<void>;
    getSignedUrl(key: string, expiresIn: number): Promise<string>;
}

Same code works for MinIO and GCS!

---

## Implementation Phases

### Phase 1: Docker Infrastructure (Week 1 - Days 1-5)

Tasks:

1. Create Docling service structure
2. Write Dockerfile for Docling
3. Add MinIO to docker-compose.yml
4. Initialize MinIO buckets
5. Test both services locally

Deliverables:

• apps/docling-service/ directory
• docker/docker-compose.yml updated
• Both services running and healthy

---

### Phase 2: Database Schema (Week 1 - Days 3-4)

New Tables:

#### kb.document_parsing_jobs

CREATE TABLE kb.document_parsing_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL,
    project_id UUID NOT NULL,

    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    -- 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'

    source_type VARCHAR(20) NOT NULL, -- 'upload' | 'url'
    source_filename VARCHAR(512),
    source_url TEXT,
    mime_type VARCHAR(100),
    file_size_bytes BIGINT,

    -- Storage references
    storage_key TEXT, -- Key in MinIO/GCS
    storage_url TEXT, -- Full URL to file
    temp_file_path TEXT, -- Local temp path during processing

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

CREATE INDEX idx_document_parsing_jobs_orphaned
    ON kb.document_parsing_jobs(status, updated_at) WHERE status = 'running';

#### kb.document_artifacts

CREATE TABLE kb.document_artifacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES kb.documents(id) ON DELETE CASCADE,

    artifact_type VARCHAR(50) NOT NULL, -- 'table' | 'image' | 'chart' | 'formula'
    content JSONB, -- Structured data
    storage_key TEXT, -- If stored separately (large images)
    position_in_document INTEGER,
    metadata JSONB DEFAULT '{}',

    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_document_artifacts_document_id
    ON kb.document_artifacts(document_id);
CREATE INDEX idx_document_artifacts_type
    ON kb.document_artifacts(artifact_type);

#### Update kb.documents

ALTER TABLE kb.documents
    ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS storage_key TEXT,
    ADD COLUMN IF NOT EXISTS storage_url TEXT;

CREATE INDEX idx_documents_metadata_gin ON kb.documents USING gin(metadata);
CREATE INDEX idx_documents_storage_key ON kb.documents(storage_key);

---

### Phase 3: Docker Configuration (Week 1 - Days 1-3)

#### Docling Service

File: apps/docling-service/Dockerfile

FROM python:3.11-slim

WORKDIR /app

# Install system dependencies for Docling + EasyOCR
RUN apt-get update && apt-get install -y \
    poppler-utils \
    libgl1-mesa-glx \
    libglib2.0-0 \
    libgomp1 \
    curl \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app/ ./app/

# Create temp directories
RUN mkdir -p /tmp/docling && chmod 777 /tmp/docling
RUN mkdir -p /root/.EasyOCR/model && chmod -R 777 /root/.EasyOCR

EXPOSE 8001

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:8001/health || exit 1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8001", "--workers", "2"]

File: apps/docling-service/requirements.txt

docling>=2.57.0
fastapi>=0.104.0
uvicorn[standard]>=0.24.0
python-multipart>=0.0.6
pydantic>=2.5.0
python-dotenv>=1.0.0
requests>=2.31.0
aiofiles>=23.2.1
easyocr>=1.7.0
torch>=2.0.0
torchvision>=0.15.0

File: apps/docling-service/app/main.py

from fastapi import FastAPI, UploadFile, File, HTTPException, Form
from docling.document_converter import DocumentConverter
import tempfile
import os
from pathlib import Path
import logging
import easyocr

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Docling Document Parsing Service", version="1.0.0")
converter = DocumentConverter()

ocr_reader = None

def get_ocr_reader():
    global ocr_reader
    if ocr_reader is None:
        logger.info("Initializing EasyOCR (first request may be slow due to model download)...")
        ocr_reader = easyocr.Reader(['en'], gpu=False)
        logger.info("EasyOCR initialized successfully")
    return ocr_reader

@app.get("/health")
async def health_check():
    return {"status": "healthy", "service": "docling-parser", "version": "1.0.0"}

@app.post("/parse")
async def parse_document(
    file: UploadFile = File(...),
    enable_ocr: bool = Form(False),
    extract_tables: bool = Form(True),
    extract_images: bool = Form(True),
    output_format: str = Form("markdown")
):
    temp_file_path = None

    try:
        if not file.filename:
            raise HTTPException(status_code=400, detail="No filename provided")

        with tempfile.NamedTemporaryFile(delete=False, suffix=Path(file.filename).suffix) as tmp:
            content = await file.read()
            tmp.write(content)
            temp_file_path = tmp.name

        logger.info(f"Processing: {file.filename} ({len(content)} bytes)")

        if enable_ocr:
            reader = get_ocr_reader()
            logger.info(f"OCR enabled for {file.filename}")

        result = converter.convert(temp_file_path)

        if output_format == "markdown":
            parsed_content = result.document.export_to_markdown()
        elif output_format == "html":
            parsed_content = result.document.export_to_html()
        elif output_format == "json":
            parsed_content = result.document.export_to_dict()
        else:
            parsed_content = result.document.export_to_markdown()

        metadata = {
            "filename": file.filename,
            "content_type": file.content_type,
            "size_bytes": len(content),
            "page_count": getattr(result.document, 'page_count', None),
            "language": getattr(result.document, 'language', None),
        }

        tables = []
        if extract_tables and hasattr(result.document, 'tables'):
            tables = [
                {
                    "index": idx,
                    "data": table.export_to_dataframe().to_dict(orient='records'),
                    "headers": table.export_to_dataframe().columns.tolist(),
                    "page": getattr(table, 'page_number', None)
                }
                for idx, table in enumerate(result.document.tables)
            ]

        images = []
        if extract_images and hasattr(result.document, 'pictures'):
            images = [
                {
                    "index": idx,
                    "caption": getattr(pic, 'caption', ''),
                    "page": getattr(pic, 'page_number', None),
                }
                for idx, pic in enumerate(result.document.pictures)
            ]

        logger.info(f"Success: {file.filename} - {len(tables)} tables, {len(images)} images")

        return {
            "success": True,
            "content": parsed_content,
            "metadata": metadata,
            "tables": tables,
            "images": images,
            "format": output_format
        }

    except Exception as e:
        logger.error(f"Error: {file.filename} - {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Parsing failed: {str(e)}")

    finally:
        if temp_file_path and os.path.exists(temp_file_path):
            try:
                os.unlink(temp_file_path)
            except Exception as e:
                logger.warning(f"Cleanup failed: {temp_file_path} - {e}")

@app.get("/")
async def root():
    return {
        "service": "Docling Document Parser",
        "status": "running",
        "endpoints": {
            "parse": "POST /parse",
            "health": "GET /health"
        }
    }

#### MinIO + Docker Compose

File: docker/docker-compose.yml (additions)

services:
  # ... existing services (db, zitadel, login) ...

  # Docling Document Parsing Service with EasyOCR
  docling:
    build:
      context: ../apps/docling-service
      dockerfile: Dockerfile
    container_name: spec_docling
    environment:
      - ENABLE_OCR=${DOCLING_ENABLE_OCR:-false}
      - LOG_LEVEL=${DOCLING_LOG_LEVEL:-info}
      - MAX_WORKERS=2
      - TIMEOUT_SECONDS=300
    ports:
      - "8001:8001"
    volumes:
      - docling_temp:/tmp/docling
      - ../logs/docling:/var/log/docling
      - easyocr_models:/root/.EasyOCR
    healthcheck:
      test: ["CMD-SHELL", "curl -f http://localhost:8001/health || exit 1"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 60s
    restart: unless-stopped
    deploy:
      resources:
        limits:
          cpus: '2.0'
          memory: 6G
        reservations:
          cpus: '1.0'
          memory: 3G

  # MinIO - S3-compatible object storage
  minio:
    image: minio/minio:latest
    container_name: spec_minio
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: ${MINIO_ROOT_USER:-minioadmin}
      MINIO_ROOT_PASSWORD: ${MINIO_ROOT_PASSWORD:-minioadmin}
      MINIO_DOMAIN: ${MINIO_DOMAIN:-minio}
    ports:
      - "9000:9000"  # S3 API
      - "9001:9001"  # Web Console
    volumes:
      - minio_data:/data
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:9000/minio/health/live"]
      interval: 30s
      timeout: 10s
      retries: 3
    restart: unless-stopped

  # MinIO bucket initialization
  minio-init:
    image: minio/mc:latest
    container_name: spec_minio_init
    depends_on:
      - minio
    entrypoint: >
      /bin/sh -c "
      sleep 5;
      /usr/bin/mc alias set myminio http://minio:9000 minioadmin minioadmin;
      /usr/bin/mc mb myminio/documents --ignore-existing;
      /usr/bin/mc mb myminio/document-temp --ignore-existing;
      /usr/bin/mc anonymous set download myminio/documents;
      echo 'MinIO buckets initialized';
      exit 0;
      "

volumes:
  spec_pg_data:
  docling_temp:
  minio_data:
  easyocr_models:

---

### Phase 4: NestJS Services (Week 2)

#### 4.1 Storage Service (Provider-Agnostic)

File: apps/server/src/modules/storage/storage.service.ts

import { Injectable, Logger } from '@nestjs/common';
import { AppConfigService } from '../../common/config/config.service';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Storage as GCSStorage } from '@google-cloud/storage';

export interface StorageUploadResult {
    key: string;
    url: string;
    bucket: string;
    size: number;
}

@Injectable()
export class StorageService {
    private readonly logger = new Logger(StorageService.name);
    private s3Client?: S3Client;
    private gcsStorage?: GCSStorage;
    private readonly provider: 'minio' | 'gcs' | 's3';

    constructor(private readonly config: AppConfigService) {
        this.provider = config.storageProvider;

        if (this.provider === 'minio' || this.provider === 's3') {
            this.s3Client = new S3Client({
                endpoint: config.storageEndpoint,
                region: config.storageRegion || 'us-east-1',
                credentials: {
                    accessKeyId: config.storageAccessKey,
                    secretAccessKey: config.storageSecretKey,
                },
                forcePathStyle: true, // Required for MinIO
            });
            this.logger.log(`Initialized ${this.provider.toUpperCase()} storage`);
        } else if (this.provider === 'gcs') {
            this.gcsStorage = new GCSStorage({
                projectId: config.gcsProjectId,
                keyFilename: config.gcsCredentialsPath,
            });
            this.logger.log('Initialized GCS storage');
        }
    }

    async upload(
        buffer: Buffer,
        key: string,
        options?: {
            bucket?: string;
            contentType?: string;
            metadata?: Record<string, string>;
        }
    ): Promise<StorageUploadResult> {
        const bucket = options?.bucket || this.config.storageBucketDocuments;

        if (this.provider === 'minio' || this.provider === 's3') {
            return this.uploadToS3(buffer, key, bucket, options);
        } else if (this.provider === 'gcs') {
            return this.uploadToGCS(buffer, key, bucket, options);
        }
        throw new Error(`Unsupported provider: ${this.provider}`);
    }

    async download(key: string, bucket?: string): Promise<Buffer> {
        const bucketName = bucket || this.config.storageBucketDocuments;

        if (this.provider === 'minio' || this.provider === 's3') {
            const command = new GetObjectCommand({ Bucket: bucketName, Key: key });
            const response = await this.s3Client!.send(command);
            return Buffer.from(await response.Body!.transformToByteArray());
        } else if (this.provider === 'gcs') {
            const [contents] = await this.gcsStorage!.bucket(bucketName).file(key).download();
            return contents;
        }
        throw new Error(`Unsupported provider: ${this.provider}`);
    }

    async delete(key: string, bucket?: string): Promise<void> {
        const bucketName = bucket || this.config.storageBucketDocuments;

        if (this.provider === 'minio' || this.provider === 's3') {
            await this.s3Client!.send(new DeleteObjectCommand({ Bucket: bucketName, Key: key }));
        } else if (this.provider === 'gcs') {
            await this.gcsStorage!.bucket(bucketName).file(key).delete();
        }
    }

    async getSignedUrl(key: string, expiresInSeconds: number = 3600, bucket?: string): Promise<string> {
        const bucketName = bucket || this.config.storageBucketDocuments;

        if (this.provider === 'minio' || this.provider === 's3') {
            const command = new GetObjectCommand({ Bucket: bucketName, Key: key });
            return getSignedUrl(this.s3Client!, command, { expiresIn: expiresInSeconds });
        } else if (this.provider === 'gcs') {
            const [url] = await this.gcsStorage!
                .bucket(bucketName)
                .file(key)
                .getSignedUrl({
                    version: 'v4',
                    action: 'read',
                    expires: Date.now() + expiresInSeconds * 1000,
                });
            return url;
        }
        throw new Error(`Unsupported provider: ${this.provider}`);
    }

    private async uploadToS3(buffer: Buffer, key: string, bucket: string, options?: any): Promise<StorageUploadResult> {
        await this.s3Client!.send(new PutObjectCommand({
            Bucket: bucket,
            Key: key,
            Body: buffer,
            ContentType: options?.contentType || 'application/octet-stream',
            Metadata: options?.metadata || {},
        }));

        return {
            key,
            url: `${this.config.storageEndpoint}/${bucket}/${key}`,
            bucket,
            size: buffer.length,
        };
    }

    private async uploadToGCS(buffer: Buffer, key: string, bucket: string, options?: any): Promise<StorageUploadResult> {
        await this.gcsStorage!.bucket(bucket).file(key).save(buffer, {
            contentType: options?.contentType || 'application/octet-stream',
            metadata: { metadata: options?.metadata || {} },
        });

        return {
            key,
            url: `gs://${bucket}/${key}`,
            bucket,
            size: buffer.length,
        };
    }
}

#### 4.2 Document Parsing Worker (Critical Service)

File: apps/server/src/modules/documents/document-parsing-worker.service.ts

Key features:

• Polls kb.document_parsing_jobs for pending jobs
• Routes plain text vs complex documents
• Uploads to MinIO/GCS
• Auto-creates extraction job if requested
• Orphaned job recovery

@Injectable()
export class DocumentParsingWorkerService implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(DocumentParsingWorkerService.name);
    private timer: NodeJS.Timeout | null = null;
    private running = false;

    private processedCount = 0;
    private successCount = 0;
    private failureCount = 0;

    constructor(
        private readonly config: AppConfigService,
        private readonly db: DatabaseService,
        private readonly jobService: DocumentParsingJobService,
        private readonly doclingClient: DoclingClientService,
        private readonly documentsService: DocumentsService,
        private readonly storageService: StorageService,
        private readonly extractionJobService: ExtractionJobService,
    ) {}

    async onModuleInit() {
        if (!this.db.isOnline()) {
            this.logger.warn('Database offline; worker idle.');
            return;
        }

        if (!this.config.documentParsingWorkerEnabled) {
            this.logger.log('Document parsing worker disabled');
            return;
        }

        await this.recoverOrphanedJobs();
        this.start();
    }

    onModuleDestroy() {
        this.stop();
    }

    private async processJob(job: ParsingJobRow): Promise<void> {
        const startTime = Date.now();

        await this.db.setTenantContext(job.organization_id, job.project_id);
        await this.jobService.updateStatus(job.id, 'running', { started_at: new Date() });

        this.logger.log(`Processing job ${job.id}: ${job.source_filename} (${job.mime_type})`);

        try {
            const fs = await import('fs/promises');
            const fileBuffer = await fs.readFile(job.temp_file_path);

            let parseResult: any;

            // CRITICAL: Routing logic
            if (this.isPlainText(job.mime_type, job.source_filename)) {
                // Plain text - direct storage
                this.logger.log(`Plain text file: ${job.source_filename}`);
                parseResult = {
                    content: fileBuffer.toString('utf-8'),
                    metadata: {
                        processing_method: 'direct',
                        size_bytes: fileBuffer.length,
                    },
                    tables: [],
                    images: [],
                };
            } else {
                // Complex document - use Docling
                this.logger.log(`Complex document: ${job.source_filename}`);
                parseResult = await this.doclingClient.parseDocument(
                    fileBuffer,
                    job.mime_type,
                    job.parsing_config
                );
                parseResult.metadata.processing_method = 'docling';
            }

            // Upload to MinIO/GCS
            const storageKey = `${job.project_id}/${job.organization_id}/${uuidv4()}-${job.source_filename}`;
            const uploadResult = await this.storageService.upload(
                fileBuffer,
                storageKey,
                {
                    contentType: job.mime_type,
                    metadata: {
                        org_id: job.organization_id,
                        project_id: job.project_id,
                        original_filename: job.source_filename,
                    }
                }
            );

            // Create document
            const document = await this.documentsService.createFromParsedDocument({
                content: parseResult.content,
                metadata: {
                    ...parseResult.metadata,
                    storage_key: uploadResult.key,
                    storage_url: uploadResult.url,
                },
                filename: job.source_filename,
                projectId: job.project_id,
                orgId: job.organization_id,
            });

            // Store artifacts
            if (parseResult.tables?.length > 0) {
                await this.storeArtifacts(document.id, 'table', parseResult.tables);
            }
            if (parseResult.images?.length > 0) {
                await this.storeArtifacts(document.id, 'image', parseResult.images);
            }

            // Auto-extraction
            let extractionJobId: string | undefined;
            if (job.parsing_config.autoExtract) {
                const extractionJob = await this.extractionJobService.createJob({
                    organization_id: job.organization_id,
                    project_id: job.project_id,
                    source_type: 'document',
                    source_id: document.id,
                    extraction_config: job.parsing_config.extractionConfig || {},
                });
                extractionJobId = extractionJob.id;
                this.logger.log(`Auto-created extraction job ${extractionJobId}`);
            }

            const durationMs = Date.now() - startTime;

            await this.jobService.updateStatus(job.id, 'completed', {
                completed_at: new Date(),
                duration_ms: durationMs,
                document_id: document.id,
                extraction_job_id: extractionJobId,
                parsed_content: parseResult.content,
                metadata: parseResult.metadata,
                tables_extracted: parseResult.tables?.length || 0,
                images_extracted: parseResult.images?.length || 0,
                storage_key: uploadResult.key,
                storage_url: uploadResult.url,
            });

            await fs.unlink(job.temp_file_path).catch(() => {});

            this.logger.log(
                `Completed job ${job.id} in ${durationMs}ms: ` +
                `${parseResult.tables?.length || 0} tables, ${parseResult.images?.length || 0} images`
            );

        } catch (error) {
            throw error;
        }
    }

    private isPlainText(mimeType: string, filename: string | null): boolean {
        const plainTextTypes = ['text/plain', 'text/markdown', 'text/csv'];

        if (plainTextTypes.includes(mimeType)) {
            return true;
        }

        if (filename) {
            const ext = filename.toLowerCase().match(/\.[^.]+$/)?.[0];
            if (ext && ['.txt', '.md', '.csv'].includes(ext)) {
                return true;
            }
        }

        return false;
    }

    // ... rest of implementation (processBatch, handleJobFailure, etc.)
}

---

### Phase 5: Configuration (Week 2)

#### Environment Variables

File: .env

# Docling Service
DOCLING_SERVICE_URL=http://docling:8001
DOCLING_ENABLE_OCR=false
DOCLING_LOG_LEVEL=info
DOCLING_SERVICE_TIMEOUT=300000

# Document Parsing Worker
DOCUMENT_PARSING_WORKER_ENABLED=true
DOCUMENT_PARSING_WORKER_POLL_INTERVAL_MS=5000
DOCUMENT_PARSING_WORKER_BATCH_SIZE=5

# Storage Configuration
STORAGE_PROVIDER=minio  # 'minio' | 'gcs' | 's3'
STORAGE_ENDPOINT=http://minio:9000
STORAGE_ACCESS_KEY=minioadmin
STORAGE_SECRET_KEY=minioadmin
STORAGE_BUCKET_DOCUMENTS=documents
STORAGE_BUCKET_TEMP=document-temp
STORAGE_REGION=us-east-1

# Document Processing
MAX_DOCUMENT_SIZE=104857600  # 100MB
ENABLE_TABLE_EXTRACTION=true
ENABLE_IMAGE_EXTRACTION=true

File: .env.production

STORAGE_PROVIDER=gcs
GCS_PROJECT_ID=your-production-project
GCS_BUCKET_DOCUMENTS=your-prod-bucket
GCS_CREDENTIALS_PATH=/run/secrets/gcs-key.json

#### AppConfigService

// Storage
readonly storageProvider: 'minio' | 'gcs' | 's3' =
    (process.env.STORAGE_PROVIDER as any) || 'minio';
readonly storageEndpoint = process.env.STORAGE_ENDPOINT || 'http://localhost:9000';
readonly storageAccessKey = process.env.STORAGE_ACCESS_KEY || 'minioadmin';
readonly storageSecretKey = process.env.STORAGE_SECRET_KEY || 'minioadmin';
readonly storageBucketDocuments = process.env.STORAGE_BUCKET_DOCUMENTS || 'documents';
readonly storageRegion = process.env.STORAGE_REGION || 'us-east-1';

// GCS
readonly gcsProjectId = process.env.GCS_PROJECT_ID || '';
readonly gcsCredentialsPath = process.env.GCS_CREDENTIALS_PATH || '';

// Worker
readonly documentParsingWorkerEnabled = process.env.DOCUMENT_PARSING_WORKER_ENABLED !== 'false';
readonly documentParsingWorkerPollIntervalMs = parseInt(process.env.DOCUMENT_PARSING_WORKER_POLL_INTERVAL_MS || '5000');

// Docling
readonly doclingServiceUrl = process.env.DOCLING_SERVICE_URL || 'http://localhost:8001';
readonly doclingServiceTimeout = parseInt(process.env.DOCLING_SERVICE_TIMEOUT || '300000');

---

## API Endpoints

### Upload Document (Async)

POST /documents/upload
Content-Type: multipart/form-data

Body:
{
  file: <binary>,
  enableOcr: boolean (default: false),
  extractTables: boolean (default: true),
  extractImages: boolean (default: true),
  autoExtract: boolean (default: false),
  extractionConfig: {
    allowed_types: string[],
    duplicate_strategy: 'merge' | 'reject'
  }
}

Response 201:
{
  jobId: "uuid",
  status: "pending",
  message: "Document parsing job created",
  estimatedTime: "5-30 seconds"
}

### Get Job Status

GET /documents/parsing-jobs/:id

Response 200:
{
  id: "uuid",
  status: "pending" | "running" | "completed" | "failed",
  document_id: "uuid" (when completed),
  extraction_job_id: "uuid" (if autoExtract=true),
  duration_ms: number,
  tables_extracted: number,
  images_extracted: number,
  error_message: string,
  created_at: timestamp,
  started_at: timestamp,
  completed_at: timestamp
}

---

## Estimated Processing Times

 File                                │ Size                                │ Method                             │ OCR                                │ Time
─────────────────────────────────────┼─────────────────────────────────────┼────────────────────────────────────┼────────────────────────────────────┼────────────────────────────────────
 .txt                                │ 100KB                               │ Direct                             │ N/A                                │ 1-2
                                     │                                     │                                    │                                    │  sec
                                     │                                     │                                    │                                    │
 .md                                 │ 50KB                                │ Direct                             │ N/A                                │ 1-2
                                     │                                     │                                    │                                    │  sec
                                     │                                     │                                    │                                    │
 .csv                                │ 500KB                               │ Direct                             │ N/A                                │ 2-3
                                     │                                     │                                    │                                    │  sec
                                     │                                     │                                    │                                    │
 PDF                                 │ 1MB                                 │ Docling                            │ No                                 │ 3-8
 (text)                              │                                     │                                    │                                    │  sec
                                     │                                     │                                    │                                    │
 PDF                                 │ 5MB                                 │ Docling                            │ Yes                                │ 30-60
 (scanned)                           │                                     │                                    │                                    │  sec
                                     │                                     │                                    │                                    │
 PDF                                 │ 10MB                                │ Docling                            │ No                                 │ 15-30
 (tables)                            │                                     │                                    │                                    │  sec
                                     │                                     │                                    │                                    │
 DOCX                                │ 2MB                                 │ Docling                            │ N/A                                │ 5-10
                                     │                                     │                                    │                                    │  sec
                                     │                                     │                                    │                                    │
 PPTX                                │ 5MB                                 │ Docling                            │ N/A                                │ 20-40
                                     │                                     │                                    │                                    │  sec
                                     │                                     │                                    │                                    │
 XLSX                                │ 10MB                                │ Docling                            │ N/A                                │ 15-25
                                     │                                     │                                    │                                    │  sec
                                     │                                     │                                    │                                    │


---

## Docker Commands Reference

# Start all services
docker-compose -f docker/docker-compose.yml up -d

# View logs
docker-compose -f docker/docker-compose.yml logs -f docling
docker-compose -f docker/docker-compose.yml logs -f minio

# Check health
curl http://localhost:8001/health
curl http://localhost:9000/minio/health/live

# Access MinIO console
open http://localhost:9001
# Login: minioadmin / minioadmin

# Test Docling
curl -X POST http://localhost:8001/parse \
  -F "file=@test.pdf" \
  -F "enable_ocr=false"

# Restart services
docker-compose -f docker/docker-compose.yml restart docling
docker-compose -f docker/docker-compose.yml restart minio

# Stop all
docker-compose -f docker/docker-compose.yml down

# Reset MinIO data
docker-compose -f docker/docker-compose.yml down -v
docker volume rm spec_minio_data

---

## Package Dependencies

npm install @aws-sdk/client-s3 @aws-sdk/s3-request-presigner @google-cloud/storage

package.json additions:

{
  "dependencies": {
    "@aws-sdk/client-s3": "^3.500.0",
    "@aws-sdk/s3-request-presigner": "^3.500.0",
    "@google-cloud/storage": "^7.0.0"
  }
}

---

## Testing Strategy

### Unit Tests

[ ] StorageService (MinIO/GCS switching)
[ ] DocumentParsingWorkerService (routing logic)
[ ] DoclingClientService (HTTP calls)
[ ] isPlainText() function

### Integration Tests

[ ] Upload .txt → verify direct storage
[ ] Upload .pdf → verify Docling parsing
[ ] Upload with autoExtract → verify extraction job creation
[ ] MinIO upload/download cycle
[ ] GCS upload/download cycle (with credentials)

### E2E Tests

[ ] Full pipeline: upload → parse → extract → view
[ ] Large file handling (50MB+)
[ ] OCR-enabled PDF
[ ] Error scenarios (malformed files, service down)
[ ] Orphaned job recovery after restart

---

## Deployment Checklist

### Development

[ ] docker-compose up starts all services
[ ] MinIO console accessible at localhost:9001
[ ] Docling health check passes
[ ] Upload .txt file successfully
[ ] Upload .pdf file successfully
[ ] Worker processes jobs automatically

### Production

[ ] Change STORAGE_PROVIDER=gcs in env
[ ] Upload GCS service account credentials
[ ] Set correct GCS bucket name
[ ] Verify Docling service has enough memory (4GB+)
[ ] Set up log aggregation (Datadog/Sentry)
[ ] Configure resource limits in docker-compose
[ ] Set up monitoring/alerting for worker queue depth

---

## Next Steps & Open Questions

### ✅ Decisions Made

1. **OCR Engine: EasyOCR**
 • Free, good quality
 • Easy Docker integration
 
2. **Storage Retention: 30 days**
 • Keep original files for audit trail
 • Archive/delete after 30 days
 
3. **Rate Limiting**
 • 100 uploads per user/org per hour
 • 100MB max file size
 • 10 concurrent parsing jobs per instance
 
4. **File Format Phasing**
 • Phase 1: PDF, DOCX, plain text (.txt, .md, .csv)
 • Phase 2: PPTX, XLSX, images, HTML
 
5. **Monitoring: File-based logging only**
 • All logs to files in `logs/` directory
 • No external services (Datadog/Sentry) for now
 • Ensure log rotation and accessibility

6. **Error Handling Strategy**
 • 3 automatic retries with exponential backoff (10s, 30s, 60s)
 • Failed jobs marked with detailed error info
 • Email notification on persistent failure (>3 retries)
 • Partial failures: Document saved, extraction marked as failed
 • Dead letter queue for manual review of persistent failures

7. **Schema Migration for Existing Documents**
 • Add migration script to backfill `storage_key`, `storage_url`, `metadata` 
 • For existing `kb.documents` without storage refs:
   - Read `content` field → upload to MinIO/GCS
   - Update record with new storage keys
   - Keep original `content` field for 30 days as backup
   - Run migration in background worker (low priority)

8. **Frontend Integration - Async Upload Pattern**
 • Step 1: User uploads file → immediate "Upload in progress" indicator
 • Step 2: File uploaded → "Processing document..." with job status polling
 • Step 3: Parsing complete → "Document ready" with link to view
 • Optional Step 4: If autoExtract enabled → "Extracting entities..." status
 • Use SSE (Server-Sent Events) or polling every 2 seconds for status updates
 • Show progress: pending → uploading → parsing → [extracting] → complete

9. **Security: Deferred to Phase 2**
 • File validation, virus scanning, content sanitization
 • Will add in hardening phase

10. **Cost Estimation: Deferred**
 • Monitor actual usage in dev/staging first
 • Evaluate GCS costs before production deployment


### Implementation Priority

Week 1 (Must Have):

• ✅ Docker setup (Docling + MinIO)
• ✅ Database schema
• ✅ Storage service
• ✅ Worker service (basic routing)

Week 2 (Should Have):

• ✅ Upload endpoint
• ✅ Job status endpoint
• ✅ Plain text vs Docling routing
• ✅ Auto-extraction chaining

Week 3 (Nice to Have):

• Frontend upload UI
• Progress tracking
• Artifact viewer (tables, images)
• Error handling improvements

Week 4 (Polish):

• E2E tests
• Documentation
• Performance tuning
• Production deployment

---

## Success Metrics

• ✅ Coverage: Parse 95%+ of uploaded documents successfully
• ✅ Performance: < 10 seconds for typical documents (<5MB)
• ✅ Accuracy: 90%+ table structure preservation
• ✅ Reliability: 99.9% uptime for parsing service
• ✅ Adoption: 70%+ of uploads use autoExtract feature
• ✅ Dev-Prod Parity: Same code works with MinIO and GCS