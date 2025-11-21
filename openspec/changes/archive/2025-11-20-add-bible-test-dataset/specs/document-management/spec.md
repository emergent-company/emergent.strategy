# document-management Specification Delta

## ADDED Requirements

### Requirement: Document Metadata for Batch Uploads

The system SHALL support associating custom metadata with documents during ingestion to enable categorization and filtering of batch-uploaded documents.

#### Scenario: Upload document with custom filename

- **WHEN** a document is uploaded via POST /ingest/upload with a custom filename parameter
- **THEN** the system:
  - Stores the document with the specified filename
  - Uses the filename for display and search purposes
  - Overrides the original uploaded file name

#### Scenario: Query documents by filename pattern

- **WHEN** a user searches for documents with filename matching a pattern (e.g., "Genesis\*")
- **THEN** the system:
  - Returns all documents with filenames matching the pattern
  - Supports wildcard matching
  - Orders results by relevance or creation date

#### Scenario: Batch upload tracking

- **WHEN** multiple documents are uploaded in sequence from the same source
- **THEN** the system:
  - Accepts each document independently
  - Returns unique document ID for each upload
  - Allows tracking upload success/failure per document
  - Supports filtering documents by project_id to view all documents from a batch

**Note:** Current ingestion API already supports custom filename via IngestionUploadDto.filename. This requirement documents the expected behavior for batch upload scenarios where tracking multiple documents is important.
