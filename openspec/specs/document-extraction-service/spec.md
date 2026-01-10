# document-extraction-service Specification

## Purpose
TBD - created by archiving change add-kreuzberg-document-extraction. Update Purpose after archive.
## Requirements
### Requirement: Kreuzberg Docker Service Availability

The system SHALL provide a Kreuzberg document extraction service as a Docker container that is available for document parsing operations.

#### Scenario: Service health check passes

- **GIVEN** the Kreuzberg Docker container is running
- **WHEN** a GET request is made to `/health`
- **THEN** the service returns HTTP 200 with status "healthy"
- **AND** the response time is less than 1 second

#### Scenario: Service starts within acceptable time

- **GIVEN** the Docker Compose stack is starting
- **WHEN** the Kreuzberg container initializes
- **THEN** the service is ready to accept requests within 30 seconds
- **AND** the health check endpoint is responsive

#### Scenario: Service recovers from restart

- **GIVEN** the Kreuzberg container is restarted
- **WHEN** the container comes back online
- **THEN** the service resumes processing without data loss
- **AND** pending requests can be retried

### Requirement: Document Text Extraction via HTTP API

The system SHALL extract text content from binary documents by sending files to the Kreuzberg service via HTTP multipart form upload.

#### Scenario: Extract text from PDF document

- **GIVEN** a PDF file is uploaded for processing
- **WHEN** the file is sent to Kreuzberg via POST /extract
- **THEN** the service returns the extracted text content
- **AND** the response includes metadata about the document (page count, etc.)
- **AND** processing completes within 60 seconds for files under 10MB

#### Scenario: Extract text from DOCX document

- **GIVEN** a Microsoft Word DOCX file is uploaded for processing
- **WHEN** the file is sent to Kreuzberg via POST /extract
- **THEN** the service returns the extracted text content
- **AND** document structure (headings, paragraphs) is preserved as plain text
- **AND** processing completes within 30 seconds for files under 5MB

#### Scenario: Extract text from image with OCR

- **GIVEN** an image file (PNG, JPEG) containing text is uploaded
- **WHEN** the file is sent to Kreuzberg via POST /extract
- **THEN** the service performs OCR and returns the extracted text
- **AND** processing completes within 120 seconds for high-resolution images

#### Scenario: Unsupported file format rejection

- **GIVEN** a file with an unsupported format (e.g., .exe, .zip) is uploaded
- **WHEN** the file is sent to Kreuzberg
- **THEN** the service returns HTTP 400 with error "unsupported_format"
- **AND** the error message lists supported formats

#### Scenario: Empty or corrupted file handling

- **GIVEN** an empty file or corrupted document is uploaded
- **WHEN** the file is sent to Kreuzberg
- **THEN** the service returns HTTP 400 with error "invalid_file"
- **AND** the error message describes the issue (empty, corrupted, encrypted)

### Requirement: NestJS Kreuzberg Client Service

The server SHALL provide a KreuzbergClientService that encapsulates HTTP communication with the Kreuzberg Docker service.

#### Scenario: Successful text extraction call

- **GIVEN** the KreuzbergClientService is initialized
- **AND** the Kreuzberg service is healthy
- **WHEN** `extractText(buffer, filename, mimeType)` is called
- **THEN** the method returns extracted text and metadata
- **AND** the file is sent as multipart form data

#### Scenario: Health check integration

- **GIVEN** the KreuzbergClientService is initialized
- **WHEN** `healthCheck()` is called
- **THEN** the method returns true if Kreuzberg is healthy
- **AND** the method returns false if Kreuzberg is unavailable

#### Scenario: Timeout handling

- **GIVEN** a large document is being processed
- **WHEN** processing exceeds the configured timeout (default: 300 seconds)
- **THEN** the client throws a TimeoutError
- **AND** the error is logged with document details

#### Scenario: Connection error handling

- **GIVEN** the Kreuzberg service is unavailable
- **WHEN** `extractText()` is called
- **THEN** the client throws a ConnectionError
- **AND** the error includes the service URL for debugging

### Requirement: Document Parsing Worker Integration

The DocumentParsingWorkerService SHALL route documents to either direct storage or Kreuzberg based on file type.

#### Scenario: Plain text file direct storage

- **GIVEN** a parsing job for a .txt, .md, or .csv file
- **WHEN** the worker processes the job
- **THEN** the file content is read directly as UTF-8
- **AND** no call is made to Kreuzberg service
- **AND** the document is created with `processing_method: 'direct'`

#### Scenario: Complex document Kreuzberg routing

- **GIVEN** a parsing job for a PDF, DOCX, or image file
- **WHEN** the worker processes the job
- **THEN** the file is sent to Kreuzberg for extraction
- **AND** the extracted text is stored in kb.documents
- **AND** the document is created with `processing_method: 'kreuzberg'`

