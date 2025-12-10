# Design: LangGraph Entity Extraction Pipeline

## Context

The current single-pass extraction pipeline is insufficient for complex graph construction. It suffers from "Node Fixation" and lacks adaptability. We are moving to a state-machine architecture using **LangGraph** (via LangChain.js) to orchestrate a multi-step extraction process.

## Goals

- **Robustness**: Decouple entity extraction from relationship linking.
- **Adaptability**: Handle different document types (Narrative, Legal) with specialized strategies.
- **Accuracy**: Resolve identities deterministically using vector search, not LLM hallucination.
- **Quality Assurance**: Self-correct "orphan" entities before finalizing.

## Architecture: The Graph State Machine

We will implement a `StateGraph` with the following components.

### 1. Graph State (Shared Memory)

The state object passed between nodes:

```typescript
interface Entity {
  name: string;
  type: string;
  description: string;
  temp_id: string; // Critical for internal linking
  properties: Record<string, any>;
}

interface Relationship {
  source_ref: string; // temp_id or UUID
  target_ref: string; // temp_id or UUID
  type: string;
  description: string;
}

interface GraphState {
  // Inputs
  original_text: string;
  file_metadata: Record<string, any>;
  existing_entities: ExistingEntityContext[]; // For resolution

  // Internal Processing
  doc_category: 'narrative' | 'legal' | 'technical' | 'other';
  extracted_entities: Entity[];
  resolved_uuid_map: Record<string, string>; // temp_id -> Real UUID

  // Outputs
  final_relationships: Relationship[];

  // Control Flow
  quality_check_passed: boolean;
  retry_count: number;
  feedback_log: string[];
}
```

### 2. Nodes (The Agents)

#### Node A: Document_Router

- **Input**: `original_text` (first 2k chars)
- **Role**: Classify document type.
- **Prompt**: "Analyze this text. Return JSON: {'category': 'narrative' | 'legal' | 'other'}."
- **Output**: Updates `doc_category`.

#### Node B: Entity_Extractor (The Specialist)

- **Input**: `original_text`, `doc_category`
- **Role**: Extract NODES only. High recall focus.
- **Prompt**:
  - If narrative: "Focus on characters, emotional themes, locations."
  - If legal: "Focus on defined terms, parties, effective dates."
  - **Constraint**: "Assign a short, unique `temp_id` to every entity."
- **Output**: Updates `extracted_entities`.

#### Node C: Identity_Resolver (The Linker)

- **Input**: `extracted_entities`, `existing_entities` (context)
- **Role**: **CODE-BASED NODE** (No LLM).
- **Logic**:
  1. Loop through `extracted_entities`.
  2. Check `existing_entities` context for name match (fuzzy > 0.90).
  3. If Match: Map `temp_id` → `existing_UUID`.
  4. Else: Map `temp_id` → `generate_new_UUID()`.
- **Output**: Updates `resolved_uuid_map`.

#### Node D: Relationship_Builder (The Connector)

- **Input**: `original_text`, `extracted_entities` (with temp_ids), `doc_category`
- **Role**: Connect the dots.
- **Prompt**: "Here is the text. Here are the Entities found (with IDs). Output a list of relationships. Constraint: You MUST use the provided `temp_ids` for source/target."
- **Output**: Updates `final_relationships`.

#### Node E: Quality_Auditor (The Critic)

- **Input**: `final_relationships`, `extracted_entities`
- **Role**: Check for "Orphans" (Entities with 0 relationships).
- **Logic**:
  1. Identify entities not in `source_ref` or `target_ref` of any relationship.
  2. If orphans > 0:
     - `quality_check_passed` = false
     - `feedback_log`.push("Entities [X, Y] are orphans. Find their connections.")
  3. Else: `quality_check_passed` = true
- **Output**: Updates control flow flags.

### 3. Control Flow (The Edges)

1. **START** → `Document_Router`
2. `Document_Router` → `Entity_Extractor`
3. `Entity_Extractor` → `Identity_Resolver`
4. `Identity_Resolver` → `Relationship_Builder`
5. `Relationship_Builder` → `Quality_Auditor`
6. **Conditional Edge** at `Quality_Auditor`:
   - If `quality_check_passed` == true: → **END**
   - If `quality_check_passed` == false AND `retry_count` < 3: → `Relationship_Builder`
   - If `quality_check_passed` == false AND `retry_count` >= 3: → **END** (Log warning)

## Implementation Details

- **Framework**: LangGraph.js
- **Validation**: Zod schemas for all tool outputs
- **Prompt Management**: Templates stored in `extraction-prompts.ts`, selected by category

## Trade-offs

