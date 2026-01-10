# document-management Spec Delta

## ADDED Requirements

### Requirement: Document External Source Tracking

The system SHALL support tracking document source types and external source metadata to enable importing documents from external sources beyond file uploads.

#### Scenario: Upload document defaults to upload source type

- **WHEN** a document is uploaded via POST /ingest/upload without external source parameters
- **THEN** the system SHALL set `source_type` to `'upload'`
- **AND** the system SHALL leave `external_source_id` as null

#### Scenario: Create document from external source

- **WHEN** a document is created from an external source (Google Drive, URL, etc.)
- **THEN** the system SHALL set `source_type` to the appropriate provider type
- **AND** the system SHALL link to the corresponding `ExternalSource` record via `external_source_id`
- **AND** the system SHALL set `sync_version` to track import versions

#### Scenario: Query documents by source type

- **WHEN** a user queries documents with a `source_type` filter
- **THEN** the system SHALL return only documents matching the specified source type
- **AND** the system SHALL support filtering by multiple source types

#### Scenario: Query documents by external source

- **WHEN** a user queries documents with an `external_source_id` filter
- **THEN** the system SHALL return all document versions from that external source
- **AND** the system SHALL order by `sync_version` descending (newest first)

### Requirement: Document Version Tracking for External Sources

The system SHALL support multiple document versions from the same external source to track sync history.

#### Scenario: Create new version on sync

- **WHEN** an external source is synced and content has changed
- **THEN** the system SHALL create a new Document record
- **AND** the system SHALL link it to the same ExternalSource
- **AND** the system SHALL increment `sync_version`
- **AND** the system SHALL process through standard ingestion (chunking, embedding)

#### Scenario: Identify latest version

- **WHEN** querying documents for an external source
- **THEN** the system SHALL indicate which document is the latest version
- **AND** the system SHALL provide access to previous versions for history

### Requirement: Google Drive Public File Access

The system SHALL support downloading publicly shared files from Google Drive without requiring OAuth authentication.

#### Scenario: Download publicly shared Google Drive file

- **WHEN** the system receives a Google Drive file ID for a file shared with "anyone with the link"
- **THEN** the system SHALL use the Google Drive API v3 to download the file content
- **AND** the system SHALL extract file metadata (name, mimeType, size, modifiedTime)
- **AND** the system SHALL return the file content for ingestion

#### Scenario: Google Drive file not publicly accessible

- **WHEN** the system attempts to download a Google Drive file that is not publicly shared
- **THEN** the system SHALL return an error indicating the file is not accessible
- **AND** the error message SHALL suggest the user make the file public or use "anyone with the link" sharing

#### Scenario: Google Drive file not found

- **WHEN** the system attempts to download a Google Drive file ID that does not exist
- **THEN** the system SHALL return a 404 error with a clear message
- **AND** the system SHALL suggest verifying the link is correct

#### Scenario: Google Drive unsupported file type

- **WHEN** the system receives a Google Drive file with an unsupported MIME type
- **THEN** the system SHALL return a 400 error listing supported file types
- **AND** the system SHALL NOT attempt to download or process the file

#### Scenario: Google Docs/Sheets/Slides export

- **WHEN** the system receives a Google Docs, Sheets, or Slides file
- **THEN** the system SHALL export the file to an appropriate format:
  - Google Docs -> text/plain or application/pdf
  - Google Sheets -> text/csv
  - Google Slides -> application/pdf
- **AND** the system SHALL use the exported content for ingestion
