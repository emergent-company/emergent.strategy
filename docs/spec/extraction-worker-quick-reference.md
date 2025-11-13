# Extraction Worker - Quick Reference

**Last Updated**: 2025-10-03

---

## Configuration Summary

### User Requirements (From Discussion)

1. **LLM Provider**: Google Gemini via Google Vertex AI ✅
2. **Document Processing**: Full document extraction ✅
3. **Entity Linking**: 
   - User review should be an option ✅
   - Threshold should be calculated ✅
   - Always new and merge are configurable policies ✅
4. **Quality Control**:
   - Should be configurable ✅
   - Calculated thresholds ✅
   - Flag for review below configurable confidence ✅
5. **Rate Limiting**: Configurable quotas ✅

---

## Key Environment Variables

```bash
# Required
GOOGLE_API_KEY=<your-key>
GOOGLE_VERTEX_PROJECT=<project-id>
VERTEX_EXTRACTION_MODEL=gemini-1.5-pro

# Worker Configuration
EXTRACTION_WORKER_ENABLED=true
EXTRACTION_WORKER_INTERVAL_MS=5000
EXTRACTION_WORKER_BATCH_SIZE=3

# Quality Thresholds (Configurable)
EXTRACTION_MIN_CONFIDENCE=0.0           # Reject below this
EXTRACTION_REVIEW_THRESHOLD=0.7         # Review flag below this
EXTRACTION_AUTO_CREATE_THRESHOLD=0.85   # Auto-create above this

# Entity Linking (Configurable Strategies)
ENTITY_LINKING_ENABLED=true
ENTITY_LINKING_STRATEGY=vector_similarity  # Options: always_new, key_match, vector_similarity, user_review
ENTITY_LINKING_SIMILARITY_THRESHOLD=0.9

# Rate Limiting (Configurable)
EXTRACTION_RATE_LIMIT_RPM=60
```

---

## Entity Linking Strategies

| Strategy | Behavior | Use Case |
|----------|----------|----------|
| `always_new` | Always create new objects, never merge | Import from external systems, archive mode |
| `key_match` | Match by object key field, merge if found | Structured data with unique identifiers |
| `vector_similarity` | Match by embedding similarity, merge if high overlap | Unstructured text, natural language |
| `user_review` | Always flag for manual review | High-stakes data, legal/compliance |

---

## Confidence Thresholds Flow

```
                  MIN          REVIEW         AUTO
                   │             │             │
    0.0 ───────────┼─────────────┼─────────────┼─────────── 1.0
                   │             │             │
                   │             │             │
      ◄────────────┤◄────────────┤◄────────────┤
         REJECT         REVIEW        AUTO-CREATE
                       (flagged)     (immediate)
```

**Example Configuration**:
- `MIN=0.0` - Accept everything (let review handle quality)
- `REVIEW=0.7` - Flag for review if confidence < 0.7
- `AUTO=0.85` - Auto-create if confidence ≥ 0.85

---

## Implementation Phases

### Phase 2: MVP (Current)
- ✅ Google Vertex AI integration
- ✅ Full document extraction
- ✅ Basic object creation
- ✅ Configurable thresholds
- ✅ Retry logic

### Phase 3: Quality & Linking
- ⏳ Confidence scoring
- ⏳ Entity linking strategies
- ⏳ Merge logic
- ⏳ User review workflow

### Phase 4: Production
- ⏳ Metrics & monitoring
- ⏳ Performance optimization
- ⏳ Cost tracking

---

## Usage Examples

### 1. Create Extraction Job (API)

```bash
POST /extraction-jobs
Content-Type: application/json
Authorization: Bearer <token>

{
  "org_id": "550e8400-e29b-41d4-a716-446655440000",
  "project_id": "550e8400-e29b-41d4-a716-446655440001",
  "source_type": "document",
  "source_id": "doc-123",
  "extraction_config": {
    "enabled_types": ["Requirement", "BusinessCapability"],
    "entity_linking_strategy": "vector_similarity",
    "min_confidence": 0.7
  }
}
```

### 2. Monitor Job Progress

```bash
GET /extraction-jobs/:jobId
Authorization: Bearer <token>

# Response
{
  "id": "job-123",
  "status": "running",
  "processed_items": 5,
  "total_items": 10,
  "created_objects": ["obj-1", "obj-2", "obj-3"],
  "discovered_types": ["Requirement"],
  "started_at": "2025-10-03T10:00:00Z"
}
```

### 3. Review Flagged Objects

