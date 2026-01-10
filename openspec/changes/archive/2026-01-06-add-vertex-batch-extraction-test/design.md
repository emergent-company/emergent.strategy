## Context

The current extraction pipeline processes documents chunk-by-chunk, which introduces complexity around:

- Chunk boundary management
- Entity correlation across chunks
- Rate limiting with many parallel LLM calls

Vertex AI Batch API offers a fundamentally different approach:

- Process entire documents in single requests (Gemini 1M+ context)
- Submit jobs asynchronously with 24-hour turnaround
- 50% cost reduction vs real-time inference
- Up to 200,000 requests per batch job

This design document covers the test script that will evaluate batch extraction viability.

## Goals / Non-Goals

**Goals:**

- Create a standalone test script to evaluate Vertex AI batch extraction
- Process whole documents without chunking
- Compare extraction quality with current LangGraph pipeline
- Measure cost and timing differences

**Non-Goals:**

- Modify the production extraction pipeline
- Build production-ready batch infrastructure
- Implement real-time status webhooks (polling is fine for testing)

## Technical Approach

### Input Format (JSONL)

Vertex AI Batch API requires JSONL input in Cloud Storage:

```jsonl
{"request":{"contents":[{"role":"user","parts":[{"text":"Extract entities from: <document_content>"}]}],"generationConfig":{"responseMimeType":"application/json","responseSchema":{...}}}}
{"request":{"contents":[{"role":"user","parts":[{"text":"Extract entities from: <document_content_2>"}]}],"generationConfig":{"responseMimeType":"application/json","responseSchema":{...}}}}
```

Each line is an independent request. We can include:

- Entity extraction prompts (document content + extraction instructions)
- Relationship building prompts (entities + relationship instructions)

### Structured Output in Batch Mode

Gemini batch API supports `responseSchema` for structured JSON output. We'll use the same schemas as current extraction:

```typescript
const entitySchema = {
  type: 'object',
  properties: {
    entities: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          type: { type: 'string' },
          description: { type: 'string' },
        },
        required: ['name', 'type'],
      },
    },
  },
  required: ['entities'],
};
```

### GCS Setup

Required buckets/paths:

- `gs://emergent-batch-extraction/input/` - JSONL input files
- `gs://emergent-batch-extraction/output/` - Batch job results

The test script will:

1. Create input JSONL from test documents
2. Upload to GCS input path
3. Submit batch job
4. Poll for completion
5. Download and parse results from output path

### Batch Job Lifecycle

```
1. Prepare Input
   ├── Load document(s) from test data
   ├── Build extraction prompt with responseSchema
   └── Write JSONL to local file

2. Upload to GCS
   └── Upload JSONL to gs://emergent-batch-extraction/input/{job_id}.jsonl

3. Submit Batch Job
   ├── POST to Vertex AI Batch Prediction API
   ├── Specify input/output GCS paths
   └── Get job name for polling

4. Poll for Completion
   ├── GET job status every 30 seconds
   └── Wait for state: SUCCEEDED | FAILED

5. Get Results
   ├── Download output from GCS
   ├── Parse JSONL response lines
   └── Extract entities/relationships from each response
```

### API Endpoints

**Submit Batch Job:**

```
POST https://{REGION}-aiplatform.googleapis.com/v1/projects/{PROJECT}/locations/{REGION}/batchPredictionJobs

{
  "displayName": "extraction-batch-{timestamp}",
  "model": "publishers/google/models/gemini-2.5-flash",
  "inputConfig": {
    "instancesFormat": "jsonl",
    "gcsSource": {
      "uris": ["gs://emergent-batch-extraction/input/{job_id}.jsonl"]
    }
  },
  "outputConfig": {
    "predictionsFormat": "jsonl",
    "gcsDestination": {
      "outputUriPrefix": "gs://emergent-batch-extraction/output/{job_id}"
    }
  }
}
```

**Poll Job Status:**

```
GET https://{REGION}-aiplatform.googleapis.com/v1/{jobName}
```

### Two-Pass Extraction Strategy

For comprehensive extraction:

**Pass 1: Entity Extraction**

- Input: Full document content
- Output: List of entities with names, types, descriptions

**Pass 2: Relationship Building**

- Input: Document content + extracted entities
- Output: Relationships referencing entity names

Both passes can be batched together:

```jsonl
{"request":{...entity extraction request for doc1...}}
{"request":{...relationship request for doc1 (after entity extraction)...}}
```

Or run sequentially (entities first, then relationships with entity context).

### Comparison Methodology

Test against the same documents used for LangGraph testing:

- `test-data/bible/genesis-1-esv.md` (medium document)
- Large documents from `kb.documents` table

Compare:

1. **Entity Count**: Total entities extracted
2. **Entity Quality**: Name accuracy, type correctness
3. **Relationship Count**: Total relationships
4. **Relationship Quality**: Valid source/target refs, meaningful types
5. **Cost**: Input/output tokens \* batch pricing
6. **Timing**: Total job time (excluding 24h queue)

## Decisions

### Decision: Use REST API directly (not SDK)

- **Why**: More control over batch job configuration
- **Alternative**: `@google-cloud/aiplatform` SDK - less documented for batch
- **Rationale**: REST API is well-documented for batch prediction jobs

### Decision: Single bucket for input/output

- **Why**: Simpler permissions management
- **Alternative**: Separate buckets - unnecessary for testing
- **Rationale**: Use path prefixes (`input/`, `output/`) for organization

### Decision: Poll-based status checking

- **Why**: Simple, reliable for testing
- **Alternative**: Webhooks - adds complexity, not needed for manual tests
- **Rationale**: 30-second polling interval is sufficient

## Risks / Trade-offs

| Risk                                     | Mitigation                                      |
| ---------------------------------------- | ----------------------------------------------- |
| 24-hour turnaround too slow              | Accept for testing; measure actual time         |
| GCS permissions issues                   | Use existing service account with Storage Admin |
| Structured output not supported in batch | Test with schema; fall back to text parsing     |
| Large documents exceed context           | Gemini 2.5 has 1M tokens; test with 500K max    |

## Dependencies

**Required:**

- `@google-cloud/storage` - GCS operations
- `google-auth-library` - Auth for REST API calls
- Existing service account: `spec-server-dev-vertex-ai.json`

**GCS Bucket:**

- Need to create: `gs://emergent-batch-extraction/`
- Alternative: Use existing bucket if available

## Open Questions

1. Does Vertex AI Batch API support `responseSchema` for structured output?
   - Need to test; documentation suggests yes for Gemini models
2. What's the actual turnaround time for small batch jobs?

   - Documentation says "up to 24 hours" but may be faster for small jobs

3. Should we test multi-document batches?
   - Start with single documents, expand to batch multiple docs together
