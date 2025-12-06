## 1. Interface & Infrastructure

- [x] 1.1 Update `ExtractionResult` interface in `llm-provider.interface.ts` to include `ExtractedRelationship[]`.
- [x] 1.2 Update `ILLMProvider.extractEntities` signature to accept `relationshipSchemas` via `ExtractionOptions`.
- [x] 1.3 Add `ExtractedRelationship` type definition with hybrid `EntityReference` (name or id).
- [x] 1.4 Add `ExistingEntityContext` type for passing known entities to LLM.
- [x] 1.5 Add `ExtractionOptions` interface consolidating all extraction parameters.

## 2. LLM Provider Implementation

- [x] 2.1 Update `LangChainGeminiProvider` to accept `ExtractionOptions` (includes relationshipSchemas).
- [x] 2.2 Switch from `responseMimeType: 'application/json'` to `bindTools()` (dual-mode: tool model added).
- [x] 2.3 Define `extract_entity` tool with Zod schema (in `extraction-tools.ts`).
- [x] 2.4 Define `extract_relationship` tool with Zod schema (in `extraction-tools.ts`).
- [x] 2.5 Update prompt to instruct on relationship extraction using name references (`buildToolExtractionPrompt`).
- [x] 2.6 Map tool calls back to `ExtractionResult` format (`extractWithToolBinding` + `extractWithToolBindingFull`).

## 3. Extraction Worker Updates

- [x] 3.1 Update `loadExtractionConfig` to fetch `relationship_type_schemas` from template packs.
- [x] 3.2 Update `ExtractionWorker` to pass `relationshipSchemas` to `extractEntities`.
- [x] 3.3 Implement Phase 1: Persist Entities and build `BatchEntityMap`.
- [x] 3.4 Implement Phase 2: Resolve and Verify Relationships.
  - [x] 3.4.1 Resolve source/target by name (Batch Map -> DB Lookup).
  - [x] 3.4.2 Validate against `relationship_type_schemas`.
  - [x] 3.4.3 Drop invalid relationships and log warnings.
  - [x] 3.4.4 Create valid relationships using `GraphService.createRelationship`.

## 4. Testing & Verification

- [x] 4.1 Unit test `LangChainGeminiProvider` tool binding and response parsing.
- [x] 4.2 Unit test `ExtractionWorker` verification logic (mock LLM output with valid/invalid edges).
- [x] 4.3 End-to-end test with a sample document and Template Pack.
