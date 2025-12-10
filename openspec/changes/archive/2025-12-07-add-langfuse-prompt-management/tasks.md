# Tasks: Add Langfuse Prompt Management

## Prerequisites

- [x] 0.1 Verify `add-langfuse-observability` is implemented (LangfuseService exists with tracing)
- [x] 0.2 Verify Langfuse infrastructure is running (http://10.10.10.40:3011)

## 1. Core Infrastructure

### 1.1 Prompt Type Definitions

- [x] 1.1.1 Create `apps/server/src/modules/langfuse/prompts/types.ts` with prompt interfaces
- [x] 1.1.2 Define `EXTRACTION_PROMPT_NAMES` constant (entity, relationship, identity, quality)
- [x] 1.1.3 Export types from module index

### 1.2 LangfuseService Extension

- [x] 1.2.1 Add `getPrompt(name, version?)` method to `LangfuseService` (implemented as `getTextPrompt`/`getChatPrompt`)
- [x] 1.2.2 Add `compilePrompt(prompt, variables)` method
- [x] 1.2.3 Add `getPromptMetadata(prompt)` helper method
- [x] 1.2.4 Add unit tests for prompt fetching methods

### 1.3 Configuration

- [x] 1.3.1 Add `LANGFUSE_PROMPTS_ENABLED` to `AppConfigService` (uses `LANGFUSE_ENABLED` + `isPromptManagementAvailable()`)
- [x] 1.3.2 Add `LANGFUSE_PROMPT_CACHE_TTL` to `AppConfigService`
- [x] 1.3.3 Update `.env.example` with new environment variables
- [ ] 1.3.4 Update `docs/setup/` with prompt management configuration

## 2. Prompt Provider Service

### 2.1 Service Implementation

- [x] 2.1.1 Create `ExtractionPromptProvider` service in `apps/server/src/modules/extraction-jobs/llm/langgraph/prompts/prompt-provider.service.ts`
- [x] 2.1.2 Implement `getEntityExtractorPrompt()` with fallback
- [x] 2.1.3 Implement `getRelationshipBuilderPrompt()` with fallback
- [x] 2.1.4 Implement `getIdentityResolverPrompt()` with fallback (if applicable) - N/A, uses local prompts
- [x] 2.1.5 Implement `getQualityAuditorPrompt()` with fallback (if applicable) - N/A, uses local prompts
- [x] 2.1.6 Add provider to extraction jobs module

### 2.2 Unit Tests

- [x] 2.2.1 Test Langfuse prompt returned when available
- [x] 2.2.2 Test fallback when Langfuse disabled
- [x] 2.2.3 Test fallback on API error
- [x] 2.2.4 Test metadata returned correctly

## 3. LangGraph Node Integration

### 3.1 Node Factory Updates

- [x] 3.1.1 Update `createEntityExtractorNode()` to accept optional `ExtractionPromptProvider`
- [x] 3.1.2 Update `createRelationshipBuilderNode()` to accept optional `ExtractionPromptProvider`
- [x] 3.1.3 Update remaining nodes if they use prompts

### 3.2 Prompt Fetching in Nodes

- [x] 3.2.1 Entity extractor node: Fetch prompt and include metadata in observation
- [x] 3.2.2 Relationship builder node: Fetch prompt and include metadata

### 3.3 Provider Integration

- [x] 3.3.1 Update `LangGraphExtractionProvider` constructor to inject `ExtractionPromptProvider`
- [x] 3.3.2 Pass provider to all node factory functions
- [x] 3.3.3 Update module providers array

## 4. Prompt Seeding

### 4.1 Seed Script

- [x] 4.1.1 Create `scripts/seed-langfuse-prompts.ts`
- [x] 4.1.2 Import hardcoded prompts from existing prompt files
- [x] 4.1.3 Implement prompt creation with error handling (skip if exists)
- [x] 4.1.4 Add labels (production, development) to prompts
- [x] 4.1.5 Add config metadata (node type) to prompts
- [x] 4.1.6 Add npm script: `nx run repo-scripts:seed-langfuse-prompts` (added to scripts/project.json)

### 4.2 Documentation

- [ ] 4.2.1 Document seed script usage in README
- [ ] 4.2.2 Document prompt naming conventions
- [ ] 4.2.3 Document how to edit prompts in Langfuse UI

## 5. Integration Testing

### 5.1 Integration Tests

- [ ] 5.1.1 Test extraction job uses Langfuse prompt when available
- [ ] 5.1.2 Test extraction job falls back to hardcoded when Langfuse disabled
- [ ] 5.1.3 Test prompt metadata appears in Langfuse traces
- [ ] 5.1.4 Test prompt version is correctly linked to generation

### 5.2 Manual Testing

- [ ] 5.2.1 Seed prompts to local Langfuse instance
- [ ] 5.2.2 Run extraction job, verify prompt loaded from Langfuse
- [ ] 5.2.3 Edit prompt in Langfuse UI, verify change reflected (after cache TTL)
- [ ] 5.2.4 Disable Langfuse, verify fallback works
- [ ] 5.2.5 Check trace in Langfuse UI shows prompt version

## 6. Documentation

- [ ] 6.1 Create `docs/integrations/langfuse/PROMPT_MANAGEMENT.md`
- [ ] 6.2 Document prompt editing workflow in Langfuse UI
- [ ] 6.3 Document fallback behavior and troubleshooting
- [ ] 6.4 Document trace-prompt linking for debugging
- [ ] 6.5 Update `docs/integrations/langfuse/README.md` to reference prompt management
