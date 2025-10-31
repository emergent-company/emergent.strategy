# Testing LangChain Extraction - Quick Guide

## Prerequisites

1. **Get Google Gemini API Key**
   - Visit: https://aistudio.google.com/app/apikey
   - Create new API key
   - Copy the key

2. **Set Environment Variables**
   ```bash
   # In your .env file or terminal
   export GOOGLE_API_KEY=<your-api-key>
   export EXTRACTION_WORKER_ENABLED=true
   export VERTEX_AI_MODEL=gemini-1.5-flash-latest  # Optional, this is default
   ```

## Quick Test

### 1. Start the Server
```bash
cd /Users/mcj/code/spec-server
npm run dev
```

**Expected Log:**
```
[ExtractionWorkerService] Extraction worker started (interval=5000ms, batch=5)
[LLMProviderFactory] Using LLM provider: LangChain-Gemini
[LangChainGeminiProvider] LangChain Gemini initialized: model=gemini-1.5-flash-latest
```

### 2. Upload a Test Document

**Via API:**
```bash
curl -X POST http://localhost:3000/ingest/upload \
  -H "Content-Type: application/json" \
  -d '{
    "org_id": "your-org-id",
    "project_id": "your-project-id",
    "content": "Requirements:\n1. The system must support user authentication using OAuth 2.0\n2. Response time should be under 200ms\n3. The system must handle 10,000 concurrent users",
    "filename": "requirements.txt",
    "mime_type": "text/plain"
  }'
```

**Expected Response:**
```json
{
  "documentId": "...",
  "chunks": 1,
  "extractionJobId": "...",
  "extractionJobStatus": "pending"
}
```

### 3. Check Extraction Job

```bash
curl http://localhost:3000/extraction-jobs/:jobId
```

**Expected Progression:**
- `pending` → Job in queue
- `running` → Worker processing
- `completed` → Extraction finished
- `failed` → Error occurred

### 4. Check Extracted Objects

```bash
curl http://localhost:3000/graph/objects?project_id=<project-id>&type=Requirement
```

**Expected Result:**
```json
{
  "objects": [
    {
      "id": "...",
      "type": "Requirement",
      "name": "User Authentication Support",
      "properties": {
        "description": "The system must support user authentication using OAuth 2.0",
        "priority": "high",
        "type": "functional"
      },
      "confidence": 0.92
    },
    {
      "id": "...",
      "type": "Requirement",
      "name": "Performance Requirement",
      "properties": {
        "description": "Response time should be under 200ms",
        "priority": "high",
        "type": "non-functional"
      },
      "confidence": 0.88
    }
  ]
}
```

### 5. Check Notification

```bash
curl http://localhost:3000/notifications?org_id=<org-id>
```

**Expected:**
```json
{
  "notifications": [
    {
      "id": "...",
      "type": "extraction_complete",
      "severity": "success",
      "title": "Object Extraction Complete",
      "message": "3 objects extracted from requirements.txt",
      "metadata": {
        "extraction_job_id": "...",
        "document_id": "...",
        "object_count": 3
      }
    }
  ]
}
```

## Troubleshooting

### Issue: "No LLM provider configured"

**Log:**
```
[LLMProviderFactory] No LLM provider configured
[ExtractionWorkerService] Extraction worker disabled: no LLM provider configured
```

**Solution:**
```bash
# Check GOOGLE_API_KEY is set
echo $GOOGLE_API_KEY

# If empty, set it
export GOOGLE_API_KEY=<your-key>

# Restart server
npm run dev
```

### Issue: "Rate limit exceeded"

**Log:**
```
[LangChainGeminiProvider] LLM extraction failed: 429 Rate Limit Exceeded
```

**Solution:**
- Free tier: 15 requests/minute
- Wait 1 minute and retry
- Or: Reduce `EXTRACTION_WORKER_BATCH_SIZE` to 1
- Or: Upgrade to paid plan

### Issue: "Invalid API key"

**Log:**
```
[LangChainGeminiProvider] Failed to initialize: API key invalid
```

