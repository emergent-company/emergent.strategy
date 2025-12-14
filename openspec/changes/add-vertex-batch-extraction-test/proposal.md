# Change: Add Vertex AI Batch Extraction Test Script

## Why

The current LangGraph extraction pipeline processes documents chunk-by-chunk with sequential/batched LLM calls, which has rate limits and can cause token overflow issues for large documents. Vertex AI's batch inference API offers:

- **50% cost reduction** compared to real-time inference
- **Higher rate limits** (up to 200,000 requests per batch job)
- **24-hour turnaround** with automatic retry handling
- **Ability to process entire documents** in a single request (leveraging Gemini's 1M+ token context window)

This test script will explore whether batch processing can extract entities and relationships from whole documents (or multiple documents) at once, avoiding the complexity of chunking and chunk-entity correlation.

## What Changes

- Add a new test script `scripts/extraction_tests/test-vertex-batch-extraction.ts` that:

  - Prepares document content as batch inference input (JSONL format)
  - Uploads input to Cloud Storage
  - Submits batch job to Vertex AI
  - Polls for completion
  - Downloads and parses results
  - Compares output quality with current per-batch extraction

- Add supporting utilities for:
  - GCS file upload/download
  - Batch job management (create, poll, get results)
  - Result parsing and validation

## Impact

- **Affected specs**: None (new tooling capability)
- **Affected code**: `scripts/extraction_tests/` (new files only)
- **Dependencies**:
  - `@google-cloud/aiplatform` or REST API
  - `@google-cloud/storage` for GCS operations
  - Existing Vertex AI service account credentials

## Scope

This is a **test/research script** to evaluate batch extraction viability. It does NOT:

- Modify the production extraction pipeline
- Change any existing specs
- Affect the server application code

If successful, findings from this script would inform a future proposal to integrate batch processing into the production extraction workflow.
