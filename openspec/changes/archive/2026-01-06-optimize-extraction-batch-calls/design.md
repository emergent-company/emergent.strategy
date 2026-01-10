# Design Document: Optimize Extraction Batch Calls

## Context

The current entity extraction system uses LangChain with Google Gemini (Vertex AI) to extract structured entities from documents. It processes documents in chunks (for large documents) and extracts entities by type, resulting in `types × chunks` separate LLM calls.

**Current Flow:**

```
Document (10,000 chars)
  → Split into 3 chunks
  → For each of 5 entity types:
      → For each of 3 chunks:
          → Call LLM (structured output)
  → Total: 15 LLM calls
```

**Proposed Flow:**

```
Document (10,000 chars)
  → Split into 3 chunks
  → For each of 3 chunks:
      → Call LLM with all 5 entity types (structured output)
  → Total: 3 LLM calls
```

**Constraints:**

- Must maintain the same entity quality and structure
- Must respect rate limits (this optimization should help)
- Must handle partial failures gracefully
- Must work with LangChain's `.withStructuredOutput()` API

**Stakeholders:**

- Extraction worker service (consumer)
- Rate limiter (benefits from fewer calls)
- Users (faster extraction times)
- Cost management (lower API costs)

## Goals / Non-Goals

**Goals:**

1. Reduce the number of LLM API calls from `types × chunks` to just `chunks`
2. Maintain extraction quality (entity count, accuracy, confidence)
3. Preserve the same public API and entity format
4. Improve extraction speed by 70-80% for typical documents
5. Reduce API costs proportionally to call reduction

**Non-Goals:**

- Changing the entity format or ExtractionResult interface
- Modifying the chunking strategy (chunk size/overlap)
- Supporting other LLM providers in this change (focus on LangChain Gemini)
- Optimizing single-type extractions (already efficient)
- Real-time streaming of extraction results (future work)

## Decisions

### Decision 1: Single Unified Schema per Chunk

**What:** Combine all entity type schemas into a single Zod schema that returns entities grouped by type.

**Why:**

- LangChain's `.withStructuredOutput()` expects a single schema
- Allows LLM to see all type definitions in context, improving consistency
- Enables the LLM to disambiguate entities across types (e.g., "Application" could be an "Application Component" or "Business Application")

**Structure:**

```typescript
const unifiedSchema = z.object({
  entityGroups: z.array(
    z.object({
      type: z.string(), // Entity type name
      entities: z.array(entitySchemaForType), // Type-specific schema
    })
  ),
});
```

**Alternatives considered:**

- Flat array with `type` discriminator: Harder to validate per-type schemas
- Multiple calls with batching: Doesn't reduce round-trips enough
- Prompt-only without structured output: Lower quality, requires more parsing

### Decision 2: Single Comprehensive Prompt

**What:** Build one prompt that includes instructions for all entity types instead of type-specific prompts.

**Why:**

- Required for single-call approach
- Allows LLM to see relationships between types
- Simplifies prompt management (one template instead of N)

**Format:**

```
You are extracting structured entities from a document.

Extract ALL of the following entity types:
1. Application Component: [description]
2. Business Process: [description]
3. Data Asset: [description]
...

For each entity found:
- Assign to the correct type
- Provide name, description, properties
- Include confidence score

Output format: { entityGroups: [...] }
```

**Alternatives considered:**

- Keep type-specific prompts: Defeats the purpose of single-call optimization
- Generic prompt without type descriptions: Lower quality extraction

### Decision 3: Post-Processing Type Separation

**What:** After receiving the unified response, separate entities by type and apply per-type deduplication.

**Why:**

- Maintains compatibility with existing code that expects entities grouped by type
- Allows per-type quality scoring and filtering
- Preserves existing deduplication logic

**Implementation:**

```typescript
const response = await structuredModel.invoke(unifiedPrompt);
const entitiesByType = new Map<string, ExtractedEntity[]>();

for (const group of response.entityGroups) {
  const deduplicated = deduplicateEntities(group.entities);
  entitiesByType.set(group.type, deduplicated);
}
```

### Decision 4: Preserve Debug Logging Format

**What:** Continue logging each "logical extraction" (per type) even though it's now a single call.

