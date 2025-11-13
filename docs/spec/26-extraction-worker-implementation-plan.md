# Extraction Worker Implementation Plan

**Status**: Ready to Execute  
**Created**: 2025-10-03  
**Related**: `25-extraction-worker.md`, `24-dynamic-type-discovery-and-ingestion.md`

---

## Overview

This document provides a step-by-step implementation plan for building the Document Extraction Worker system. The plan is organized into phases with clear dependencies, deliverables, and success criteria.

---

## Phase 2: Core Extraction Worker (MVP)

**Goal**: Build a working extraction worker that can process documents and create graph objects using Google Vertex AI.

**Duration**: ~8-10 work sessions

---

### Task 2.1: Project Setup & Dependencies

**Objective**: Install required packages and configure environment

#### Subtasks

1. **Install Google Cloud Dependencies**
   ```bash
   cd apps/server
   npm install @google-cloud/vertexai
   npm install @google-cloud/aiplatform
   ```

2. **Create Configuration Service Extension**
   - File: `src/common/config/config.service.ts`
   - Add properties:
     - `extractionWorkerEnabled`
     - `extractionWorkerIntervalMs`
     - `extractionWorkerBatchSize`
     - `extractionMinConfidence`
     - `extractionReviewThreshold`
     - `entityLinkingEnabled`
     - `entityLinkingStrategy`
     - `vertexExtractionModel`

3. **Update Schema**
   - File: `src/common/config/config.schema.ts`
   - Add environment variable mappings
   - Add validation rules
   - Add default values

4. **Create `.env.example` entries**
   ```bash
   # Extraction Worker
   EXTRACTION_WORKER_ENABLED=true
   EXTRACTION_WORKER_INTERVAL_MS=5000
   EXTRACTION_WORKER_BATCH_SIZE=3
   
   # Vertex AI
   VERTEX_EXTRACTION_MODEL=gemini-1.5-pro
   
   # Quality Control
   EXTRACTION_MIN_CONFIDENCE=0.0
   EXTRACTION_REVIEW_THRESHOLD=0.7
   EXTRACTION_AUTO_CREATE_THRESHOLD=0.85
   
   # Entity Linking
   ENTITY_LINKING_ENABLED=true
   ENTITY_LINKING_STRATEGY=vector_similarity
   ENTITY_LINKING_SIMILARITY_THRESHOLD=0.9
   ```

**Success Criteria**:
- [x] Dependencies installed
- [ ] Config service extended
- [ ] Environment variables documented
- [ ] Type checking passes

**Estimated Time**: 1 session (2-3 hours)

---

### Task 2.2: LLM Provider Abstraction

**Objective**: Create a pluggable LLM provider interface with Vertex AI implementation

#### Subtasks

1. **Create Provider Interface**
   - File: `src/modules/extraction-worker/llm-provider.interface.ts`
   - Define:
     - `ExtractionRequest` interface
     - `ExtractionResponse` interface
     - `LLMProvider` interface with `extract()` method

2. **Implement Vertex AI Provider**
   - File: `src/modules/extraction-worker/vertex-ai-provider.ts`
   - Implement structured generation
   - Handle rate limiting
   - Parse responses
   - Error handling (429, quota, network)

3. **Create Provider Factory**
   - File: `src/modules/extraction-worker/llm-provider.factory.ts`
   - Create provider based on config
   - Support 'google-vertex' (others future)

4. **Unit Tests**
   - File: `src/modules/extraction-worker/__tests__/vertex-ai-provider.spec.ts`
   - Test successful extraction
   - Test error handling
   - Test rate limiting
   - Mock Vertex AI client

**Success Criteria**:
- [ ] Interface defined with strong types
- [ ] Vertex AI provider implemented
- [ ] Unit tests pass (with mocks)
- [ ] Error handling covers key scenarios

**Estimated Time**: 2 sessions (4-6 hours)

---

### Task 2.3: Rate Limiter Implementation

**Objective**: Implement token bucket rate limiter for API quota management

