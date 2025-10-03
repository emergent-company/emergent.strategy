# Extraction Worker Quick Start Guide

This guide explains how to configure, deploy, and use the extraction worker system.

## Prerequisites

1. **Google Cloud Platform Account** with Vertex AI API enabled
2. **Service Account Key** with Vertex AI permissions
3. **PostgreSQL Database** with the `kb` schema initialized
4. **Template Pack** configured with extraction prompts

## Configuration

### Step 1: Set Environment Variables

Add these variables to your `.env` file:

```bash
# Vertex AI Configuration (REQUIRED)
VERTEX_AI_PROJECT_ID=your-gcp-project-id
VERTEX_AI_LOCATION=us-central1
VERTEX_AI_MODEL=gemini-1.5-pro

# Worker Settings
EXTRACTION_WORKER_ENABLED=true
EXTRACTION_WORKER_POLL_INTERVAL_MS=5000
EXTRACTION_WORKER_BATCH_SIZE=10

# Rate Limiting (Vertex AI Free Tier: 60 RPM, 32K TPM)
EXTRACTION_RATE_LIMIT_RPM=60
EXTRACTION_RATE_LIMIT_TPM=30000

# Entity Linking
EXTRACTION_ENTITY_LINKING_STRATEGY=always_new  # or key_match

# Confidence Thresholds
EXTRACTION_CONFIDENCE_THRESHOLD_MIN=0.0
EXTRACTION_CONFIDENCE_THRESHOLD_REVIEW=0.7
EXTRACTION_CONFIDENCE_THRESHOLD_AUTO_CREATE=0.85
```

### Step 2: Set Up Google Cloud Authentication

```bash
# Download service account key from GCP Console
# Set environment variable (or use Application Default Credentials)
export GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account-key.json
```

### Step 3: Verify Configuration

```bash
# Start the server
npm run start:dev

# Check logs for worker initialization
# You should see:
# [ExtractionWorkerService] Extraction worker starting (poll interval: 5000ms, batch size: 10)
# [VertexAIProvider] Vertex AI initialized: project=your-project, location=us-central1
```

## Creating Extraction Jobs

### Via API

```bash
# Create an extraction job
curl -X POST http://localhost:3000/api/extraction-jobs \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "project_id": "proj_123",
    "source_type": "DOCUMENT",
    "source_id": "doc_456",
    "allowed_types": ["Person", "Organization", "Location"]
  }'
```

### Via Code

```typescript
import { ExtractionJobService } from './modules/extraction-jobs/extraction-job.service';

// Inject the service
constructor(private readonly extractionJobService: ExtractionJobService) {}

// Create a job
const job = await this.extractionJobService.createJob({
  project_id: 'proj_123',
  source_type: ExtractionSourceType.DOCUMENT,
  source_id: 'doc_456',
  allowed_types: ['Person', 'Organization', 'Location'],
});

console.log(`Created job: ${job.job_id}`);
```

## Monitoring Jobs

### Check Job Status

```bash
# Get job details
curl http://localhost:3000/api/extraction-jobs/job_789 \
  -H "Authorization: Bearer YOUR_TOKEN"
```

Response:
```json
{
  "job_id": "job_789",
  "project_id": "proj_123",
  "status": "completed",
  "source_type": "DOCUMENT",
  "source_id": "doc_456",
  "extracted_entity_count": 15,
  "processed_entity_count": 12,
  "created_at": "2025-01-10T10:00:00Z",
  "completed_at": "2025-01-10T10:05:23Z",
  "extraction_metadata": {
    "discovered_types": ["Person", "Organization"],
    "usage": {
      "prompt_tokens": 1500,
      "completion_tokens": 800,
      "total_tokens": 2300
    }
  }
}
```

### List Jobs

```bash
# List all jobs for a project
curl "http://localhost:3000/api/extraction-jobs?project_id=proj_123&status=completed" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### View Statistics

```bash
# Get job statistics
curl "http://localhost:3000/api/extraction-jobs/stats?project_id=proj_123" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

Response:
```json
{
  "total_jobs": 42,
  "by_status": {
    "pending": 5,
    "running": 2,
    "completed": 30,
    "failed": 3,
    "cancelled": 2
  },
  "total_entities_extracted": 1250,
  "total_entities_created": 980,
  "average_processing_time_ms": 12500
}
```

## Understanding Entity Linking Strategies

### 1. Always New (`always_new`)
- **Behavior:** Always creates new objects, never checks for duplicates
- **Use Case:** Initial data ingestion, no deduplication needed
- **Performance:** Fastest (no lookups)