**Solution:**
```bash
# Verify key format (should start with AIza...)
echo $GOOGLE_API_KEY

# Get new key from https://aistudio.google.com/app/apikey
export GOOGLE_API_KEY=<new-key>
```

### Issue: Low Confidence Scores

**Log:**
```
[ConfidenceScorerService] Entity confidence below threshold: 0.45 < 0.7
```

**Possible Causes:**
- Document text is ambiguous
- Entity type doesn't match document content
- Document is too short/incomplete

**Solutions:**
- Improve document quality (add context)
- Adjust confidence thresholds in config
- Use more specific extraction prompts

## Monitoring

### Check Worker Status

**Logs to watch:**
```
[ExtractionWorkerService] Processing batch: found 3 pending jobs
[LangChainGeminiProvider] Extracted 2 Requirement entities
[LangChainGeminiProvider] Extracted 1 Decision entities
[EntityLinkingService] Linked entity to existing object (similarity: 0.95)
[ExtractionWorkerService] Job completed: job_id=... entities=3 duration=2341ms
```

### Performance Metrics

**Expected:**
- **Processing time**: 2-5 seconds per job
- **Tokens used**: ~500-2000 per document
- **Cost**: $0.0001-0.0005 per extraction (Gemini Flash)

### Database Queries

**Check extraction jobs:**
```sql
SELECT id, status, created_at, completed_at, result_summary
FROM kb.object_extraction_jobs
ORDER BY created_at DESC
LIMIT 10;
```

**Check extracted objects:**
```sql
SELECT type, name, confidence, properties->>'priority' as priority
FROM kb.objects
WHERE source_document_id IS NOT NULL
ORDER BY created_at DESC
LIMIT 10;
```

## Test Documents

### Simple Requirements
```
The system must:
1. Support user authentication
2. Log all security events
3. Encrypt data at rest
4. Provide audit trails
```

### Meeting Decision
```
Decision: We will migrate from MySQL to PostgreSQL

Rationale: PostgreSQL provides better JSON support, advanced indexing, and is already used by other teams.

Impact: 2 weeks migration time, requires data transformation scripts.

Status: Approved by architecture team on 2025-10-04.
```

### Risk Identification
```
Risk: Third-party API dependency

The new integration relies on ExternalService API which has 99.5% SLA. If the service goes down, our checkout process will fail.

Mitigation: Implement circuit breaker pattern and fallback to manual order processing.
```

## Advanced Testing

### Test Multiple Entity Types

Upload a comprehensive document:
```
Project: E-commerce Platform

Requirements:
- REQ-001: Support OAuth 2.0 authentication
- REQ-002: Process 1000 orders per minute

Decisions:
- DEC-001: Use microservices architecture
- DEC-002: Deploy on AWS with Kubernetes

Risks:
- RISK-001: Database scalability concerns
- RISK-002: Third-party payment gateway downtime

Tasks:
- TASK-001: Design database schema
- TASK-002: Implement authentication service
```

**Expected:** Extracts 2 Requirements, 2 Decisions, 2 Risks, 2 Tasks

### Test Entity Linking

Upload similar documents sequentially:
```bash
# Document 1
"Requirement: User authentication with OAuth"

# Document 2 (similar)
"The system must support OAuth authentication for users"
```

**Expected:** Second extraction links to first (high similarity score)

### Test Confidence Filtering

Enable review threshold:
```bash
export EXTRACTION_CONFIDENCE_THRESHOLD_REVIEW=0.8
```

**Expected:** Low-confidence entities marked for review

## Cost Monitoring

### Calculate Costs

**Gemini Flash Pricing:**
- Input: $0.075 per 1M tokens
- Output: $0.30 per 1M tokens

**Example:**
- Document: 1000 tokens
- Extraction: 500 tokens output
- Cost: (1000 × 0.075 + 500 × 0.30) / 1,000,000 = **$0.000225** per extraction

**Estimated Monthly Cost:**
- 10,000 documents/month
- Average 1000 tokens each
- Total: ~$2.25/month (Gemini Flash)
- Compare: ~$75/month (GPT-4 Turbo)

---

**Questions?** Check `/Users/mcj/code/spec-server/docs/LANGCHAIN_MIGRATION_SUMMARY.md` for full details.
