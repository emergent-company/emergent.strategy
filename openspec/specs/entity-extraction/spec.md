# entity-extraction Specification

## Purpose
TBD - created by archiving change optimize-extraction-batch-calls. Update Purpose after archive.
## Requirements
### Requirement: Semantic Document Chunking

The system SHALL use semantic analysis to segment documents into coherent chunks based on topic shifts, rather than fixed token counts.

#### Scenario: Chunking based on semantic similarity

- **WHEN** processing a document for extraction
- **THEN** the system generates embeddings for sequential sentences (e.g. using `text-embedding-004`)
- **AND** calculates cosine similarity between adjacent sentences
- **AND** creates a new chunk ONLY when similarity drops below a configurable threshold (indicating a topic shift)
- **AND** ensures chunks do not exceed the model's context window (splitting by max tokens only as a fallback)

#### Scenario: Chunk metadata preservation

- **WHEN** creating semantic chunks
- **THEN** each chunk retains metadata including `start_char`, `end_char`, and `source_text`
- **AND** tracks the original page numbers (if available) spanned by the chunk

### Requirement: Consolidated Zod Schema

The system SHALL define extraction schemas using Zod that encompass all target entity types in a single structure, enabling single-pass extraction.

#### Scenario: Unified schema construction

- **WHEN** preparing extraction for $N$ entity types
- **THEN** the system constructs a single `z.object` schema
- **AND** the schema includes top-level keys for each entity type (e.g., `people`, `dates`, `liabilities`)
- **AND** each key maps to a `z.array` of that specific entity's schema
- **AND** strict typing is enforced (enums, dates, numbers) to leverage LLM structured output capabilities

### Requirement: Map-Reduce Extraction Architecture

The system SHALL utilize a Map-Reduce pattern orchestrated via LangGraph to process chunks in parallel and aggregate results.

#### Scenario: Parallel "Map" processing

- **WHEN** processing a document with multiple chunks
- **THEN** the system spawns parallel extraction tasks ("Map" step) for each chunk
- **AND** each task runs independently using the Unified Zod Schema
- **AND** failures in one chunk do not stop the processing of others

#### Scenario: Aggregation "Reduce" step

- **WHEN** all chunks have been processed
- **THEN** the system collects the lists of extracted entities from all successful chunks
- **AND** merges them into a single master list
- **AND** performs deduplication based on entity identity (e.g., name + type)

### Requirement: Validation & Reflexion (Self-Correction)

The system SHALL automatically attempt to correct schema validation errors using a "Reflexion" loop.

#### Scenario: Validation failure handling

- **WHEN** an LLM response fails Zod validation (e.g., string instead of number)
- **THEN** the system captures the validation error
- **AND** feeds the error + original response back to the LLM ("Reflexion" step)
- **AND** requests a corrected JSON output
- **AND** retries up to a maximum limit (e.g., 3 attempts) before marking the chunk as failed

### Requirement: Tiered Model Strategy

The system SHALL use **Gemini 2.5 Flash** for the bulk extraction tasks to ensure high throughput and cost efficiency.

#### Scenario: Extraction model selection

- **WHEN** performing the "Map" step (chunk extraction)
- **THEN** the system utilizes **Gemini 2.5 Flash**
- **AND** utilizes the model's native "Structured Output" / "Tool Calling" mode

### Requirement: Extraction Logging

The system SHALL log the performance and cost metrics of the new architecture.

#### Scenario: Semantic chunking logging

- **WHEN** chunking a document
- **THEN** logs the number of chunks generated vs. the number of tokens
- **AND** logs the average semantic similarity score

#### Scenario: Batch performance logging

- **WHEN** completing a job
- **THEN** logs the reduction in API calls compared to the legacy baseline (Types × Chunks)
- **AND** logs the total cost saved