```env
EXTRACTION_ENTITY_LINKING_STRATEGY=always_new
```

### 2. Key Match (`key_match`)
- **Behavior:** Checks if object with same `business_key` exists before creating
- **Use Case:** Incremental updates, simple deduplication
- **Performance:** One database query per entity

```env
EXTRACTION_ENTITY_LINKING_STRATEGY=key_match
```

### 3. Vector Similarity (`vector_similarity`) [Future]
- **Behavior:** Uses semantic similarity to find matching objects
- **Use Case:** Fuzzy matching, variant names
- **Performance:** Requires vector search

### 4. User Review (`user_review`) [Future]
- **Behavior:** Queues low-confidence entities for manual review
- **Use Case:** High-quality data curation

## Understanding Confidence Thresholds

The worker uses three confidence thresholds to filter and route entities:

```
0.0 ──────── 0.7 ──────── 0.85 ──────── 1.0
 │            │            │            │
 │ Reject     │ Review     │ Auto-create │
```

- **Below MIN (0.0):** Entity is rejected, not created
- **Between REVIEW (0.7) and AUTO (0.85):** Entity is created but logged for manual review
- **Above AUTO_CREATE (0.85):** Entity is automatically created with high confidence

### Example Scenarios

```typescript
// Entity with confidence 0.5 (below MIN 0.7)
// → Rejected, not created

// Entity with confidence 0.75 (between REVIEW 0.7 and AUTO 0.85)
// → Created, but logged: "Entity 'John Smith' has confidence 0.75, needs review"

// Entity with confidence 0.9 (above AUTO 0.85)
// → Created automatically, no review needed
```

## Rate Limiting

The worker enforces two rate limits:

1. **Requests Per Minute (RPM):** Limits API calls to Vertex AI
2. **Tokens Per Minute (TPM):** Limits total tokens processed

### Default Limits (Vertex AI Free Tier)

```env
EXTRACTION_RATE_LIMIT_RPM=60      # 60 requests per minute
EXTRACTION_RATE_LIMIT_TPM=30000   # 30K tokens per minute
```

### Vertex AI Paid Tier Limits

```env
# Gemini 1.5 Pro (Paid)
EXTRACTION_RATE_LIMIT_RPM=360     # 360 requests per minute
EXTRACTION_RATE_LIMIT_TPM=120000  # 120K tokens per minute
```

### How Rate Limiting Works

1. Worker estimates tokens before calling LLM (~4 chars/token + 30% buffer)
2. `rateLimiter.waitForCapacity()` blocks until quota available
3. LLM processes request
4. `reportActualUsage()` adjusts buckets with actual token count
5. Buckets refill automatically proportional to elapsed time

If rate limit is hit, the worker logs:
```
[RateLimiterService] Rate limit exceeded: requests (remaining: 0/60, needed: 1)
[RateLimiterService] Waiting for rate limit capacity...
```

## Error Handling and Retries

### Automatic Retries

Failed jobs are automatically retried with exponential backoff:

| Retry | Delay |
|-------|-------|
| 1 | 2 minutes |
| 2 | 4 minutes |
| 3 | 8 minutes |

After 3 failed retries, the job is marked as `failed` and will not be retried automatically.

### Manual Retry

To manually retry a failed job:

```bash
curl -X POST http://localhost:3000/api/extraction-jobs/job_789/retry \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## Troubleshooting

### Worker Not Starting

**Symptom:** No logs from ExtractionWorkerService

**Causes:**
1. `EXTRACTION_WORKER_ENABLED=false` (default)
2. Database not online
3. No LLM provider configured

**Solutions:**
```bash
# Check configuration
echo $EXTRACTION_WORKER_ENABLED  # Should be 'true'
echo $VERTEX_AI_PROJECT_ID       # Should be set

# Check database
npm run db:status

# Check logs
npm run start:dev 2>&1 | grep "ExtractionWorkerService"
```

### Rate Limit Errors

**Symptom:** Jobs taking very long, logs show "Waiting for rate limit capacity"

**Causes:**
1. Rate limits too low for workload
2. Documents too large (high token count)

**Solutions:**
```bash
# Increase rate limits (if you have paid tier)
EXTRACTION_RATE_LIMIT_RPM=360
EXTRACTION_RATE_LIMIT_TPM=120000

# Reduce batch size to process fewer jobs concurrently
EXTRACTION_WORKER_BATCH_SIZE=5