- **Latency**: Slower than single-pass (multiple LLM calls). Mitigated by parallelizing where possible (though this pipeline is largely sequential).
- **Cost**: Higher token usage due to multiple passes and retries.
- **Complexity**: More moving parts than a single prompt.
- **Benefit**: Significantly higher quality, density, and robustness.

## Parallel Service Architecture

The LangGraph extraction pipeline will be implemented as a **parallel, swappable service** that coexists with the existing extraction logic. This enables:

1. **Zero-risk deployment** - Old extraction keeps working unchanged
2. **Easy A/B testing** - Compare results side-by-side on same documents
3. **Gradual rollout** - Feature flag to switch between implementations
4. **Easy rollback** - If issues arise, instantly revert to original

### Interface Contract

Both the existing `LangChainGeminiProvider` and the new `LangGraphExtractionProvider` will implement the same `ILLMProvider` interface:

```typescript
// From llm-provider.interface.ts (unchanged)
interface ILLMProvider {
  extractEntities(
    documentContent: string,
    extractionPrompt: string,
    options: ExtractionOptions
  ): Promise<ExtractionResult>;

  isConfigured(): boolean;
  getName(): string;
}
```

### New File Structure

```
apps/server/src/modules/extraction-jobs/
├── llm/
│   ├── llm-provider.interface.ts        # Unchanged - shared contract
│   ├── llm-provider.factory.ts          # Updated - strategy selection
│   ├── langchain-gemini.provider.ts     # Unchanged - existing provider
│   └── langgraph/                       # NEW - LangGraph implementation
│       ├── langgraph-extraction.provider.ts  # Implements ILLMProvider
│       ├── state.ts                          # GraphState definition
│       ├── nodes/
│       │   ├── document-router.node.ts
│       │   ├── entity-extractor.node.ts
│       │   ├── identity-resolver.node.ts
│       │   ├── relationship-builder.node.ts
│       │   └── quality-auditor.node.ts
│       ├── prompts/
│       │   ├── router.prompts.ts
│       │   ├── entity.prompts.ts
│       │   └── relationship.prompts.ts
│       └── index.ts
```

### Factory Pattern Update

The `LLMProviderFactory` will be updated to select the provider based on configuration:

```typescript
// llm-provider.factory.ts (updated)
@Injectable()
export class LLMProviderFactory {
  private provider: ILLMProvider | null = null;

  constructor(
    private readonly config: AppConfigService,
    private readonly langChainProvider: LangChainGeminiProvider,
    private readonly langGraphProvider: LangGraphExtractionProvider // NEW
  ) {
    this.initializeProvider();
  }

  private initializeProvider() {
    // Select provider based on feature flag
    const pipelineMode = this.config.extractionPipelineMode; // 'single_pass' | 'langgraph'

    if (pipelineMode === 'langgraph' && this.langGraphProvider.isConfigured()) {
      this.provider = this.langGraphProvider;
      this.logger.log(
        `Using LLM provider: ${this.provider.getName()} (LangGraph pipeline)`
      );
    } else if (this.langChainProvider.isConfigured()) {
      this.provider = this.langChainProvider;
      this.logger.log(
        `Using LLM provider: ${this.provider.getName()} (single-pass)`
      );
    } else {
      this.logger.warn('No LLM provider configured');
    }
  }

  getProvider(): ILLMProvider {
    if (!this.provider) {
      throw new Error('No LLM provider configured');
    }
    return this.provider;
  }
}
```

### Configuration

New environment variables:

```bash
# Feature flag: 'single_pass' (default) or 'langgraph'
EXTRACTION_PIPELINE_MODE=single_pass

# Optional: LangGraph-specific tuning
LANGGRAPH_MAX_RETRIES=3
LANGGRAPH_ORPHAN_THRESHOLD=0.10  # Max % orphan entities before retry
```

### No Changes Required

The following components remain **completely unchanged**:

- `extraction-worker.service.ts` - Already uses `ILLMProvider` interface via factory
- `extraction-job.service.ts` - Job management unaffected
- `extraction-job.controller.ts` - API unchanged
- `entity-linking.service.ts` - Post-extraction linking unchanged
- All schemas in `schemas/` - Unchanged

### Migration Plan

1. **Phase 1: Build** - Implement `LangGraphExtractionProvider` implementing `ILLMProvider`
2. **Phase 2: Test** - Run both providers on test documents, compare outputs
3. **Phase 3: Shadow Mode** - Run LangGraph in parallel, log results without persisting
4. **Phase 4: Gradual Rollout** - Enable for specific projects via config
5. **Phase 5: Default** - Switch default after verification
