# Add Langfuse Prompt Management

## Why

The LangGraph extraction pipeline currently uses **hardcoded prompts** in TypeScript files (`apps/server/src/modules/extraction-jobs/llm/langgraph/prompts/*.ts`). This approach has several limitations:

1. **Requires redeployment for changes**: Any prompt tweak requires a code change, PR, and deployment
2. **No version history**: Cannot easily compare prompt versions or understand what changed
3. **No A/B testing**: Cannot test prompt variations in production
4. **Developer-only editing**: Non-technical team members (domain experts, prompt engineers) cannot contribute
5. **No observability link**: Cannot correlate extraction quality with specific prompt versions

Langfuse Prompt Management provides centralized prompt storage with versioning, A/B testing, and trace linking. This complements the existing `add-langfuse-observability` proposal (which covers tracing) by adding prompt lifecycle management.

## What Changes

Extend the existing `LangfuseService` to support prompt management for the LangGraph extraction pipeline:

1. **Prompt Fetching** - Add methods to fetch prompts from Langfuse with caching
2. **Prompt Types** - Define TypeScript types for extraction prompts (entity, relationship)
3. **LangGraph Integration** - Update LangGraph nodes to fetch prompts dynamically instead of importing hardcoded strings
4. **Trace Linking** - Link fetched prompts to generation observations for debugging
5. **Fallback Strategy** - Graceful degradation to hardcoded prompts if Langfuse is unavailable
6. **Seed Script** - Script to create initial prompts in Langfuse from existing hardcoded prompts

## Impact

**Benefits**:

- **Fast iteration**: Edit prompts in Langfuse UI, see changes immediately (with cache TTL)
- **Version control**: Track prompt versions, compare performance, rollback if needed
- **A/B testing**: Deploy prompt experiments to subset of extractions
- **Collaboration**: Domain experts can suggest prompt improvements via Langfuse
- **Debugging**: Trace shows exactly which prompt version produced specific results
- **Audit trail**: Know who changed what prompt and when

**Affected Files**:

- `apps/server/src/modules/langfuse/langfuse.service.ts` - Add prompt fetching methods
- `apps/server/src/modules/langfuse/prompts/types.ts` - New prompt type definitions
- `apps/server/src/modules/extraction-jobs/llm/langgraph-extraction.provider.ts` - Use fetched prompts
- `apps/server/src/modules/extraction-jobs/llm/langgraph/nodes/*.ts` - Inject prompts from provider
- `apps/server/src/modules/extraction-jobs/llm/langgraph/prompts/*.ts` - Keep as fallbacks
- `scripts/seed-langfuse-prompts.ts` - New script to seed prompts

**Dependencies**:

- Requires `add-langfuse-observability` to be implemented first (LangfuseService foundation) ✅ Done
- Uses existing `langfuse-node` SDK (already installed)

**Risks & Mitigations**:

- **Latency on prompt fetch**: Use Langfuse SDK's built-in caching (configurable TTL); prompts rarely change
- **Langfuse unavailable**: Fallback to hardcoded prompts; extraction continues working
- **Prompt format mismatch**: Type-safe prompt interfaces validate structure at runtime
- **Migration complexity**: Seed script ensures prompts exist before switching; gradual rollout via feature flag
