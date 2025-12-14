## ADDED Requirements

### Requirement: Vertex AI Batch Extraction Test Script

The system SHALL provide a test script `scripts/extraction_tests/test-vertex-batch-extraction.ts` that evaluates Vertex AI batch processing for document extraction.

The script SHALL:

- Accept a document path or content as input
- Prepare extraction prompts in JSONL format for Vertex AI Batch API
- Upload input to Google Cloud Storage
- Submit batch prediction jobs to Vertex AI
- Poll for job completion
- Download and parse structured extraction results
- Output extracted entities and relationships

#### Scenario: Single document extraction via batch API

- **GIVEN** a test document (e.g., `test-data/bible/genesis-1-esv.md`)
- **WHEN** the user runs `npx tsx scripts/extraction_tests/test-vertex-batch-extraction.ts`
- **THEN** the script uploads a JSONL input file to GCS
- **AND** submits a batch prediction job to Vertex AI
- **AND** polls until job completion
- **AND** outputs the extracted entities and relationships to console

#### Scenario: Structured output with responseSchema

- **GIVEN** a batch job request with `responseSchema` configuration
- **WHEN** the batch job completes
- **THEN** the output SHALL be valid JSON matching the entity/relationship schema
- **AND** entities SHALL have name, type, and optional description fields
- **AND** relationships SHALL have source_ref, target_ref, and type fields

### Requirement: GCS Integration for Batch Jobs

The script SHALL use Google Cloud Storage for batch job input/output.

The script SHALL:

- Upload JSONL input to a configurable GCS bucket path
- Download JSONL output from GCS after job completion
- Use the existing service account credentials (`spec-server-dev-vertex-ai.json`)

#### Scenario: GCS upload and download

- **GIVEN** valid GCS credentials and bucket access
- **WHEN** the script prepares a batch job
- **THEN** the input JSONL SHALL be uploaded to `gs://{bucket}/input/{job_id}.jsonl`
- **AND** output SHALL be read from `gs://{bucket}/output/{job_id}/`

### Requirement: Batch Job Lifecycle Management

The script SHALL manage the full batch job lifecycle via Vertex AI REST API.

#### Scenario: Job submission and polling

- **GIVEN** a valid JSONL input file in GCS
- **WHEN** the script submits a batch prediction job
- **THEN** it SHALL receive a job name/ID for tracking
- **AND** it SHALL poll the job status until state is SUCCEEDED or FAILED
- **AND** it SHALL report the final status and any errors
