# Tasks: Improve Extraction Relationship Quality (LangGraph)

## Architecture Approach

**Parallel Service Architecture**: The new LangGraph extraction is built as a separate provider implementing the existing `ILLMProvider` interface. This allows:

- Zero-risk deployment (old extraction unchanged)
- Easy A/B testing and comparison
- Feature flag controlled rollout
- Instant rollback capability

## Phase 1: Core Infrastructure (Parallel Provider)

### 1.0 Setup & Dependencies

- [ ] 1.0.1 Install `@langchain/langgraph` dependency in server package
- [ ] 1.0.2 Create directory structure: `apps/server/src/modules/extraction-jobs/llm/langgraph/`
- [ ] 1.0.3 Add `EXTRACTION_PIPELINE_MODE` to `AppConfigService` (default: `single_pass`)

### 1.1 Define Graph State

- [ ] 1.1.1 Create `GraphState` interface in `llm/langgraph/state.ts`
- [ ] 1.1.2 Define Zod schemas for `Entity` and `Relationship` internal models
- [ ] 1.1.3 Implement state reducer/annotation functions for array fields

### 1.2 Implement Graph Nodes (Agents)

All nodes go in `llm/langgraph/nodes/`:

- [ ] 1.2.1 Implement `document-router.node.ts` (classify text category)
- [ ] 1.2.2 Implement `entity-extractor.node.ts` (extract entities with temp_ids)
- [ ] 1.2.3 Implement `identity-resolver.node.ts` (CODE-BASED - no LLM, uses vector search)
- [ ] 1.2.4 Implement `relationship-builder.node.ts` (connect entities using temp_ids)
- [ ] 1.2.5 Implement `quality-auditor.node.ts` (check for orphans, CODE-BASED)

### 1.3 Create LangGraph Provider (implements ILLMProvider)

- [ ] 1.3.1 Create `langgraph-extraction.provider.ts` implementing `ILLMProvider`
- [ ] 1.3.2 Build `StateGraph` and add all nodes
- [ ] 1.3.3 Define edges and conditional logic (Auditor retry loop)
- [ ] 1.3.4 Compile the graph
- [ ] 1.3.5 Implement `extractEntities()` to invoke graph and transform output to `ExtractionResult`
- [ ] 1.3.6 Implement `isConfigured()` and `getName()`

### 1.4 Wire into Factory (No Worker Changes)

- [ ] 1.4.1 Add `LangGraphExtractionProvider` to NestJS module
- [ ] 1.4.2 Inject into `LLMProviderFactory`
- [ ] 1.4.3 Update `initializeProvider()` to select based on `EXTRACTION_PIPELINE_MODE`
- [ ] 1.4.4 **Verify**: `ExtractionWorkerService` requires NO changes (uses factory)

## Phase 2: Logic & Prompts

### 2.1 Prompt Engineering

All prompts go in `llm/langgraph/prompts/`:

- [ ] 2.1.1 Create `router.prompts.ts` - document classification
- [ ] 2.1.2 Create `entity.prompts.ts` - entity extraction (Narrative, Legal, Technical variants)
- [ ] 2.1.3 Create `relationship.prompts.ts` - relationship building with temp_id constraints
- [ ] 2.1.4 Ensure all prompts separate "System Instructions" from "Data Context"

### 2.2 Output Transformation

- [ ] 2.2.1 Map internal `Entity` (with temp_id) → `ExtractedEntity` (interface)
- [ ] 2.2.2 Map internal `Relationship` → `ExtractedRelationship` (with proper EntityReference)
- [ ] 2.2.3 Preserve token usage, raw_response, discovered_types in `ExtractionResult`

## Phase 3: Testing & Validation

### 3.1 Unit Tests

- [ ] 3.1.1 Test each node in isolation with mocked LLM
- [ ] 3.1.2 Test `IdentityResolver` code logic (similarity matching)
- [ ] 3.1.3 Test `QualityAuditor` orphan detection logic
- [ ] 3.1.4 Test state transitions and graph edges

### 3.2 Integration Tests

- [ ] 3.2.1 Run LangGraph provider on "Bible Chapter 1" (Narrative)
- [ ] 3.2.2 Run LangGraph provider on "Sample Contract" (Legal)
- [ ] 3.2.3 Compare results with existing single-pass provider
- [ ] 3.2.4 Measure relationship density improvement
- [ ] 3.2.5 Verify orphan rate reduction

### 3.3 A/B Comparison (Shadow Mode)

- [ ] 3.3.1 Create script to run both providers on same document
- [ ] 3.3.2 Compare entity counts, relationship counts, orphan rates
- [ ] 3.3.3 Log comparison results without affecting production

### 3.4 Observability

- [ ] 3.4.1 Log graph execution steps via LangFuse spans
- [ ] 3.4.2 Track retry counts and orphan recovery rates
- [ ] 3.4.3 Add metrics for graph node latencies

## Definition of Done

- [ ] `EXTRACTION_PIPELINE_MODE=single_pass` uses existing provider (default)
- [ ] `EXTRACTION_PIPELINE_MODE=langgraph` uses new LangGraph provider
- [ ] Both providers return identical `ExtractionResult` structure
- [ ] `ExtractionWorkerService` unchanged (no code modifications)
- [ ] Relationship density improved by >50% on test documents
- [ ] Orphan rate reduced to <10% on test documents
