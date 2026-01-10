## ADDED Requirements

### Requirement: Google Drive OAuth Integration

The system SHALL support OAuth 2.0 authentication with Google Drive using the existing OALF (OAuth Authorization Link Flow) mechanism.

#### Scenario: Start Google Drive OAuth flow

- **WHEN** a user initiates Google Drive connection via POST /data-source-integrations/oauth/google/start with providerType 'google_drive'
- **THEN** the system SHALL generate an authorization URL with drive.readonly scope
- **AND** the state parameter SHALL include provider type, project ID, and return URL
- **AND** the system SHALL redirect user to Google OAuth consent screen

#### Scenario: Complete Google Drive OAuth callback

- **WHEN** Google redirects to the OAuth callback with authorization code
- **AND** the state indicates provider type 'google_drive'
- **THEN** the system SHALL exchange the code for access and refresh tokens
- **AND** the system SHALL create a DataSourceIntegration with providerType 'google_drive'
- **AND** the system SHALL store encrypted tokens in configEncrypted
- **AND** the system SHALL redirect to the frontend with success status

#### Scenario: Refresh expired Drive access token

- **WHEN** a Google Drive API request is made
- **AND** the access token is expired or will expire within 5 minutes
- **THEN** the system SHALL automatically refresh the token using the refresh token
- **AND** the system SHALL update the stored access token and expiry time

### Requirement: Google Drive Folder Selection

The system SHALL allow users to configure which folders or Shared Drives to synchronize.

#### Scenario: Configure sync for all folders

- **WHEN** a user configures folder mode as 'all'
- **THEN** the system SHALL sync all files the user has access to in My Drive
- **AND** the system SHALL exclude trashed files by default

#### Scenario: Configure sync for specific folders

- **WHEN** a user configures folder mode as 'specific'
- **AND** selects one or more folders via the folder picker
- **THEN** the system SHALL store the selected folder IDs and paths
- **AND** the system SHALL only sync files within those folders and subfolders

#### Scenario: Configure sync for Shared Drives

- **WHEN** a user configures folder mode as 'shared_drives'
- **AND** selects one or more Shared Drives (Team Drives)
- **THEN** the system SHALL store the selected Shared Drive IDs
- **AND** the system SHALL only sync files from those Shared Drives

#### Scenario: Browse folder hierarchy

- **WHEN** a user requests folder listing via GET /data-source-integrations/:id/browse
- **THEN** the system SHALL return folders with their IDs, names, and file counts
- **AND** the system SHALL support lazy-loading subfolders
- **AND** the system SHALL list available Shared Drives separately

### Requirement: Google Drive File Sync

The system SHALL synchronize files from Google Drive into the knowledge base as documents.

#### Scenario: Initial full sync

- **WHEN** a user triggers sync for the first time
- **THEN** the system SHALL list all files matching the folder selection
- **AND** the system SHALL store a change token for incremental sync
- **AND** the system SHALL download and process each file
- **AND** the system SHALL create Document records with source_type 'drive'

#### Scenario: Incremental sync using change tokens

- **WHEN** a user triggers sync after initial sync
- **AND** a change token exists from previous sync
- **THEN** the system SHALL use Google Drive changes.list API
- **AND** the system SHALL only process new or modified files
- **AND** the system SHALL update the change token for next sync

#### Scenario: Detect file updates

- **WHEN** incremental sync detects a file modification
- **AND** a document already exists for that Drive file ID
- **THEN** the system SHALL update the existing document content
- **AND** the system SHALL update document metadata with new modification time

#### Scenario: Skip unchanged files

- **WHEN** processing a file during sync
- **AND** a document exists with the same Drive file ID and modification time
- **THEN** the system SHALL skip the file
- **AND** the system SHALL increment skipped count in sync results

### Requirement: Google Workspace Export

The system SHALL export Google Workspace documents (Docs, Sheets, Slides) to text formats for processing.

#### Scenario: Export Google Docs to Markdown

- **WHEN** processing a file with MIME type 'application/vnd.google-apps.document'
- **THEN** the system SHALL export the document as Markdown (text/markdown)
- **AND** the system SHALL preserve headings, lists, and basic formatting

#### Scenario: Export Google Sheets to CSV

- **WHEN** processing a file with MIME type 'application/vnd.google-apps.spreadsheet'
- **THEN** the system SHALL export the first sheet as CSV
- **AND** the document content SHALL be the CSV text

#### Scenario: Export Google Slides to plain text

- **WHEN** processing a file with MIME type 'application/vnd.google-apps.presentation'
- **THEN** the system SHALL export slide content as plain text
- **AND** the system SHALL include slide titles and text content

#### Scenario: Skip unsupported Google formats

- **WHEN** processing a Google Drawings or other unsupported Google format
- **THEN** the system SHALL skip the file
- **AND** the system SHALL log that the file was skipped due to unsupported format

### Requirement: Google Drive Document Metadata

The system SHALL store Drive-specific metadata on imported documents for traceability.

#### Scenario: Store Drive file metadata

- **WHEN** a document is created from a Google Drive file
- **THEN** the system SHALL store in integrationMetadata:
  - driveFileId: the Google Drive file ID
  - driveFolderId: the parent folder ID
  - mimeType: the original MIME type
  - webViewLink: URL to view in Google Drive
  - driveModifiedTime: the file's last modified time in Drive

#### Scenario: Store Shared Drive reference

- **WHEN** a document is created from a Shared Drive file
- **THEN** the system SHALL additionally store:
  - sharedDriveId: the Shared Drive ID
  - sharedDriveName: the Shared Drive name

### Requirement: Google Drive Sync Preview

The system SHALL provide sync preview showing folder statistics and file counts.

#### Scenario: Get sync preview

- **WHEN** a user requests sync preview via GET /data-source-integrations/:id/sync-preview
- **THEN** the system SHALL return:
  - List of folders with file counts
  - Total files matching filters
  - Number of files already imported
  - Number of new files available to sync

#### Scenario: Apply file filters to preview

- **WHEN** sync preview is requested with file type filters
- **THEN** the system SHALL only count files matching the MIME type filters
- **AND** the system SHALL respect max file size limits if configured

### Requirement: Google Drive API Rate Limiting

The system SHALL implement rate limiting to respect Google Drive API quotas.

#### Scenario: Throttle API requests

- **WHEN** making Google Drive API requests
- **THEN** the system SHALL limit requests to 8 per second
- **AND** the system SHALL queue requests exceeding the limit

#### Scenario: Handle rate limit responses

- **WHEN** Google Drive API returns 429 Too Many Requests
- **THEN** the system SHALL implement exponential backoff
- **AND** the system SHALL retry the request up to 3 times
- **AND** the system SHALL log rate limit events
