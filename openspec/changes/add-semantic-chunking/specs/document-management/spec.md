## ADDED Requirements

### Requirement: Semantic Chunking Strategies

The system SHALL support multiple chunking strategies for document ingestion, allowing users to preserve semantic boundaries (sentences, paragraphs) when splitting documents into chunks.

#### Scenario: Ingest document with sentence-preserving chunking

- **WHEN** a user uploads a document via POST /ingest/upload with `chunkingStrategy: 'sentence'`
- **THEN** the system:
  - Splits the document at sentence boundaries (`.`, `!`, `?` followed by whitespace)
  - Combines sentences into chunks up to the configured `maxChunkSize`
  - Never breaks a sentence mid-word unless the sentence itself exceeds `maxChunkSize`
  - Stores each chunk with metadata indicating `boundaryType: 'sentence'`
  - Returns the document ID and chunk count

#### Scenario: Ingest document with paragraph-preserving chunking

- **WHEN** a user uploads a document via POST /ingest/upload with `chunkingStrategy: 'paragraph'`
- **THEN** the system:
  - Splits the document at paragraph boundaries (`\n\n` or blank lines)
  - Detects markdown headers (`^#+\s`) as section boundaries
  - Combines paragraphs into chunks up to the configured `maxChunkSize`
  - Falls back to sentence-level splitting for paragraphs exceeding `maxChunkSize`
  - Stores each chunk with metadata indicating `boundaryType: 'paragraph'` or `'section'`
  - Returns the document ID and chunk count

#### Scenario: Ingest document with default character chunking

- **WHEN** a user uploads a document via POST /ingest/upload without specifying `chunkingStrategy`
- **THEN** the system:
  - Uses the existing character-based chunking (split at fixed 1200-character boundaries)
  - Maintains full backward compatibility with existing behavior
  - Does not store additional metadata for character-based chunks

#### Scenario: Ingest document with custom chunking options

- **WHEN** a user uploads a document with `chunkingOptions: { maxChunkSize: 2000, minChunkSize: 200 }`
- **THEN** the system:
  - Respects the custom `maxChunkSize` (2000 characters) instead of default (1200)
  - Skips combining additional sentences/paragraphs if chunk would be smaller than `minChunkSize`
  - Validates that `maxChunkSize` is between 100 and 10000
  - Validates that `minChunkSize` is between 10 and 1000

#### Scenario: Chunking options validation failure

- **WHEN** a user provides invalid chunking options (e.g., `maxChunkSize: 50000` or `minChunkSize: -10`)
- **THEN** the system:
  - Returns 400 Bad Request with validation error details
  - Does not create any chunks or document records
  - Includes field-level error messages in the response

### Requirement: Chunk Metadata Storage

The system SHALL store chunking metadata with each chunk to enable debugging, analytics, and potential re-processing.

#### Scenario: Chunk metadata includes strategy and offsets

- **WHEN** a document is chunked using any strategy other than `character`
- **THEN** each chunk record includes a `metadata` JSONB field containing:
  - `strategy`: The chunking strategy used (`sentence` or `paragraph`)
  - `startOffset`: Character offset in the original document where this chunk begins
  - `endOffset`: Character offset in the original document where this chunk ends
  - `boundaryType`: Type of boundary that ended this chunk (`sentence`, `paragraph`, `section`, or `character`)

#### Scenario: Query chunks with metadata

- **WHEN** a user fetches chunks via GET /chunks?documentId=:id
- **THEN** each chunk in the response includes the `metadata` field if present
- **AND** the `metadata` field is `null` for chunks created before this feature or with `character` strategy

### Requirement: URL Ingestion with Chunking Strategy

The system SHALL support chunking strategy selection for URL-based ingestion.

#### Scenario: Ingest URL with sentence chunking

- **WHEN** a user ingests a URL via POST /ingest/url with `chunkingStrategy: 'sentence'`
- **THEN** the system:
  - Fetches and extracts text from the URL
  - Applies sentence-preserving chunking to the extracted text
  - Stores chunks with appropriate metadata
  - Returns the document ID and chunk count

#### Scenario: Ingest URL with paragraph chunking

- **WHEN** a user ingests a URL via POST /ingest/url with `chunkingStrategy: 'paragraph'`
- **THEN** the system:
  - Fetches and extracts text from the URL
  - Applies paragraph-preserving chunking to the extracted text
  - Stores chunks with appropriate metadata
  - Returns the document ID and chunk count
