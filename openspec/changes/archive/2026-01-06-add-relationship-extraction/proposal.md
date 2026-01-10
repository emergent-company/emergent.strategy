# Change: Add Relationship Extraction Support

## Why

The current entity extraction pipeline only extracts isolated entities. It ignores relationships defined in template packs (e.g., `PARENT_OF`, `WROTE`), leading to a disconnected graph. To build a true Knowledge Graph, we must extract and persist relationships between entities.

## What Changes

- **LLM Provider**: Update to use Agentic Tool Calling (`bindTools`) instead of simple JSON prompting.
- **Tools**: Define `extract_entity` and `extract_relationship` tools for the LLM.
- **Extraction Worker**: Implement a two-phase processing logic (Entities first, then Relationships) with strict server-side verification to prevent hallucinations.
- **Schema Loading**: Update logic to load `relationship_type_schemas` from template packs and pass them to the LLM.
- **Interfaces**: Update `ExtractionResult` to include `relationships`.

## Impact

- **Affected specs**: `entity-extraction` (new capability)
- **Affected code**:
  - `apps/server/src/modules/extraction-jobs/extraction-worker.service.ts`
  - `apps/server/src/modules/extraction-jobs/llm/langchain-gemini.provider.ts`
  - `apps/server/src/modules/extraction-jobs/llm/llm-provider.interface.ts`