#### Scenario: Kreuzberg disabled fallback

- **GIVEN** KREUZBERG_ENABLED is set to false
- **AND** a parsing job for a complex document is created
- **WHEN** the worker processes the job
- **THEN** the job fails with error "Document parsing service not available"
- **AND** the job status is set to 'failed'

#### Scenario: Retry on transient failure

- **GIVEN** a parsing job fails due to Kreuzberg timeout
- **WHEN** retry_count is less than max_retries (default: 3)
- **THEN** the job is re-queued with incremented retry_count
- **AND** the next attempt uses exponential backoff

### Requirement: Configuration via Environment Variables

The system SHALL support configuration of Kreuzberg service parameters via environment variables.

#### Scenario: Default configuration values

- **GIVEN** no Kreuzberg environment variables are set
- **WHEN** the server starts
- **THEN** the following defaults are used:
  - KREUZBERG_SERVICE_URL: http://kreuzberg:8000
  - KREUZBERG_SERVICE_TIMEOUT: 300000 (5 minutes)
  - KREUZBERG_ENABLED: true

#### Scenario: Custom service URL

- **GIVEN** KREUZBERG_SERVICE_URL is set to a custom value
- **WHEN** the KreuzbergClientService makes requests
- **THEN** requests are sent to the configured URL

#### Scenario: Service disabled

- **GIVEN** KREUZBERG_ENABLED is set to false
- **WHEN** a complex document is uploaded
- **THEN** the upload is rejected with error "Document parsing not available"
- **AND** no parsing job is created

### Requirement: Error Handling and Logging

The system SHALL provide comprehensive error handling and logging for document extraction operations.

#### Scenario: Log extraction start

- **GIVEN** a document extraction is initiated
- **WHEN** the request is sent to Kreuzberg
- **THEN** an INFO log is written with filename, mime type, and file size

#### Scenario: Log extraction completion

- **GIVEN** a document extraction completes successfully
- **WHEN** the response is received from Kreuzberg
- **THEN** an INFO log is written with filename and duration in milliseconds

#### Scenario: Log extraction failure

- **GIVEN** a document extraction fails
- **WHEN** the error is caught
- **THEN** an ERROR log is written with filename, error message, and stack trace
- **AND** the parsing job is updated with error details

#### Scenario: Structured error response

- **GIVEN** a parsing job fails
- **WHEN** the job status is queried
- **THEN** the response includes:
  - error_message: Human-readable description
  - error_details: JSON with error code, timestamp, retry count

### Requirement: MinIO Docker Service Availability

The system SHALL provide a MinIO object storage service as a Docker container for storing original documents and extracted artifacts.

#### Scenario: MinIO service health check passes

- **GIVEN** the MinIO Docker container is running
- **WHEN** a GET request is made to `/minio/health/live`
- **THEN** the service returns HTTP 200
- **AND** the S3 API endpoint is accessible on port 9000

#### Scenario: MinIO buckets are initialized

- **GIVEN** the Docker Compose stack starts
- **WHEN** the minio-init container runs
- **THEN** the `documents` bucket is created
- **AND** the `document-temp` bucket is created
- **AND** the init container exits with code 0

#### Scenario: MinIO console is accessible in development

- **GIVEN** the MinIO container is running
- **AND** the environment is development
- **WHEN** a user navigates to http://localhost:9001
- **THEN** the MinIO web console is accessible
- **AND** the user can authenticate with configured credentials

### Requirement: Provider-Agnostic Storage Service

The server SHALL provide a StorageService abstraction that supports MinIO (development), GCS (production), and S3 providers via environment configuration.

#### Scenario: Upload file to storage

- **GIVEN** the StorageService is initialized
- **AND** a file buffer is provided
- **WHEN** `upload(buffer, key, options)` is called
- **THEN** the file is uploaded to the configured provider
- **AND** the method returns `{ key, url, bucket, size }`
- **AND** the storage key follows format: `{project_id}/{org_id}/{uuid}-{filename}`

#### Scenario: Download file from storage

- **GIVEN** a file exists in storage with key "abc/def/123-doc.pdf"
- **WHEN** `download(key)` is called
- **THEN** the file buffer is returned
- **AND** the buffer matches the originally uploaded content

#### Scenario: Delete file from storage

- **GIVEN** a file exists in storage with key "abc/def/123-doc.pdf"
- **WHEN** `delete(key)` is called
- **THEN** the file is removed from storage
- **AND** subsequent `exists(key)` returns false

#### Scenario: Generate signed URL for download

- **GIVEN** a file exists in storage with key "abc/def/123-doc.pdf"
- **WHEN** `getSignedUrl(key, expiresInSeconds)` is called
- **THEN** a pre-signed URL is returned
- **AND** the URL is valid for the specified duration (default: 1 hour)
- **AND** the URL allows anonymous download within the expiration window