#### Subtasks

1. **Create Rate Limiter Class**
   - File: `src/modules/extraction-worker/rate-limiter.ts`
   - Token bucket algorithm
   - `acquire(cost)` method with waiting
   - `getAvailableTokens()` for monitoring

2. **Integrate with LLM Provider**
   - Wrap all LLM calls with rate limiting
   - Configure from environment (RPM, TPM)

3. **Unit Tests**
   - File: `src/modules/extraction-worker/__tests__/rate-limiter.spec.ts`
   - Test token consumption
   - Test refill rate
   - Test waiting behavior
   - Test concurrent acquires

**Success Criteria**:
- [ ] Rate limiter class implemented
- [ ] Integrated with Vertex AI provider
- [ ] Unit tests pass
- [ ] Handles concurrent requests correctly

**Estimated Time**: 1 session (2-3 hours)

---

### Task 2.4: Extraction Job Service Enhancements

**Objective**: Add dequeue logic and job lifecycle management

#### Subtasks

1. **Add Dequeue Method**
   - File: `src/modules/extraction-jobs/extraction-job.service.ts`
   - Implement atomic dequeue with `FOR UPDATE SKIP LOCKED`
   - Order by priority DESC, scheduled_at ASC
   - Return batch of jobs

2. **Add Job State Transitions**
   - `markRunning(jobId)`
   - `markCompleted(jobId, results)`
   - `markFailed(jobId, error, retryCount)`
   - `markRequiresReview(jobId)`

3. **Add Retry Logic**
   - Calculate exponential backoff
   - Update scheduled_at for retry
   - Track retry_count

4. **Update Unit Tests**
   - Test dequeue concurrency (multiple workers)
   - Test state transitions
   - Test retry backoff calculation

**Success Criteria**:
- [ ] Dequeue method implemented
- [ ] State transition methods added
- [ ] Retry logic working
- [ ] Unit tests pass
- [ ] Concurrent dequeue safe

**Estimated Time**: 1 session (2-3 hours)

---

### Task 2.5: Extraction Worker Service (Core Logic)

**Objective**: Build the main worker service that processes extraction jobs

#### Subtasks

1. **Create Worker Service**
   - File: `src/modules/extraction-worker/extraction-worker.service.ts`
   - Implement `OnModuleInit`, `OnModuleDestroy`
   - Polling loop with configurable interval
   - `processBatch()` method
   - Metrics tracking

2. **Implement Document Loading**
   - Load from `kb.documents` table
   - Handle different source types
   - Extract full text content

3. **Implement Type Registry Loading**
   - Query `kb.project_object_type_registry`
   - Filter enabled types
   - Load extraction prompts from template pack

4. **Implement Extraction Flow**
   - For each enabled type:
     - Build prompt
     - Call LLM provider
     - Parse response
     - Validate against schema

5. **Implement Object Creation (Simple)**
   - Create objects via `GraphService.createObject()`
   - Add extraction metadata
   - Track created object IDs

6. **Error Handling**
   - Try/catch around job processing
   - Call `markFailed()` on error
   - Differentiate retriable vs non-retriable

**Success Criteria**:
- [ ] Worker service starts on module init
- [ ] Polls for jobs at interval
- [ ] Loads documents correctly
- [ ] Calls LLM and parses responses
- [ ] Creates graph objects
- [ ] Handles errors gracefully
- [ ] Metrics tracked

**Estimated Time**: 3 sessions (6-9 hours)

---

### Task 2.6: Integration Tests (E2E)

**Objective**: Verify end-to-end extraction workflow

#### Subtasks

1. **Create Test Document**
   - Seed a test document with known content
   - Content should match TOGAF template types

2. **Create E2E Test**
   - File: `tests/e2e/extraction-worker.e2e.spec.ts`
   - Seed: document, template pack assignment
   - Create extraction job
   - Process job (call `processBatch()`)
   - Verify job status = completed
   - Verify objects created in graph
   - Verify object properties match schema

