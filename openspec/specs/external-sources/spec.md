# external-sources Specification

## Purpose
TBD - created by archiving change add-external-sources. Update Purpose after archive.
## Requirements
### Requirement: External Source Provider Architecture

The system SHALL provide a pluggable provider architecture that enables different external source integrations with a consistent interface.

#### Scenario: Register external source provider

- **WHEN** the application starts
- **THEN** the system SHALL register all configured external source providers
- **AND** each provider SHALL be accessible via the provider registry
- **AND** the registry SHALL support provider lookup by type

#### Scenario: Detect provider from URL

- **WHEN** the system receives a URL for import
- **THEN** the system SHALL iterate through registered providers
- **AND** the system SHALL use the first provider that can handle the URL
- **AND** if no provider matches, the system SHALL fall back to the generic URL provider

#### Scenario: Provider implements standard interface

- **WHEN** a new provider is implemented
- **THEN** the provider SHALL implement all required interface methods:
  - `canHandle(url)` - URL pattern matching
  - `parseUrl(url)` - Extract source reference
  - `checkAccess(ref)` - Validate accessibility
  - `fetchMetadata(ref)` - Get source metadata
  - `fetchContent(ref)` - Download content
  - `checkForUpdates(ref, lastSync)` - Detect changes
- **AND** the provider SHALL specify rate limit configuration
- **AND** the provider SHALL specify default sync policy

### Requirement: External Source Entity Management

The system SHALL maintain a dedicated entity for tracking external source references independently of document content.

#### Scenario: Create external source record

- **WHEN** a new external source is imported
- **THEN** the system SHALL create an `ExternalSource` record with:
  - Provider type and external ID
  - Original and normalized URLs
  - Display name and MIME type
  - Sync policy configuration
  - Provider-specific metadata
- **AND** the system SHALL link the created document to this source

#### Scenario: Deduplicate by external source

- **WHEN** an import is requested for a URL
- **THEN** the system SHALL check for existing sources by:
  1. Provider type + external ID (primary)
  2. Normalized URL (secondary)
- **AND** if found, the system SHALL return the existing source
- **AND** the system SHALL NOT create a duplicate

#### Scenario: Track multiple document versions from source

- **WHEN** an external source is synced and content has changed
- **THEN** the system SHALL create a new document version
- **AND** the system SHALL link the new document to the same ExternalSource
- **AND** the system SHALL increment the sync version number

### Requirement: External Source Import API

The system SHALL provide API endpoints for programmatic import and management of external sources.

#### Scenario: Import external source via API

- **WHEN** a user with `external-sources:write` scope sends POST /api/external-sources/import with a URL
- **THEN** the system SHALL:
  - Detect the appropriate provider
  - Check for existing source (deduplication)
  - Validate accessibility
  - Queue or process the import
- **AND** the system SHALL return import status with source ID and document ID

#### Scenario: List external sources

- **WHEN** a user sends GET /api/external-sources
- **THEN** the system SHALL return paginated list of external sources for the project
- **AND** the system SHALL support filtering by:
  - Provider type
  - Sync status
  - Error status
- **AND** the system SHALL include sync state information

#### Scenario: Get external source details

- **WHEN** a user sends GET /api/external-sources/:id
- **THEN** the system SHALL return full source details including:
  - Source metadata
  - Sync history
  - Error history
  - Linked documents

#### Scenario: Trigger manual sync

- **WHEN** a user sends POST /api/external-sources/:id/sync
- **THEN** the system SHALL queue a sync job for the source
- **AND** the system SHALL return job status
- **AND** the system SHALL check for content changes before creating new document

#### Scenario: Delete external source

- **WHEN** a user sends DELETE /api/external-sources/:id
- **THEN** the system SHALL mark the source as disabled
- **AND** the system SHALL NOT delete linked documents
- **AND** the system SHALL stop all sync operations for the source

### Requirement: Webhook-Triggered Sync

The system SHALL support webhook endpoints for receiving change notifications from external systems.

#### Scenario: Receive webhook notification

- **WHEN** an external system sends a POST to /api/external-sources/webhook/:provider
- **THEN** the system SHALL validate the webhook signature (provider-specific)
- **AND** the system SHALL parse the payload to identify affected sources
- **AND** the system SHALL queue sync jobs for affected sources

#### Scenario: Invalid webhook signature

- **WHEN** a webhook request has an invalid or missing signature
- **THEN** the system SHALL return 401 Unauthorized
- **AND** the system SHALL NOT process the webhook
- **AND** the system SHALL log the security event

### Requirement: Sync Worker and Scheduling

The system SHALL provide a background worker for processing sync jobs with retry logic.

#### Scenario: Process periodic sync

- **WHEN** an external source has sync_policy 'periodic' and sync interval has elapsed
- **THEN** the sync worker SHALL:
  - Check for updates using provider's change detection
  - Fetch new content if changed
  - Create new document version
  - Update sync state
- **AND** the worker SHALL update last_checked_at regardless of changes

#### Scenario: Retry failed sync with backoff

- **WHEN** a sync operation fails
- **THEN** the system SHALL increment the error count
- **AND** the system SHALL schedule a retry with exponential backoff:
  - Initial delay: 1 second
  - Max delay: 1 hour
  - Backoff multiplier: 2x
  - Max retries: 5
- **AND** the system SHALL record the error details

#### Scenario: Disable source after max failures

- **WHEN** a source exceeds the maximum retry count (5)
- **THEN** the system SHALL mark the source status as 'error'
- **AND** the system SHALL stop automatic sync attempts
- **AND** the system SHALL allow manual sync trigger to re-enable

#### Scenario: Process webhook-triggered sync

- **WHEN** a sync job is triggered by webhook
- **THEN** the worker SHALL process with high priority
- **AND** the worker SHALL skip change detection (webhook implies change)
- **AND** the worker SHALL fetch and ingest new content

### Requirement: Rate Limiting Per Provider

The system SHALL implement rate limiting for external API calls on a per-provider basis.

#### Scenario: Respect provider rate limits

- **WHEN** making requests to an external provider API
- **THEN** the system SHALL track request counts per provider
- **AND** the system SHALL delay requests that would exceed limits
- **AND** the system SHALL use provider-specific rate configurations

#### Scenario: Handle rate limit response

- **WHEN** an external API returns a rate limit error (429)
- **THEN** the system SHALL parse retry-after header if present
- **AND** the system SHALL implement backoff for subsequent requests
- **AND** the system SHALL NOT fail the job immediately (queue for retry)

### Requirement: Error Tracking and Recovery

The system SHALL track errors per external source and provide recovery mechanisms.

#### Scenario: Record sync error

- **WHEN** a sync operation fails
- **THEN** the system SHALL update the source with:
  - Incremented error_count
  - last_error message
  - last_error_at timestamp
- **AND** the system SHALL emit an error event for monitoring

#### Scenario: Clear error state on success

- **WHEN** a sync operation succeeds after previous failures
- **THEN** the system SHALL reset error_count to 0
- **AND** the system SHALL clear last_error
- **AND** the system SHALL set status back to 'active'

#### Scenario: Query sources with errors

- **WHEN** an admin queries GET /api/external-sources?status=error
- **THEN** the system SHALL return all sources in error state
- **AND** the system SHALL include error details and history
- **AND** the system SHALL provide actions for recovery