#### Scenario: Check if file exists

- **GIVEN** a file key to check
- **WHEN** `exists(key)` is called
- **THEN** the method returns true if the file exists
- **AND** the method returns false if the file does not exist

#### Scenario: Switch storage provider via environment

- **GIVEN** STORAGE_PROVIDER is set to "minio"
- **WHEN** the server starts
- **THEN** the MinIO provider is used for all storage operations

- **GIVEN** STORAGE_PROVIDER is set to "gcs"
- **WHEN** the server starts
- **THEN** the Google Cloud Storage provider is used

### Requirement: Original File Storage

The system SHALL store original uploaded files in object storage with references in the database.

#### Scenario: Original file uploaded to storage

- **GIVEN** a document parsing job is created
- **WHEN** the worker processes the job
- **THEN** the original file is uploaded to the `documents` bucket
- **AND** the `storage_key` is stored in `kb.document_parsing_jobs`
- **AND** the `storage_key` is copied to `kb.documents` on completion

#### Scenario: Original file accessible via signed URL

- **GIVEN** a document exists with `storage_key` populated
- **WHEN** `GET /documents/{id}/download` is called
- **THEN** a signed URL is generated for the original file
- **AND** the URL expires after 1 hour (default)

### Requirement: Document Artifact Storage

The system SHALL store extracted artifacts (tables, images) in the `kb.document_artifacts` table with optional object storage for large artifacts.

#### Scenario: Table artifact stored as JSON

- **GIVEN** a PDF document contains a table
- **WHEN** Kreuzberg extracts the table
- **THEN** the table data is stored in `kb.document_artifacts`
- **AND** `artifact_type` is set to "table"
- **AND** `content` contains structured JSON with headers and rows
- **AND** `storage_key` is NULL (small data stored inline)

#### Scenario: Image artifact stored in object storage

- **GIVEN** a PDF document contains embedded images
- **WHEN** Kreuzberg extracts images
- **THEN** each image is uploaded to the `documents` bucket
- **AND** a record is created in `kb.document_artifacts`
- **AND** `artifact_type` is set to "image"
- **AND** `storage_key` references the image in MinIO/GCS

#### Scenario: Artifacts cascade deleted with document

- **GIVEN** a document with artifacts exists
- **WHEN** the document is deleted
- **THEN** all related `kb.document_artifacts` records are deleted (CASCADE)
- **AND** associated files in object storage are deleted

### Requirement: Storage Cleanup on Document Deletion

The system SHALL clean up object storage files when documents are deleted.

#### Scenario: Storage file deleted with document

- **GIVEN** a document exists with `storage_key` populated
- **WHEN** the document is deleted via API
- **THEN** the original file is deleted from object storage
- **AND** any artifact files are deleted from object storage
- **AND** the database records are deleted

#### Scenario: Failed storage cleanup is logged

- **GIVEN** a document with storage files is being deleted
- **WHEN** the storage deletion fails (e.g., network error)
- **THEN** an ERROR log is written with the storage key
- **AND** the database deletion proceeds (eventual consistency)
- **AND** orphaned files can be cleaned up by maintenance job

### Requirement: Storage Configuration via Environment Variables

The system SHALL support configuration of storage parameters via environment variables.

#### Scenario: Default MinIO configuration

- **GIVEN** STORAGE_PROVIDER is set to "minio"
- **AND** no other storage variables are set
- **WHEN** the server starts
- **THEN** the following defaults are used:
  - STORAGE_ENDPOINT: http://minio:9000
  - STORAGE_ACCESS_KEY: minioadmin
  - STORAGE_SECRET_KEY: minioadmin
  - STORAGE_BUCKET_DOCUMENTS: documents
  - STORAGE_BUCKET_TEMP: document-temp

#### Scenario: GCS configuration for production

- **GIVEN** STORAGE_PROVIDER is set to "gcs"
- **AND** GCS_PROJECT_ID and GCS_CREDENTIALS_PATH are configured
- **WHEN** the server starts
- **THEN** Google Cloud Storage is used for all operations
- **AND** no MinIO connection is attempted

### Requirement: File Size and Retention Limits

The system SHALL enforce file size limits and retention policies.

#### Scenario: File exceeds maximum size

- **GIVEN** MAX_DOCUMENT_SIZE is set to 100MB
- **WHEN** a file larger than 100MB is uploaded
- **THEN** the upload is rejected with HTTP 413
- **AND** error message indicates "File exceeds maximum size of 100MB"

#### Scenario: Temporary files cleaned after processing

- **GIVEN** a file is uploaded to the `document-temp` bucket during processing
- **WHEN** parsing completes successfully
- **THEN** the temp file is deleted
- **AND** only the permanent file in `documents` bucket remains