3. **Test Error Scenarios**
   - Invalid source_id (document not found)
   - LLM error (mock failure)
   - Retry logic (multiple failures)

**Success Criteria**:
- [ ] E2E test passes
- [ ] Objects created from document
- [ ] Properties validated
- [ ] Error scenarios handled
- [ ] No flakiness

**Estimated Time**: 2 sessions (4-5 hours)

---

### Task 2.7: Module Registration & Documentation

**Objective**: Wire up module and document usage

#### Subtasks

1. **Create Extraction Worker Module**
   - File: `src/modules/extraction-worker/extraction-worker.module.ts`
   - Register providers
   - Export services
   - Import dependencies

2. **Register in App Module**
   - Add to imports array
   - Ensure correct module ordering

3. **Update OpenAPI/Swagger**
   - Document extraction job DTOs
   - Add examples

4. **Write Developer Guide**
   - How to create extraction job
   - How to monitor progress
   - How to configure LLM settings

**Success Criteria**:
- [ ] Module registered
- [ ] Worker starts automatically
- [ ] API docs updated
- [ ] Guide written

**Estimated Time**: 1 session (2-3 hours)

---

## Phase 3: Entity Linking & Quality Control

**Goal**: Add similarity matching, merging, and confidence-based review flagging

**Duration**: ~6-8 work sessions

---

### Task 3.1: Confidence Scoring

**Objective**: Calculate confidence scores for extracted objects

#### Subtasks

1. **Implement Confidence Calculator**
   - File: `src/modules/extraction-worker/confidence-scorer.ts`
   - Factors:
     - LLM-provided confidence
     - Schema completeness
     - Evidence quality
     - Property value quality
   - Weighted scoring algorithm

2. **Unit Tests**
   - Test with high-quality objects
   - Test with incomplete data
   - Test with missing fields
   - Test edge cases

**Success Criteria**:
- [ ] Confidence calculation implemented
- [ ] Tests pass
- [ ] Scores correlate with quality

**Estimated Time**: 1 session (2-3 hours)

---

### Task 3.2: Quality Thresholds & Review Flagging

**Objective**: Implement configurable quality gates

#### Subtasks

1. **Implement Threshold Logic**
   - Check confidence vs thresholds
   - Decide: reject, review, auto-create
   - Add `requires_review` label to objects

2. **Update Job Status**
   - If any object needs review, job status = `requires_review`
   - Track review count in job results

3. **Unit Tests**
   - Test rejection below min threshold
   - Test review flagging
   - Test auto-creation above threshold

**Success Criteria**:
- [ ] Threshold logic works
- [ ] Objects labeled correctly
- [ ] Job status reflects review needs
- [ ] Tests pass

**Estimated Time**: 1 session (2-3 hours)

---

### Task 3.3: Entity Linking - Key Match Strategy

**Objective**: Implement key-based matching for duplicates

#### Subtasks

1. **Create Entity Linking Service**
   - File: `src/modules/extraction-worker/entity-linking.service.ts`
   - `findSimilarObjects(extracted, config)` method
   - Implement key match strategy

2. **Implement Key Extraction**
   - Extract natural key from properties
   - Handle different key fields per type
   - Normalize keys (lowercase, trim)

3. **Implement Merge Logic**
   - Compare properties
   - Decide: skip, merge, create new
   - Call `patchObject()` for merges

4. **Unit Tests**
   - Test exact key match → skip
   - Test partial match → merge
   - Test no match → create new

**Success Criteria**:
- [ ] Key matching works
- [ ] Duplicates skipped
- [ ] Merges update existing objects
- [ ] Tests pass

**Estimated Time**: 2 sessions (4-5 hours)

---

### Task 3.4: Entity Linking - Vector Similarity Strategy

**Objective**: Use embeddings for semantic similarity matching

#### Subtasks

1. **Integrate with Vector Search**
   - Use existing `GraphVectorSearchService`
   - Generate embedding for extracted object
   - Query similar objects