# Increase poll interval to spread out load
EXTRACTION_WORKER_POLL_INTERVAL_MS=10000
```

### Vertex AI Authentication Errors

**Symptom:** "Vertex AI not configured" or "PERMISSION_DENIED"

**Causes:**
1. Service account key not set
2. Service account lacks permissions
3. Vertex AI API not enabled

**Solutions:**
```bash
# Set service account key
export GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json

# Verify service account has roles:
# - Vertex AI User (roles/aiplatform.user)
# - Service Account Token Creator (roles/iam.serviceAccountTokenCreator)

# Enable Vertex AI API
gcloud services enable aiplatform.googleapis.com
```

### No Entities Extracted

**Symptom:** Job completes but `extracted_entity_count=0`

**Causes:**
1. Extraction prompt not configured in template pack
2. Document content is empty
3. LLM response format incorrect

**Solutions:**
```bash
# Check template pack has extraction prompt
curl http://localhost:3000/api/template-packs/pack_123 \
  -H "Authorization: Bearer YOUR_TOKEN"
# Should have "extraction" section in prompts

# Check document content
curl http://localhost:3000/api/documents/doc_456 \
  -H "Authorization: Bearer YOUR_TOKEN"
# Should have non-empty "chunks" or "content"

# Check logs for parsing errors
npm run start:dev 2>&1 | grep "normalize"
```

### Entities Extracted But Not Created

**Symptom:** `extracted_entity_count > 0` but `processed_entity_count=0`

**Causes:**
1. All entities below confidence threshold
2. Entity linking failed
3. GraphService createObject() errors

**Solutions:**
```bash
# Lower confidence threshold
EXTRACTION_CONFIDENCE_THRESHOLD_MIN=0.0

# Check logs for confidence rejections
npm run start:dev 2>&1 | grep "confidence"

# Check logs for GraphService errors
npm run start:dev 2>&1 | grep "GraphService"
```

## Performance Tuning

### Optimal Settings for Different Workloads

#### High-Throughput (Batch Processing)
```env
EXTRACTION_WORKER_BATCH_SIZE=20
EXTRACTION_WORKER_POLL_INTERVAL_MS=1000
EXTRACTION_RATE_LIMIT_RPM=360
EXTRACTION_RATE_LIMIT_TPM=120000
```

#### Low-Latency (Interactive)
```env
EXTRACTION_WORKER_BATCH_SIZE=5
EXTRACTION_WORKER_POLL_INTERVAL_MS=2000
EXTRACTION_RATE_LIMIT_RPM=60
EXTRACTION_RATE_LIMIT_TPM=30000
```

#### Cost-Optimized (Free Tier)
```env
EXTRACTION_WORKER_BATCH_SIZE=5
EXTRACTION_WORKER_POLL_INTERVAL_MS=10000
EXTRACTION_RATE_LIMIT_RPM=60
EXTRACTION_RATE_LIMIT_TPM=30000
EXTRACTION_ENTITY_LINKING_STRATEGY=key_match
```

## Advanced Usage

### Custom LLM Providers (Future)

The system is designed to support multiple LLM providers:

```typescript
// Future: Add OpenAI provider
export class OpenAIProvider implements ILLMProvider {
  async extractEntities(content, prompt, allowedTypes) {
    // OpenAI API integration
  }
}

// Factory will automatically detect and use configured provider
```

### Programmatic Job Management

```typescript
// Cancel a running job
await extractionJobService.cancelJob('job_789');

// Delete a completed job
await extractionJobService.deleteJob('job_789');

// Get jobs by status
const runningJobs = await extractionJobService.listJobs({
  project_id: 'proj_123',
  status: 'running',
});
```

### Monitoring Metrics

```typescript
// Get worker status
const status = await rateLimiterService.getStatus();
console.log(status);
// {
//   requests: { current: 45, max: 60 },
//   tokens: { current: 25000, max: 30000 },
//   lastRefill: '2025-01-10T10:30:00Z'
// }
```

## Best Practices

1. **Start Small:** Test with a few documents before batch processing
2. **Monitor Costs:** Track token usage via job statistics
3. **Tune Thresholds:** Adjust confidence thresholds based on your data quality needs
4. **Use Key Matching:** Enable `key_match` strategy for incremental updates
5. **Review Logs:** Regularly check worker logs for errors and warnings
6. **Set Alerts:** Monitor for failed jobs and rate limit hits
7. **Batch Similar Jobs:** Group similar documents to improve LLM cache hit rates

## Next Steps

- [Phase 2 Completion Report](./26-extraction-worker-phase2-completion.md)
- [Implementation Plan](./26-extraction-worker-implementation-plan.md)
- [Phase 1 Documentation](./26-extraction-worker-phase1-documentation.md)
