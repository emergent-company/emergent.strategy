# Spec: Training Data Export

## ADDED Requirements

### Requirement: Export Verified Extractions as Training Data

The system SHALL provide a service to export human-verified and high-confidence extractions as JSONL training data compatible with Vertex AI Gemini supervised fine-tuning.

#### Scenario: Export training data for a project

**Given** a project with verified graph objects (status='accepted' AND (reviewed_by IS NOT NULL OR extraction_confidence >= 0.85))
**When** the user requests a training data export with project ID and options
**Then** the system queries all eligible graph objects and their relationships
**And** reconstructs the source chunk for each extraction job
**And** builds training examples in Vertex AI JSONL format
**And** writes train.jsonl and validation.jsonl files
**And** returns export statistics including example counts and type distributions

#### Scenario: No eligible training data

**Given** a project with no verified extractions
**When** the user requests a training data export
**Then** the system returns an empty result with zero examples
**And** logs a warning that no eligible data was found

---

### Requirement: Vertex AI JSONL Format

Each training example SHALL conform to the Vertex AI supervised fine-tuning format with systemInstruction, user content (document chunk), and model content (verified extraction JSON).

#### Scenario: Build a training example

**Given** a source document chunk with text content
**And** verified entities extracted from that chunk
**And** relationships between those entities
**When** the system builds a training example
**Then** the output contains systemInstruction with extraction guidelines
**And** the output contains user role with the chunk text and available entity types
**And** the output contains model role with JSON containing entities and relationships arrays
**And** the output is valid JSON that can be serialized to a single JSONL line

---

### Requirement: Training Data Filtering

The export service SHALL support filtering options including minimum confidence threshold, require human review flag, entity type filter, and maximum example limit.

#### Scenario: Filter by minimum confidence

**Given** extractions with confidence scores of 0.7, 0.85, and 0.95
**And** minimum confidence threshold of 0.85
**When** the export runs
**Then** only extractions with confidence >= 0.85 are included
**And** the 0.7 confidence extraction is excluded

#### Scenario: Filter to human-reviewed only

**Given** extractions where some have reviewed_by set and others do not
**And** requireHumanReview option is true
**When** the export runs
**Then** only extractions with reviewed_by IS NOT NULL are included

---

### Requirement: Train Validation Split

The export service SHALL split examples into training and validation sets with a configurable ratio (default 80/20) and optional shuffle seed for reproducibility.

#### Scenario: Split with default ratio

**Given** 100 eligible training examples
**And** no custom split ratio specified
**When** the export runs
**Then** train.jsonl contains approximately 80 examples
**And** validation.jsonl contains approximately 20 examples

#### Scenario: Reproducible split with seed

**Given** 100 eligible training examples
**And** shuffle seed of 42
**When** the export runs twice with the same seed
**Then** both exports produce identical train/validation splits

---

### Requirement: Training Example Validation

Each training example SHALL be validated before inclusion: non-empty chunk, at least one entity, valid relationship references, token count under limit, and no PII detected.

#### Scenario: Exclude example with empty chunk

**Given** an extraction job with an empty source chunk
**When** the system attempts to build a training example
**Then** the example is excluded
**And** the exclusion reason "empty_chunk" is recorded in statistics

#### Scenario: Exclude example exceeding token limit

**Given** an extraction with a very long chunk exceeding 32,000 tokens
**When** the system validates the training example
**Then** the example is excluded or truncated
**And** a warning is logged

---

### Requirement: Cloud Storage Upload

The export service SHALL support uploading training data to Google Cloud Storage with configurable bucket and path prefix.

#### Scenario: Upload to GCS

**Given** exported training data in a local directory
**And** a GCS bucket name and path prefix
**When** the user requests upload to GCS
**Then** train.jsonl is uploaded to gs://bucket/prefix/train.jsonl
**And** validation.jsonl is uploaded to gs://bucket/prefix/validation.jsonl
**And** metadata.json is uploaded to gs://bucket/prefix/metadata.json
**And** the full GCS URIs are returned

---

### Requirement: CLI Export Command

The system SHALL provide a CLI command to export training data with options for project ID, output path, confidence threshold, and split ratio.

#### Scenario: Run CLI export

**Given** the server application is configured
**When** the user runs `nx run server:export-training-data --project-id=<uuid> --output=./training-data`
**Then** training data is exported to the specified directory
**And** statistics are printed to stdout

---

### Requirement: REST API Endpoints

The system SHALL provide REST API endpoints for getting export statistics and triggering exports.

#### Scenario: Get export statistics

**Given** a project with verified extractions
**When** the user calls GET /training-export/stats/:projectId
**Then** the response includes eligibleExamples count
**And** humanReviewed count
**And** autoAccepted count
**And** list of entity types

#### Scenario: Trigger export via API

**Given** valid export options in request body
**When** the user calls POST /training-export/export
**Then** the export runs and returns TrainingDataExportResult
**And** the response includes output file paths and statistics
