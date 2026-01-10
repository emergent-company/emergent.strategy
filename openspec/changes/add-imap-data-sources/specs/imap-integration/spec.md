## ADDED Requirements

### Requirement: Generic Integration Entity

The system SHALL provide a generic integration entity that supports multiple provider types without requiring schema changes for new providers.

#### Scenario: Create integration with provider type

- **WHEN** a user with `integrations:write` scope submits POST /api/integrations with provider configuration
- **THEN** the system SHALL create an integration record with:
  - `provider_type`: The provider implementation (e.g., `'imap'`)
  - `source_type`: The type of documents it produces (e.g., `'email'`)
  - `name`: User-defined display name
  - `config_encrypted`: Provider-specific configuration (encrypted)
- **AND** the system SHALL validate configuration against the provider's schema
- **AND** the system SHALL test the connection before saving

#### Scenario: List integrations for project

- **WHEN** a user with `integrations:read` scope requests GET /api/integrations
- **THEN** the system SHALL return all integrations for the current project
- **AND** each integration SHALL include: id, provider_type, source_type, name, status, last_synced_at
- **AND** encrypted configuration SHALL NOT be included in the response

#### Scenario: Filter integrations by provider type

- **WHEN** a user requests GET /api/integrations?provider_type=imap
- **THEN** the system SHALL return only integrations with the specified provider type

#### Scenario: Filter integrations by source type

- **WHEN** a user requests GET /api/integrations?source_type=email
- **THEN** the system SHALL return all integrations that produce the specified source type

#### Scenario: Update integration configuration

- **WHEN** a user with `integrations:write` scope submits PATCH /api/integrations/:id
- **THEN** the system SHALL update the integration configuration
- **AND** if connection settings changed, the system SHALL re-test the connection
- **AND** the updated configuration SHALL be re-encrypted

#### Scenario: Delete integration

- **WHEN** a user with `integrations:delete` scope submits DELETE /api/integrations/:id
- **THEN** the system SHALL delete the integration record
- **AND** documents created by this integration SHALL NOT be deleted
- **AND** documents SHALL retain their `integration_id` for reference (orphaned but traceable)

### Requirement: Integration Provider Registry

The system SHALL maintain a registry of available integration providers.

#### Scenario: Register IMAP provider

- **WHEN** the system starts
- **THEN** the IMAP provider SHALL be registered with:
  - `provider_type`: `'imap'`
  - `source_type`: `'email'`
  - `display_name`: `'IMAP Email'`
  - Configuration schema for validation

#### Scenario: List available providers

- **WHEN** a user requests GET /api/integrations/providers
- **THEN** the system SHALL return all registered providers
- **AND** each provider SHALL include: provider_type, source_type, display_name

#### Scenario: Get provider configuration schema

- **WHEN** a user requests GET /api/integrations/providers/:providerType/schema
- **THEN** the system SHALL return the JSON schema for that provider's configuration
- **AND** the schema SHALL be usable for form generation in the UI

### Requirement: IMAP Provider Implementation

The system SHALL provide an IMAP provider for importing emails from IMAP servers.

#### Scenario: IMAP connection configuration

- **WHEN** a user creates an IMAP integration
- **THEN** the configuration SHALL include:
  - `host`: IMAP server hostname
  - `port`: Server port (default: 993)
  - `encryption`: `'ssl'` | `'starttls'` | `'none'`
  - `username`: Email/username
  - `password`: Account password (encrypted at rest)
  - `filters`: Email filter criteria (optional)

#### Scenario: Test IMAP connection

- **WHEN** a user submits IMAP configuration with "Test Connection"
- **THEN** the system SHALL attempt to connect to the IMAP server
- **AND** on success, return `{ success: true }` with folder count
- **AND** on failure, return `{ success: false, error: '...' }` with descriptive message

#### Scenario: IMAP connection with invalid credentials

- **WHEN** IMAP credentials are invalid
- **THEN** the system SHALL return error code "authentication-failed"
- **AND** the integration status SHALL be set to "error"
- **AND** the system SHALL NOT retry automatically (prevent account lockout)

### Requirement: IMAP Mailbox Browser

The system SHALL provide an interface to browse mailbox folders and view email counts.

#### Scenario: List mailbox folders

- **WHEN** a user requests GET /api/integrations/:id/imap/folders
- **THEN** the system SHALL connect to the IMAP server
- **AND** return a list of available folders with: name, path, message_count, unread_count

#### Scenario: Folder hierarchy display

- **WHEN** the IMAP server has nested folders (e.g., "Work/Projects/Alpha")
- **THEN** the system SHALL return the full folder hierarchy
- **AND** the response SHALL include parent-child relationships

### Requirement: IMAP Email Preview with Filters

The system SHALL allow users to preview emails matching filter criteria before importing.

#### Scenario: Preview emails with filters

- **WHEN** a user requests POST /api/integrations/:id/imap/preview with filter criteria
- **THEN** the system SHALL search for matching emails
- **AND** return the first 100 matching email headers (not body)
- **AND** include total matching count for display
- **AND** each preview SHALL include: message_id, from, to, subject, date, has_attachments

#### Scenario: Filter by sender address

- **WHEN** a user specifies `from: ["alice@example.com"]` filter
- **THEN** the system SHALL return only emails from the specified addresses
- **AND** the filter SHALL support wildcard patterns (e.g., `*@example.com`)

#### Scenario: Filter by recipient address

- **WHEN** a user specifies `to: ["team@company.com"]` filter
- **THEN** the system SHALL return only emails sent to the specified addresses
- **AND** the filter SHALL match both To and CC fields