```bash
GET /graph/objects/search?labels=requires_review&project_id=:projectId
Authorization: Bearer <token>

# Response
{
  "items": [
    {
      "id": "obj-456",
      "type": "Requirement",
      "properties": { ... },
      "labels": ["extracted", "requires_review"],
      "_extraction_metadata": {
        "confidence": 0.65,
        "job_id": "job-123",
        "review_priority": "medium"
      }
    }
  ]
}
```

---

## Monitoring

### Health Check
```bash
GET /extraction-worker/health

# Response
{
  "status": "healthy",
  "worker_running": true,
  "pending_jobs": 5,
  "error_rate": 0.02
}
```

### Metrics
```bash
GET /extraction-worker/metrics

# Response
{
  "jobs_processed": 1000,
  "jobs_succeeded": 950,
  "jobs_failed": 30,
  "jobs_requiring_review": 20,
  "objects_created": 2500,
  "objects_merged": 150,
  "avg_confidence": 0.82,
  "rate_limit_hits": 5
}
```

---

## Testing Checklist

### Before Deploying
- [ ] All unit tests pass
- [ ] All integration tests pass
- [ ] E2E test with real Vertex AI works
- [ ] Rate limiting tested
- [ ] Retry logic tested
- [ ] Entity linking tested (all strategies)
- [ ] Confidence thresholds tested

### After Deploying
- [ ] Monitor metrics for 24 hours
- [ ] Check error rates
- [ ] Verify object quality
- [ ] Check API costs
- [ ] Review flagged objects

---

## Troubleshooting

### Issue: Jobs stuck in "pending"
**Check**: Worker enabled? `EXTRACTION_WORKER_ENABLED=true`  
**Check**: Worker running? Check logs for startup message  
**Check**: Scheduled time? Jobs may be scheduled in future

### Issue: High failure rate
**Check**: Vertex AI credentials valid?  
**Check**: Rate limits configured correctly?  
**Check**: Document content valid?  
**Check**: Error logs for specific failures

### Issue: Poor extraction quality
**Check**: Extraction prompts appropriate for content?  
**Check**: JSON schema matches expected data?  
**Check**: Model selection (try gemini-1.5-pro vs flash)?  
**Check**: Temperature settings (lower = more deterministic)

### Issue: Too many duplicates
**Check**: Entity linking enabled?  
**Check**: Similarity threshold too low?  
**Check**: Vector embeddings populated?  
**Try**: Switch strategy from `always_new` to `vector_similarity`

### Issue: API costs too high
**Check**: Batch size (too small = more requests)?  
**Check**: Document size (chunk large docs)?  
**Check**: Enabled types (only extract what you need)?  
**Try**: Use cheaper model (gemini-1.5-flash)

---

## Cost Estimation

### Google Vertex AI Pricing (Gemini 1.5 Pro)
- Input: $1.25 per 1M tokens
- Output: $5.00 per 1M tokens

### Example Calculation
- Document: 10,000 tokens
- Extraction types: 3
- Tokens per extraction: ~12,000 (prompt + document)
- Cost per document: ~$0.015 (1.5 cents)
- 1000 documents/month: ~$15

**Optimization Tips**:
- Use Gemini Flash for simple extractions ($0.075/$0.30 per 1M tokens)
- Batch multiple types in one prompt
- Cache document embeddings
- Only extract enabled types

---

## Security Notes

### API Key Storage
- Never commit keys to git
- Use secrets manager (AWS Secrets Manager, GCP Secret Manager)
- Rotate keys regularly (quarterly)

### Data Privacy
- Document content sent to Google Vertex AI
- Ensure compliance with data residency requirements
- Use GCP location parameter for regional control
- Consider on-prem deployment for sensitive data

### Access Control
- Extraction jobs scoped to project
- RLS policies enforce data isolation
- Only users with `graph:write` can create jobs

---

## Related Documentation

- **Architecture**: `docs/spec/25-extraction-worker.md`
- **Implementation Plan**: `docs/spec/26-extraction-worker-implementation-plan.md`
- **Type System**: `docs/spec/24-dynamic-type-discovery-and-ingestion.md`
- **Embeddings**: `docs/spec/20-embeddings.md` (similar pattern)
- **Graph API**: `docs/spec/19-dynamic-object-graph.md`

---

## Contact & Support

For questions or issues:
1. Check logs: `apps/server/logs/`
2. Review metrics: `GET /extraction-worker/metrics`
3. Check job details: `GET /extraction-jobs/:jobId`
4. Open issue with reproduction steps

---

**End of Quick Reference**
