## ADDED Requirements

### Requirement: Extraction E2E Test Coverage

The test suite SHALL include end-to-end test coverage for the extraction workflow that validates document upload, chunking, extraction job creation, and entity extraction completion.

#### Scenario: Upload and extract entities from document

- **GIVEN** a test document containing known Person, Organization, and Location entities
- **WHEN** the document is uploaded via the UI
- **THEN** the document SHALL be successfully ingested
- **AND** text chunks SHALL be created from the document
- **AND** an extraction modal SHALL be available with default settings
- **AND** extraction job SHALL be created when "Start Extraction" is clicked
- **AND** the extraction job SHALL complete successfully
- **AND** entities SHALL be extracted matching the demo pack classes (Person, Organization, Location)

#### Scenario: Verify chunks created from uploaded document

- **GIVEN** a document has been successfully uploaded
- **WHEN** viewing the chunks page filtered by document ID
- **THEN** multiple text chunks SHALL be visible
- **AND** each chunk SHALL display character count and creation timestamp
- **AND** chunk count SHALL match the document's chunk_count field

#### Scenario: Extraction modal default configuration

- **GIVEN** a document with completed ingestion
- **WHEN** clicking "Extract" from the document actions menu
- **THEN** an extraction modal SHALL open
- **AND** entity types SHALL be pre-selected (all types checked by default)
- **AND** confidence threshold SHALL default to 70%
- **AND** entity linking strategy SHALL default to "Fuzzy (Recommended)"
- **AND** duplicate handling SHALL default to "Skip (Default)"
- **AND** "Send Notification" SHALL be checked by default
- **AND** "Start Extraction" button SHALL be enabled when entity types are selected