#### Scenario: Filter by subject

- **WHEN** a user specifies `subject: "Project Update"` filter
- **THEN** the system SHALL return only emails with subjects containing the text
- **AND** the search SHALL be case-insensitive

#### Scenario: Filter by date range

- **WHEN** a user specifies `date_from` and `date_to` filters
- **THEN** the system SHALL return only emails within the date range

#### Scenario: Filter by folder

- **WHEN** a user specifies `folders: ["INBOX", "Work"]` filter
- **THEN** the system SHALL only search within the specified folders

#### Scenario: Combined filters with AND logic

- **WHEN** a user specifies multiple filter criteria
- **THEN** the system SHALL apply all filters with AND logic

### Requirement: IMAP Email Import

The system SHALL allow users to import selected emails as documents.

#### Scenario: Import selected emails

- **WHEN** a user submits POST /api/integrations/:id/imap/import with message_ids
- **THEN** the system SHALL queue import jobs for each email
- **AND** return a job ID for tracking progress
- **AND** each email SHALL become a document with `source_type: 'email'`

#### Scenario: Import all matching emails

- **WHEN** a user submits import with `import_all: true` and filter criteria
- **THEN** the system SHALL import all emails matching the filters
- **AND** process in batches to avoid overwhelming the server
- **AND** skip already-imported emails (by message_id)

#### Scenario: Email document creation

- **WHEN** an email is imported
- **THEN** a document SHALL be created with:
  - `source_type`: `'email'`
  - `integration_id`: The IMAP integration UUID
  - `filename`: Email subject
  - `content`: Email body (plain text)
  - `integration_metadata`: Email headers (from, to, subject, date, message_id, folder)

#### Scenario: Attachment import as child documents

- **WHEN** an email with attachments is imported
- **THEN** each attachment SHALL be created as a child document
- **AND** child documents SHALL have `parent_document_id` pointing to email
- **AND** supported types (PDF, DOCX, etc.) SHALL be processed through ingestion pipeline

#### Scenario: Duplicate email detection

- **WHEN** an email with the same message_id already exists
- **THEN** the system SHALL skip re-importing
- **AND** return `status: 'skipped'` with reason `'duplicate'`

#### Scenario: Import progress tracking

- **WHEN** an import job is in progress
- **THEN** GET /api/integrations/:id/imap/import/:jobId/status SHALL return:
  - `total`: Total emails to import
  - `processed`: Count processed so far
  - `success`: Count successfully imported
  - `failed`: Count with errors
  - `errors`: Array of error details

### Requirement: IMAP Sync Modes

The system SHALL support manual and recurring synchronization.

#### Scenario: Manual sync trigger

- **WHEN** a user submits POST /api/integrations/:id/sync
- **THEN** the system SHALL immediately queue a sync job
- **AND** import new emails matching filters since last sync

#### Scenario: Configure recurring sync

- **WHEN** a user updates integration with `sync_mode: 'recurring'` and `sync_interval_minutes`
- **THEN** the sync worker SHALL check this integration at the specified interval
- **AND** only import emails newer than `last_synced_at`

#### Scenario: Sync interval options

- **WHEN** a user configures recurring sync
- **THEN** available intervals SHALL be: 15, 60, 360, 1440 minutes (15m, 1h, 6h, 24h)

#### Scenario: Disable recurring sync

- **WHEN** a user updates integration with `sync_mode: 'manual'`
- **THEN** the integration SHALL be removed from recurring sync schedule

### Requirement: Integration Credential Security

The system SHALL securely store integration credentials.

#### Scenario: Credential encryption at rest

- **WHEN** an integration is created or updated
- **THEN** the entire `config` object SHALL be encrypted using AES-256-GCM
- **AND** the encryption key SHALL be from environment configuration
- **AND** plaintext credentials SHALL never be logged or returned in responses

#### Scenario: Credential decryption for use

- **WHEN** the system needs to connect to an external service
- **THEN** credentials SHALL be decrypted in memory only for the operation
- **AND** decrypted values SHALL be cleared after use

### Requirement: IMAP Integration UI

The system SHALL provide a user interface for managing IMAP integrations.

#### Scenario: IMAP integration list page

- **WHEN** a user navigates to Settings > Integrations
- **THEN** the system SHALL display all integrations grouped by provider type
- **AND** each integration SHALL show: name, status, last sync time, document count

#### Scenario: Create IMAP integration form

- **WHEN** a user clicks "Add IMAP Integration"
- **THEN** the system SHALL display a form with:
  - Name (user-friendly label)
  - IMAP Server, Port, Encryption
  - Username, Password
  - "Test Connection" button
- **AND** validation errors SHALL be displayed inline

#### Scenario: IMAP folder selection UI

- **WHEN** a user has a connected IMAP integration
- **THEN** the system SHALL display a folder tree with checkboxes
- **AND** show message counts per folder
- **AND** allow selecting folders to include in sync

#### Scenario: IMAP email browser UI

- **WHEN** a user clicks "Browse Emails" on an IMAP integration
- **THEN** the system SHALL display:
  - Filter controls (from, to, subject, date range, folder)
  - Email preview list with checkboxes
  - Total matching count
  - "Import Selected" and "Import All Matching" buttons
- **AND** support pagination (100 per page)

#### Scenario: IMAP sync settings UI

- **WHEN** a user configures sync settings
- **THEN** the system SHALL display:
  - Sync mode toggle (Manual / Recurring)
  - Interval dropdown (when recurring)
  - Last sync time and next scheduled sync
  - "Sync Now" button
