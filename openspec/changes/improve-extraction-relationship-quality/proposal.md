# Change: Improve Extraction Relationship Quality (LangGraph Pipeline)

## Why

The current single-pass extraction mechanism suffers from "Node Fixation" - models focus on defining entities and neglect relationships. To solve this, we need a robust, stateful pipeline that decouples entity extraction from relationship linking and adapts to document types.

**Core Problem:**
LLMs often fail to create relationships between entities, especially when those entities are newly created or when document structure varies (e.g., Narrative vs. Legal).

**Solution:**
A **LangGraph** state-machine architecture that:

1. **Decouples** Entity Extraction (Node A) from Relationship Linking (Node B)
2. **Adapts** to document types via a Router (Node A)
3. **Resolves** identities deterministically via code (Node C)
4. **Validates** quality with a feedback loop (Node E)

## What Changes

### Architecture Shift: LangGraph Pipeline

We will replace the current linear provider logic with a LangGraph `StateGraph` containing 5 specialized nodes:

1. **Document_Router**: Classifies text (Narrative/Legal/Technical) to select extraction strategy.
2. **Entity_Extractor**: Extracts entities _only_ (high recall), assigning temp_ids.
3. **Identity_Resolver**: **Code-based node**. Resolves temp_ids to UUIDs via vector search.
4. **Relationship_Builder**: Connects the dots using resolved entities and original text.
5. **Quality_Auditor**: Checks for "orphan" entities and loops back for retry if quality checks fail.

### Key Components

- **GraphState**: Shared typed state (Pydantic/TypeScript interface) passing entities, resolved UUIDs, and relationships between nodes.
- **Strict Structured Output**: All LLM nodes use strict schema validation.
- **Feedback Loop**: Self-correction mechanism for orphan entities.

## Impact

- **Affected specs**: `entity-extraction` (updated to reflect pipeline architecture)
- **Affected code**:
  - `apps/server/src/modules/extraction-jobs/llm/langgraph.provider.ts` (NEW) - Main pipeline implementation
  - `apps/server/src/modules/extraction-jobs/llm/nodes/` (NEW) - Individual node implementations
  - `apps/server/src/modules/extraction-jobs/extraction-worker.service.ts` - Updated to use new pipeline
  - Template pack schemas - Updated to support category-specific prompts

## Success Metrics

- **Relationship Density**: >2.0 relationships per entity average
- **Orphan Rate**: <10% of entities without relationships
- **Resolution Accuracy**: >95% correct mapping of new vs. existing entities
- **Adaptability**: Successful extraction on both Bible (Narrative) and Contracts (Legal) without code changes