2. **Implement Similarity Scoring**
   - Convert distance to similarity
   - Apply threshold
   - Rank candidates

3. **Implement Property Overlap Calculation**
   - Compare existing vs extracted properties
   - Calculate overlap percentage
   - Decide merge strategy based on overlap

4. **Unit Tests**
   - Test high similarity → merge
   - Test low similarity → create new
   - Test partial overlap → selective merge

**Success Criteria**:
- [ ] Vector search integrated
- [ ] Similarity matching works
- [ ] Overlap calculation accurate
- [ ] Tests pass

**Estimated Time**: 2 sessions (4-5 hours)

---

### Task 3.5: Integration Tests (Entity Linking)

**Objective**: Verify entity linking end-to-end

#### Subtasks

1. **Test Duplicate Detection**
   - Create object manually
   - Extract same object from document
   - Verify duplicate skipped

2. **Test Merging**
   - Create partial object
   - Extract full object
   - Verify properties merged

3. **Test Different Strategies**
   - Test key match strategy
   - Test vector similarity strategy
   - Test always_new strategy

**Success Criteria**:
- [ ] E2E tests pass
- [ ] All strategies work
- [ ] No data loss during merge

**Estimated Time**: 1 session (2-3 hours)

---

## Phase 4: Observability & Optimization

**Goal**: Add monitoring, logging, and performance optimization

**Duration**: ~4-5 work sessions

---

### Task 4.1: Metrics & Monitoring

**Objective**: Track worker health and performance

#### Subtasks

1. **Implement Metrics Collection**
   - Jobs processed/succeeded/failed
   - Objects created/merged/skipped
   - Average confidence
   - Processing times
   - Rate limit hits

2. **Add Metrics Endpoint**
   - `GET /extraction-worker/metrics`
   - Return current metrics snapshot
   - Include rate limiter status

3. **Add Health Check**
   - `GET /extraction-worker/health`
   - Check worker running
   - Check queue depth
   - Check error rate

**Success Criteria**:
- [ ] Metrics collected
- [ ] Endpoints return data
- [ ] Health check works

**Estimated Time**: 1 session (2-3 hours)

---

### Task 4.2: Structured Logging

**Objective**: Comprehensive logging for debugging and auditing

#### Subtasks

1. **Add Event Logging**
   - Job started/completed
   - Object created/merged
   - Errors and retries
   - Rate limit events

2. **Add Context to Logs**
   - Include job ID, project ID, type
   - Include confidence scores
   - Include timing data

3. **Implement Log Levels**
   - DEBUG: detailed flow
   - INFO: major events
   - WARN: retries, low confidence
   - ERROR: failures

**Success Criteria**:
- [ ] Structured logs emitted
- [ ] Context included
- [ ] Filterable by level

**Estimated Time**: 1 session (2-3 hours)

---

### Task 4.3: Performance Optimization

**Objective**: Improve throughput and reduce latency

#### Subtasks

1. **Batch LLM Requests**
   - Extract multiple types in one prompt
   - Reduce API call count

2. **Parallel Processing**
   - Process multiple jobs concurrently
   - Use worker pool pattern

3. **Cache Document Content**
   - Cache in-memory for same document
   - Avoid repeated DB queries

4. **Optimize Queries**
   - Index extraction job status + scheduled_at
   - Analyze slow queries

**Success Criteria**:
- [ ] Throughput increased
- [ ] Latency reduced
- [ ] No degradation in quality

**Estimated Time**: 2 sessions (4-5 hours)

---

## Phase 5: Admin UI & User Workflows (Future)

**Goal**: Build UI for monitoring and managing extraction jobs

---

### Task 5.1: Job Management UI

- List extraction jobs (table view)
- Job detail page (status, progress, errors)
- Create new job modal
- Cancel/retry actions

### Task 5.2: Review Workflow UI

- List objects requiring review
- Approve/reject/edit interface
- Bulk approval
- Confidence visualization

### Task 5.3: Configuration UI

