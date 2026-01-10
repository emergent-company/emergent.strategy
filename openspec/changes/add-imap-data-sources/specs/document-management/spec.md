## ADDED Requirements

### Requirement: Document Source Type as String

The system SHALL store document source type as a plain string to support extensible source types without schema changes.

#### Scenario: Default source type for uploads

- **WHEN** a document is created via file upload (POST /ingest/upload)
- **THEN** the document SHALL have `source_type` set to `'upload'`
- **AND** the `integration_id` field SHALL be null

#### Scenario: Email source type for IMAP imports

- **WHEN** a document is created from an IMAP email import
- **THEN** the document SHALL have `source_type` set to `'email'`
- **AND** the `integration_id` field SHALL reference the IMAP integration

#### Scenario: Custom source types from plugins

- **WHEN** a plugin registers a new source type (e.g., `'slack_message'`)
- **THEN** documents created by that plugin SHALL have the registered `source_type` string
- **AND** no database schema changes SHALL be required

#### Scenario: Query documents by source type

- **WHEN** a user queries documents with `source_type` filter
- **THEN** the system SHALL return only documents matching the specified source type string
- **AND** the filter SHALL support multiple values (e.g., `source_type=upload,email`)

### Requirement: Document Integration Reference

The system SHALL link documents to their source integration for tracking and display purposes.

#### Scenario: Integration reference for imported documents

- **WHEN** a document is created by an integration (IMAP, future providers)
- **THEN** the document SHALL have `integration_id` set to the integration's UUID
- **AND** the integration `name` SHALL be queryable for display in tables

#### Scenario: Display integration source in document list

- **WHEN** a user views documents with `source_type` other than `'upload'`
- **THEN** each document row SHALL display a "Source" column
- **AND** the Source column SHALL show the integration's user-defined name (e.g., "Work Gmail")

#### Scenario: Filter documents by integration

- **WHEN** a user queries documents with `integration_id` filter
- **THEN** the system SHALL return only documents from that specific integration
- **AND** this enables viewing emails from a single IMAP connection

### Requirement: Document Parent-Child Hierarchy

The system SHALL support hierarchical relationships between documents where one document can be a parent of another.

#### Scenario: Create child document from email attachment

- **WHEN** an email with attachments is imported via IMAP
- **THEN** each attachment SHALL be created as a separate document
- **AND** each attachment document SHALL have `parent_document_id` set to the email document ID
- **AND** the parent email document SHALL be created first

#### Scenario: Child documents inherit source type

- **WHEN** a child document is created from a parent
- **THEN** the child document SHALL have the same `source_type` as the parent
- **AND** the child document SHALL have the same `integration_id` as the parent

#### Scenario: Query child documents

- **WHEN** a user queries documents with `parent_document_id` filter
- **THEN** the system SHALL return only documents that are children of the specified parent

#### Scenario: Query root documents only

- **WHEN** a user queries documents with `root_only=true` filter
- **THEN** the system SHALL return only documents where `parent_document_id` is null
- **AND** child documents (attachments) SHALL be excluded from the response

#### Scenario: Display document hierarchy in list

- **WHEN** a user views documents with child documents
- **THEN** parent documents SHALL display a count of child documents
- **AND** users SHALL be able to expand/collapse to view children inline

#### Scenario: Cascade delete with children

- **WHEN** a user deletes a parent document
- **THEN** all child documents SHALL also be deleted
- **AND** the deletion impact analysis SHALL include child document counts

### Requirement: Expandable Chunks View in Documents Table

The system SHALL allow users to view document chunks inline within source type tables without navigating to a separate page.

#### Scenario: Expand document row to show chunks

- **WHEN** a user clicks the expand button on a document row
- **THEN** the row SHALL expand to reveal a nested chunks list below
- **AND** the chunks SHALL be lazy-loaded on first expansion
- **AND** the chunks list SHALL display chunk index, preview text, and embedding status

#### Scenario: Chunk list pagination within expanded row

- **WHEN** a document has more than 10 chunks
- **THEN** the expanded chunks view SHALL display pagination controls
- **AND** users SHALL be able to navigate through chunks without collapsing the row

#### Scenario: Collapse expanded document row

- **WHEN** a user clicks the expand button on an already-expanded document row
- **THEN** the row SHALL collapse and hide the chunks list
- **AND** the previously loaded chunks SHALL be cached for quick re-expansion

#### Scenario: Multiple expanded rows

- **WHEN** a user expands multiple document rows simultaneously
- **THEN** all expanded rows SHALL remain expanded
- **AND** each row SHALL independently manage its chunk loading and pagination

### Requirement: Source Type Plugin Registration

The system SHALL support registration of source type plugins that define display and behavior for document types.

#### Scenario: Built-in upload plugin

- **WHEN** the system starts
- **THEN** the `'upload'` source type plugin SHALL be registered
- **AND** the plugin SHALL define display name "Documents" and icon "lucide--file-text"
- **AND** the plugin SHALL define table columns: Name, Size, Uploaded

#### Scenario: Built-in email plugin

- **WHEN** the system starts
- **THEN** the `'email'` source type plugin SHALL be registered
- **AND** the plugin SHALL define display name "Emails" and icon "lucide--mail"
- **AND** the plugin SHALL define table columns: Subject, From, Date, Source

#### Scenario: Plugin provides table columns

- **WHEN** a user views the Data Sources page for a source type
- **THEN** the table SHALL display columns defined by that source type's plugin
- **AND** the columns SHALL map to document fields or integration_metadata paths

#### Scenario: Plugin provides default sort

- **WHEN** a user first views a source type table
- **THEN** the table SHALL be sorted according to the plugin's default sort configuration
- **AND** the user SHALL be able to override sorting interactively