**Why:**

- Maintains observability for debugging
- Allows comparison with historical logs
- Helps track per-type success rates

**Implementation:**

```typescript
debugCalls.push({
  type: 'unified',
  types_included: typesToExtract,
  chunk_index: chunkIndex,
  entities_by_type: entitiesByType,
  duration_ms: Date.now() - callStart,
});
```

## Risks / Trade-offs

### Risk 1: Prompt Size Increase

**Risk:** Single prompt with all type schemas may exceed token limits for models with small context windows.

**Mitigation:**

- Current model (Gemini) has 1M token context window - plenty of room
- Monitor prompt token counts in logs
- If needed, implement type batching (group types into sets of 3-4)

**Likelihood:** Low (typical schema total < 2,000 tokens)

### Risk 2: LLM Confusion with Multiple Types

**Risk:** LLM may struggle to correctly categorize entities when presented with many similar types simultaneously.

**Mitigation:**

- Provide clear type descriptions in prompt
- Include examples for ambiguous cases
- Monitor confidence scores and review-required rates
- Conduct A/B testing before full rollout

**Likelihood:** Medium (requires validation testing)

**Rollback:** Revert to per-type calls if quality metrics degrade by >10%

### Risk 3: Partial Failure Handling

**Risk:** If the LLM fails to extract one type, we lose all types in that call.

**Mitigation:**

- LLM typically returns partial results even on errors
- Structured output validation happens per-type
- Implement fallback: if unified call fails, retry with per-type calls
- Log all failures for investigation

**Likelihood:** Low (structured output is robust)

### Risk 4: Response Size Increase

**Risk:** Single response with all types may exceed model's output token limit.

**Mitigation:**

- Current model (Gemini) has 8,192 output tokens - sufficient for most documents
- Monitor response sizes in logs
- If needed, implement type batching as fallback

**Likelihood:** Low (typical document extracts < 100 entities)

## Migration Plan

### Phase 1: Implementation and Unit Testing (Week 1)

1. Implement unified schema and prompt in langchain-gemini.provider.ts
2. Add feature flag: `EXTRACTION_USE_BATCH_CALLS` (default: false)
3. Write unit tests for new behavior
4. Ensure all existing tests pass with flag disabled

### Phase 2: Integration Testing (Week 1-2)

1. Enable flag in test environment
2. Run extraction jobs on sample documents
3. Compare results with per-type baseline:
   - Entity counts by type
   - Confidence score distributions
   - Review-required rates
   - Extraction times
4. Adjust prompt and schema if quality issues found

### Phase 3: Staged Rollout (Week 2-3)

1. Deploy to staging with flag enabled
2. Monitor for 3-5 days:
   - Extraction job success rates
   - API error rates
   - Rate limit hit frequency
   - Average extraction times
3. Compare metrics to baseline (pre-optimization)
4. If metrics improve or stay neutral, proceed to production

### Phase 4: Production Deployment (Week 3)

1. Enable flag for 10% of extraction jobs (canary)
2. Monitor for 2-3 days
3. Gradually increase to 50%, then 100%
4. Remove feature flag after 1 week of stable operation

### Rollback Plan

- **Immediate rollback:** Disable feature flag (reverts to per-type calls)
- **Trigger conditions:**
  - Job failure rate increases by >5%
  - Average confidence scores drop by >10%
  - Review-required rate increases by >20%
  - Rate limit issues worsen
- **Recovery time:** < 5 minutes (config change)

## Open Questions

1. **Should we batch types into groups (e.g., 3 types per call) instead of all types at once?**

   - Answer: Start with all types. Only add batching if we hit prompt/response limits.

2. **How do we handle template packs with 20+ entity types?**

   - Answer: Monitor prompt sizes. Implement type grouping if needed (future work).

3. **Should we parallelize chunk processing?**

   - Answer: No, keep sequential processing to respect rate limits. Future optimization.

4. **Do we need backward compatibility for old extraction jobs?**

   - Answer: No, this is a runtime optimization. Existing jobs will use new approach on retry.

5. **Should we update rate limiter token estimation?**
   - Answer: Yes, update token estimation to reflect single-call pattern (fewer overhead tokens).