- Template pack assignment with extraction config
- Enable/disable types for project
- Set quality thresholds
- Entity linking strategy selector

---

## Implementation Order (Recommended)

**Week 1-2: Foundation**
- Task 2.1: Setup
- Task 2.2: LLM Provider
- Task 2.3: Rate Limiter

**Week 3-4: Core Worker**
- Task 2.4: Job Service
- Task 2.5: Worker Service
- Task 2.6: E2E Tests
- Task 2.7: Documentation

**Week 5-6: Quality & Linking**
- Task 3.1: Confidence Scoring
- Task 3.2: Thresholds
- Task 3.3: Key Match
- Task 3.4: Vector Similarity
- Task 3.5: E2E Tests

**Week 7-8: Production Ready**
- Task 4.1: Metrics
- Task 4.2: Logging
- Task 4.3: Optimization

---

## Testing Strategy

### Unit Tests (Per Task)
- Mock external dependencies (LLM, DB)
- Test happy path + error cases
- Aim for 80%+ coverage

### Integration Tests (Per Phase)
- Use real DB (test instance)
- Mock LLM (deterministic responses)
- Verify data flow end-to-end

### E2E Tests (Phase Complete)
- Real DB, real LLM (with test quota)
- Seed realistic documents
- Verify full workflow

---

## Rollout Plan

### Stage 1: Development (Local)
- Use dummy LLM provider (deterministic)
- Test with small documents
- Verify all flows work

### Stage 2: Staging (Test LLM)
- Use real Vertex AI with test project
- Test with sample TOGAF documents
- Verify rate limiting and quotas

### Stage 3: Production (Controlled Rollout)
- Enable for single test project
- Monitor metrics closely
- Gradually increase enabled types
- Enable for more projects

---

## Success Metrics

### Phase 2 (MVP)
- [x] Worker processes jobs
- [ ] Objects created from documents
- [ ] E2E tests pass
- [ ] No crashes or deadlocks

### Phase 3 (Quality)
- [ ] <5% duplicate objects
- [ ] >90% confidence on auto-created objects
- [ ] <10% requiring human review

### Phase 4 (Production)
- [ ] 99% uptime
- [ ] <2% error rate
- [ ] <30s average processing time per job

---

## Risk Mitigation

### Risk: LLM Quota Exhaustion
**Mitigation**: Rate limiter + queue pause on quota errors

### Risk: Poor Extraction Quality
**Mitigation**: Confidence thresholds + review workflow

### Risk: High Cost
**Mitigation**: Cost tracking + per-project limits

### Risk: Worker Crashes
**Mitigation**: Job retry logic + monitoring + alerts

---

## Dependencies

### External Services
- Google Vertex AI (API access + quota)
- PostgreSQL (existing)
- Embedding service (for vector similarity)

### Internal Services
- Graph Service (object creation)
- Type Registry Service (schema loading)
- Vector Search Service (similarity)

---

## Open Questions

1. **Chunk Processing**: When to split large documents?
   - **Decision**: Start with full document, add chunking in Phase 4

2. **Relationship Extraction**: In scope for Phase 2?
   - **Decision**: No, defer to Phase 5 (complex, needs graph reasoning)

3. **Multi-Model**: Support multiple LLM providers?
   - **Decision**: Start with Vertex AI, add others later

4. **Real-Time**: Streaming results?
   - **Decision**: No, batch processing only in Phase 2

---

## Documentation Checklist

- [x] Architecture spec (`25-extraction-worker.md`)
- [x] Implementation plan (this document)
- [ ] API reference (auto-generated from OpenAPI)
- [ ] Developer guide (how to use)
- [ ] Operations runbook (deployment, monitoring)
- [ ] User guide (how to create jobs, review results)

---

## Next Steps

1. **Review this plan** with team
2. **Set up Vertex AI project** and get API keys
3. **Start Task 2.1** (setup & dependencies)
4. **Create feature branch**: `feature/extraction-worker`
5. **Track progress** in project management tool

---

**End of Implementation Plan**
