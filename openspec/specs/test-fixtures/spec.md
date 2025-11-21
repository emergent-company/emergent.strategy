# test-fixtures Specification

## Purpose
TBD - created by archiving change add-bible-test-dataset. Update Purpose after archive.
## Requirements
### Requirement: Bible Test Dataset Seeding

The system SHALL provide a reusable script to seed a comprehensive Bible test dataset via the ingestion API for testing search, extraction, and graph capabilities.

#### Scenario: Upload Bible documents from local files

- **WHEN** a developer runs `npm run seed:bible -- --project-id=<uuid>`
- **THEN** the script:
  - Reads all 66 Bible book markdown files from `test-data/bible/books/`
  - Uploads each file as a separate document via POST /ingest/upload
  - Displays progress for each upload (e.g., "Uploading Genesis (1/66)...")
  - Does NOT trigger extraction jobs (extraction configured manually via interface)
  - Reports summary: total uploaded, succeeded, failed

#### Scenario: Upload with custom API URL

- **WHEN** a developer sets BIBLE_SEED_API_URL environment variable and runs the script
- **THEN** the script uploads to the specified API endpoint instead of default localhost:3000

#### Scenario: Dry run mode

- **WHEN** a developer runs `npm run seed:bible -- --project-id=<uuid> --dry-run`
- **THEN** the script:
  - Validates configuration (API URL, credentials, project ID)
  - Lists all files that would be uploaded
  - Reports estimated upload count (66 files) and total size
  - Does not perform actual uploads

#### Scenario: Rate limiting

- **WHEN** the script uploads multiple documents
- **THEN** the script:
  - Waits for configurable delay between uploads (default: 100ms, via BIBLE_SEED_RATE_LIMIT_MS)
  - Prevents overwhelming the API server
  - Allows zero delay for fastest uploads (set BIBLE_SEED_RATE_LIMIT_MS=0)

#### Scenario: Upload failure handling

- **WHEN** an individual document upload fails (network error, 4xx/5xx response)
- **THEN** the script:
  - Logs the error with document name and reason
  - Continues uploading remaining documents
  - Reports failed documents in final summary
  - Exits with non-zero code if any uploads failed

#### Scenario: Authentication failure

- **WHEN** the script runs without valid BIBLE_SEED_ACCESS_TOKEN environment variable
- **THEN** the script:
  - Returns error "Missing required environment variable: BIBLE_SEED_ACCESS_TOKEN"
  - Exits with code 1
  - Does not attempt any uploads

#### Scenario: Missing project ID

- **WHEN** the script runs without --project-id argument
- **THEN** the script:
  - Returns error "Missing required argument: --project-id"
  - Displays usage instructions
  - Exits with code 1

#### Scenario: Progress tracking

- **WHEN** the script uploads multiple documents
- **THEN** the script:
  - Displays current progress (e.g., "Uploading Matthew (40/66)...")
  - Shows document name being uploaded
  - Displays success/failure status for each upload
  - Shows elapsed time and estimated time remaining (optional)

### Requirement: Bible Template Pack Configuration

The system SHALL provide a Bible-specific template pack with entity types and relationships optimized for biblical text extraction, installable separately from document upload.

#### Scenario: Template pack installation

- **WHEN** a developer runs the Bible template pack seed script
- **THEN** the system:
  - Creates a template pack named "Bible Knowledge Graph" with version "1.0.0"
  - Defines entity types: Person, Place, Event, Book, Quote
  - Defines relationship types: APPEARS_IN, LOCATED_IN, PARENT_OF, CHILD_OF, BORN_IN, DIED_IN, TRAVELS_TO, OCCURS_IN, PARTICIPATES_IN
  - Configures extraction prompts for biblical content
  - Makes template pack available for manual selection in the interface

#### Scenario: Person entity extraction

- **WHEN** extraction runs on a Bible document with the template pack
- **THEN** the system extracts Person entities with properties:
  - name (required): Full name
  - role: Position or title (e.g., "prophet", "king", "apostle")
  - tribe: Israelite tribe affiliation
  - birth_location: Place of birth
  - death_location: Place of death

#### Scenario: Place entity extraction

- **WHEN** extraction runs on a Bible document with the template pack
- **THEN** the system extracts Place entities with properties:
  - name (required): Location name
  - region: Geographic region
  - country: Modern or ancient country
  - alternate_names: Other names for the location

#### Scenario: Event entity extraction

- **WHEN** extraction runs on a Bible document with the template pack
- **THEN** the system extracts Event entities with properties:
  - name (required): Event name
  - date_description: Textual description of when it occurred
  - location: Where the event happened
  - participants: People involved

#### Scenario: Relationship extraction between entities

- **WHEN** extraction identifies relationships in the text
- **THEN** the system creates graph relationships:
  - APPEARS_IN: Links Person/Place/Event to Book entities
  - PARENT_OF / CHILD_OF: Family relationships between Persons
  - BORN_IN / DIED_IN: Links Person to Place for life events
  - TRAVELS_TO: Links Person to Place for journeys
  - OCCURS_IN: Links Event to Place
  - PARTICIPATES_IN: Links Person to Event

### Requirement: Test Dataset Documentation

The system SHALL provide comprehensive documentation for using the Bible test dataset.

#### Scenario: Developer reads documentation

- **WHEN** a developer opens `docs/testing/bible-dataset.md`
- **THEN** the documentation includes:
  - Purpose and benefits of the Bible dataset
  - Installation instructions (running seed script with required arguments)
  - Environment variable configuration
  - Manual extraction setup steps (template pack selection in interface)
  - Example search queries to validate functionality
  - Expected extraction results (sample entities)
  - Troubleshooting common issues
  - Attribution to mdbible source repository

#### Scenario: Test data attribution

- **WHEN** a developer opens `test-data/bible/README.md`
- **THEN** the documentation includes:
  - Source repository attribution (https://github.com/lguenth/mdbible)
  - Bible version (ESV - English Standard Version)
  - File structure explanation (verse numbering format)
  - Usage instructions referencing main documentation

