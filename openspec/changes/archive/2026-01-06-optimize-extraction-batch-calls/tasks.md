# Implementation Tasks

## 1. Investigation and Design

- [x] 1.1 Analyze current chunking implementation to identify replacement points
- [x] 1.2 Research `text-embedding-004` integration for semantic similarity
- [x] 1.3 Design unified Zod schema structure for all entity types
- [x] 1.4 Plan LangGraph Map-Reduce topology (MapNode, ReduceNode, ReflexionNode)

## 2. Semantic Chunking Implementation

- [x] 2.1 Implement `SemanticChunker` service
  - [x] 2.1.1 Integrate embedding provider (Gemini)
  - [x] 2.1.2 Implement cosine similarity logic for sentence splitting
  - [x] 2.1.3 Implement adaptive thresholding (optional but good)
  - [x] 2.1.4 Add metadata preservation (page numbers, start/end char)
- [x] 2.2 Unit test `SemanticChunker` with sample texts
- [x] 2.3 Replace `RecursiveCharacterTextSplitter` with `SemanticChunker` in the extraction pipeline

## 3. Unified Schema & Map-Reduce (LangGraph)

- [x] 3.1 Implement Zod Schema Factory
  - [x] 3.1.1 Create function to merge multiple entity type schemas into one `z.object`
  - [x] 3.1.2 Add type discriminators
- [x] 3.2 Implement LangGraph Workflow
  - [x] 3.2.1 Create `MapNode`: Extract entities from a single chunk using unified schema & **Gemini 2.5 Flash**
  - [x] 3.2.2 Create `ReflexionNode`: Catch Zod validation errors and retry
  - [x] 3.2.3 Create `ReduceNode`: Merge entity lists and deduplicate
  - [x] 3.2.4 Define graph edges and state management (`Annotated[List, add]`)
- [x] 3.3 Integrate LangGraph into `ExtractionWorker`

## 4. Testing & Validation

- [x] 4.1 Unit tests for Zod schema merging
- [x] 4.2 Unit tests for LangGraph nodes (mocking LLM calls)
- [x] 4.3 Integration test: Run full extraction on a sample document
  - [x] 4.3.1 Verify entity recall vs legacy method
  - [x] 4.3.2 Measure cost/call reduction
- [x] 4.4 Verify "Reflexion" logic by injecting invalid responses

## 5. Monitoring & Cleanup

- [x] 5.1 Add logging for Semantic Chunking stats (chunks generated, avg similarity)
- [x] 5.2 Add logging for Batch Extraction stats (call reduction, token usage)
- [x] 5.3 Update system documentation and CHANGELOG
- [x] 5.4 Remove legacy loop-based extraction code
