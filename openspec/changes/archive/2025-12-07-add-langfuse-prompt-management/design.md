# Design: Langfuse Prompt Management for LangGraph Extraction

## Overview

This design describes how to integrate Langfuse Prompt Management into the LangGraph extraction pipeline, enabling centralized, versioned prompt management with runtime fetching and trace linking.

## System Context

```
┌─────────────────────────────────────────────────────────────────────┐
│                    LangGraph Extraction Pipeline                     │
├─────────────────────────────────────────────────────────────────────┤
│  Entity_Extractor → Identity_Resolver → Relationship_Builder →      │
│  Quality_Auditor                                                     │
└─────────────────────────────────────────────────────────────────────┘
                               │
          ┌────────────────────┼────────────────────┐
          │                    │                    │
          ▼                    ▼                    ▼
   ┌─────────────┐    ┌──────────────┐    ┌─────────────────┐
   │ Hardcoded   │    │ LangfuseService│    │ LangfuseCloud/  │
   │ Prompts     │    │ getPrompt()   │───▶│ Self-Hosted     │
   │ (fallback)  │    └──────────────┘    └─────────────────┘
   └─────────────┘            │
                              │
                    ┌─────────▼──────────┐
                    │ Prompt Objects     │
                    │ - name             │
                    │ - version          │
                    │ - template         │
                    │ - variables        │
                    └────────────────────┘
```

## Component Design

### 1. Prompt Registry (New Types)

**Location**: `apps/server/src/modules/langfuse/prompts/`

```typescript
// prompts/types.ts
export interface ExtractionPrompt {
  name: string;
  version?: number; // If omitted, uses latest
  template: string;
  variables: Record<string, any>;
}

// Prompt names used in the extraction pipeline
// Note: Document router was removed - pipeline uses schema-driven extraction
export const EXTRACTION_PROMPT_NAMES = {
  ENTITY_EXTRACTOR: 'extraction-entity-extractor',
  RELATIONSHIP_BUILDER: 'extraction-relationship-builder',
  IDENTITY_RESOLVER: 'extraction-identity-resolver',
  QUALITY_AUDITOR: 'extraction-quality-auditor',
} as const;

export type ExtractionPromptName =
  (typeof EXTRACTION_PROMPT_NAMES)[keyof typeof EXTRACTION_PROMPT_NAMES];
```

### 2. LangfuseService Extension

**Location**: `apps/server/src/modules/langfuse/langfuse.service.ts`

Add prompt fetching methods to existing service:

```typescript
import { TextPromptClient } from 'langfuse-node';

@Injectable()
export class LangfuseService implements OnModuleInit, OnModuleDestroy {
  // ... existing code ...

  /**
   * Fetch a prompt from Langfuse Prompt Management.
   * Uses built-in caching (default TTL: 60 seconds, configurable).
   *
   * @param name - Prompt name in Langfuse
   * @param version - Optional specific version (default: latest production)
   * @returns The prompt text, or null if not found/disabled
   */
  async getPrompt(
    name: string,
    version?: number
  ): Promise<TextPromptClient | null> {
    if (!this.langfuse) {
      this.logger.debug(
        `[getPrompt] Langfuse disabled, returning null for "${name}"`
      );
      return null;
    }

    try {
      this.logger.debug(
        `[getPrompt] Fetching prompt "${name}" v${version || 'latest'}`
      );
      const prompt = await this.langfuse.getPrompt(name, version, {
        type: 'text', // We use text prompts, not chat prompts
        cacheTtlSeconds: this.config.langfusePromptCacheTtl, // Default: 60
      });
      this.logger.debug(
        `[getPrompt] Retrieved prompt "${name}" v${prompt.version}`
      );
      return prompt;
    } catch (error) {
      this.logger.warn(
        `[getPrompt] Failed to fetch prompt "${name}": ${error.message}`
      );
      return null;
    }
  }

  /**
   * Compile a prompt with variables and link it to a generation for observability.
   *
   * @param prompt - The Langfuse prompt client
   * @param variables - Variables to interpolate into the template
   * @returns The compiled prompt string
   */
  compilePrompt(
    prompt: TextPromptClient,
    variables: Record<string, any>
  ): string {
    return prompt.compile(variables);
  }

  /**
   * Get prompt metadata for trace linking.
   * Call this when creating a generation to link prompt version to the trace.
   */
  getPromptMetadata(prompt: TextPromptClient): {
    promptName: string;
    promptVersion: number;
  } {
    return {
      promptName: prompt.name,
      promptVersion: prompt.version,
    };
  }
}
```

### 3. Configuration Extension

**AppConfigService Updates**:

```typescript
// In config.service.ts
get langfusePromptCacheTtl(): number {
  return parseInt(this.get('LANGFUSE_PROMPT_CACHE_TTL') || '60', 10);
}

get langfusePromptsEnabled(): boolean {
  // Separate flag to enable/disable prompt management independently of tracing
  return this.get('LANGFUSE_PROMPTS_ENABLED') !== 'false' && this.langfuseEnabled;
}
```

**.env.example additions**:

```bash
# Langfuse Prompt Management
LANGFUSE_PROMPTS_ENABLED=true        # Enable prompt fetching (requires LANGFUSE_ENABLED)
LANGFUSE_PROMPT_CACHE_TTL=60         # Prompt cache TTL in seconds
```

### 4. Prompt Provider Service (New)

**Location**: `apps/server/src/modules/extraction-jobs/llm/langgraph/prompt-provider.service.ts`

Centralized service for fetching extraction prompts with fallbacks:

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { LangfuseService } from '../../../../langfuse/langfuse.service';
import { EXTRACTION_PROMPT_NAMES } from '../../../../langfuse/prompts/types';
import * as FallbackPrompts from '../prompts';

@Injectable()
export class ExtractionPromptProvider {
  private readonly logger = new Logger(ExtractionPromptProvider.name);

  constructor(private readonly langfuseService: LangfuseService) {}

  /**
   * Get the entity extractor prompt.
   * Returns Langfuse version if available, otherwise falls back to hardcoded.
   */
  async getEntityExtractorPrompt(): Promise<{
    prompt: string;
    source: 'langfuse' | 'fallback';
    metadata?: { promptName: string; promptVersion: number };
  }> {
    return this.getPromptWithFallback(
      EXTRACTION_PROMPT_NAMES.ENTITY_EXTRACTOR,
      FallbackPrompts.ENTITY_EXTRACTOR_SYSTEM_PROMPT
    );
  }

  /**
   * Get the relationship builder prompt.
   */
  async getRelationshipBuilderPrompt(): Promise<{
    prompt: string;
    source: 'langfuse' | 'fallback';
    metadata?: { promptName: string; promptVersion: number };
  }> {
    return this.getPromptWithFallback(
      EXTRACTION_PROMPT_NAMES.RELATIONSHIP_BUILDER,
      FallbackPrompts.RELATIONSHIP_BUILDER_SYSTEM_PROMPT
    );
  }

  /**
   * Generic prompt fetcher with fallback logic.
   */
  private async getPromptWithFallback(
    langfuseName: string,
    fallbackPrompt: string
  ): Promise<{
    prompt: string;
    source: 'langfuse' | 'fallback';
    metadata?: { promptName: string; promptVersion: number };
  }> {
    try {
      const langfusePrompt = await this.langfuseService.getPrompt(langfuseName);

      if (langfusePrompt) {
        return {
          prompt: langfusePrompt.prompt,
          source: 'langfuse',
          metadata: this.langfuseService.getPromptMetadata(langfusePrompt),
        };
      }
    } catch (error) {
      this.logger.warn(
        `Failed to fetch Langfuse prompt "${langfuseName}", using fallback`
      );
    }

    return {
      prompt: fallbackPrompt,
      source: 'fallback',
    };
  }
}
```

### 5. LangGraph Node Integration

**Entity Extractor Node Update** (`apps/server/src/modules/extraction-jobs/llm/langgraph/nodes/entity-extractor.node.ts`):

```typescript
// Before: Import hardcoded prompt
import {
  buildEntityExtractionPrompt,
  ENTITY_EXTRACTOR_SYSTEM_PROMPT,
} from '../prompts/entity.prompts';

// After: Inject prompt provider
export function createEntityExtractorNode(
  config: EntityExtractorNodeConfig,
  promptProvider?: ExtractionPromptProvider // NEW: Optional provider
): ExtractionGraphNode {
  return async (
    state: ExtractionGraphState
  ): Promise<Partial<ExtractionGraphState>> => {
    const { documentText, objectSchemas, allowedTypes } = state;

    // Fetch prompt from Langfuse (with fallback)
    let systemPrompt = ENTITY_EXTRACTOR_SYSTEM_PROMPT;
    let promptSource: 'langfuse' | 'fallback' = 'fallback';
    let promptMetadata:
      | { promptName: string; promptVersion: number }
      | undefined;

    if (promptProvider) {
      const promptResult = await promptProvider.getEntityExtractorPrompt();
      systemPrompt = promptResult.prompt;
      promptSource = promptResult.source;
      promptMetadata = promptResult.metadata;
    }

    // Build final prompt with document and schema context
    const compiledPrompt = buildEntityExtractionPrompt(
      documentText,
      objectSchemas,
      allowedTypes,
      systemPrompt // Pass custom system prompt
    );

    // Create observation with prompt metadata
    const observation = langfuseService.createObservation(
      state.traceId,
      'entity_extraction',
      { prompt: compiledPrompt.substring(0, 500) },
      {
        ...promptMetadata,
        promptSource,
      },
      state.parentSpanId
    );

    // ... rest of extraction logic ...
  };
}
```

### 6. Prompt Seeding Script

**Location**: `scripts/seed-langfuse-prompts.ts`

```typescript
import { Langfuse } from 'langfuse-node';
import * as dotenv from 'dotenv';
import { ENTITY_EXTRACTOR_SYSTEM_PROMPT } from '../apps/server/src/modules/extraction-jobs/llm/langgraph/prompts/entity.prompts';
import { RELATIONSHIP_BUILDER_SYSTEM_PROMPT } from '../apps/server/src/modules/extraction-jobs/llm/langgraph/prompts/relationship.prompts';

dotenv.config();

const PROMPTS_TO_SEED = [
  {
    name: 'extraction-entity-extractor',
    prompt: ENTITY_EXTRACTOR_SYSTEM_PROMPT,
    labels: ['production'],
    config: { category: 'extraction', node: 'entity' },
  },
  {
    name: 'extraction-relationship-builder',
    prompt: RELATIONSHIP_BUILDER_SYSTEM_PROMPT,
    labels: ['production'],
    config: { category: 'extraction', node: 'relationship' },
  },
];

async function seedPrompts() {
  const langfuse = new Langfuse({
    publicKey: process.env.LANGFUSE_PUBLIC_KEY!,
    secretKey: process.env.LANGFUSE_SECRET_KEY!,
    baseUrl: process.env.LANGFUSE_HOST || 'http://localhost:3010',
  });

  console.log('Seeding Langfuse prompts...\n');

  for (const promptDef of PROMPTS_TO_SEED) {
    try {
      await langfuse.createPrompt({
        name: promptDef.name,
        type: 'text',
        prompt: promptDef.prompt,
        labels: promptDef.labels,
        config: promptDef.config,
      });
      console.log(`✓ Created prompt: ${promptDef.name}`);
    } catch (error: any) {
      if (error.message?.includes('already exists')) {
        console.log(`○ Prompt already exists: ${promptDef.name}`);
      } else {
        console.error(`✗ Failed to create ${promptDef.name}:`, error.message);
      }
    }
  }

  await langfuse.shutdownAsync();
  console.log('\nDone!');
}

seedPrompts().catch(console.error);
```

## Data Flow

### Prompt Fetching Flow

```
Extraction Job Starts
        │
        ▼
┌─────────────────────────┐
│ ExtractionPromptProvider│
│ getEntityExtractorPrompt│
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐     ┌─────────────────────────┐
│   LangfuseService       │     │   Langfuse API          │
│   getPrompt(name)       │────▶│   (Cloud/Self-hosted)   │
└───────────┬─────────────┘     └───────────┬─────────────┘
            │                               │
            │ ◄───── Cache Hit ─────────────┤
            │        (TTL: 60s)             │
            ▼                               ▼
┌─────────────────────────┐     ┌─────────────────────────┐
│ Prompt Found?           │     │ API Response            │
│ YES: Use Langfuse prompt│◄────│ { prompt, version, ... }│
│ NO:  Use fallback       │     └─────────────────────────┘
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│ Compile with variables  │
│ Link to trace metadata  │
└───────────┬─────────────┘
            │
            ▼
     Use in LLM call
```

### Trace Linking Flow

```
Generation Observation
        │
        ├── input: { prompt, variables }
        ├── metadata: {
        │       promptName: 'extraction-entity-extractor',
        │       promptVersion: 3,
        │       promptSource: 'langfuse'
        │   }
        ├── output: { entities: [...] }
        └── usage: { promptTokens, completionTokens }

In Langfuse UI:
┌─────────────────────────────────────────────────────────────────┐
│ Trace: Extraction Job abc123                                    │
├─────────────────────────────────────────────────────────────────┤
│ ├── Span: entity_extraction                                     │
│ │   └── Generation: gemini-1.5-pro                              │
│ │       Prompt: extraction-entity-extractor (v3) ◄── Clickable  │
│ │       Tokens: 1,234 prompt / 567 completion                   │
│ │       Output: 12 entities extracted                           │
│ ├── Span: relationship_extraction                               │
│ │   └── Generation: gemini-1.5-pro                              │
│ │       Prompt: extraction-relationship-builder (v2)            │
│ │       Tokens: 2,100 prompt / 890 completion                   │
│ │       Output: 8 relationships extracted                       │
└─────────────────────────────────────────────────────────────────┘
```

### Graceful Degradation

```typescript
async getPromptWithFallback(name: string, fallback: string) {
  // 1. Check if Langfuse is enabled
  if (!this.langfuseService.isEnabled()) {
    return { prompt: fallback, source: 'fallback' };
  }

  // 2. Try to fetch from Langfuse
  try {
    const langfusePrompt = await this.langfuseService.getPrompt(name);
    if (langfusePrompt) {
      return { prompt: langfusePrompt.prompt, source: 'langfuse', metadata: {...} };
    }
  } catch (error) {
    // Log but don't throw - extraction must continue
    this.logger.warn(`Langfuse prompt fetch failed for "${name}": ${error.message}`);
  }

  // 3. Fall back to hardcoded prompt
  return { prompt: fallback, source: 'fallback' };
}
```

### Cache Behavior

The Langfuse SDK handles caching automatically:

- **Cache hit**: Returns cached prompt immediately (no network call)
- **Cache miss**: Fetches from API, caches for `cacheTtlSeconds`
- **API error**: Returns cached value if available, otherwise null
- **First fetch**: Always makes API call, caches result

Recommended TTL values:

- **Development**: 10 seconds (fast iteration)
- **Production**: 60-300 seconds (reduce API calls)

## Testing Strategy

### Unit Tests

```typescript
describe('ExtractionPromptProvider', () => {
  it('should return Langfuse prompt when available', async () => {
    mockLangfuseService.getPrompt.mockResolvedValue({
      name: 'extraction-entity-extractor',
      version: 3,
      prompt: 'You are an expert...',
    });

    const result = await provider.getEntityExtractorPrompt();

    expect(result.source).toBe('langfuse');
    expect(result.metadata?.promptVersion).toBe(3);
  });

  it('should fall back to hardcoded prompt when Langfuse disabled', async () => {
    mockLangfuseService.isEnabled.mockReturnValue(false);

    const result = await provider.getEntityExtractorPrompt();

    expect(result.source).toBe('fallback');
    expect(result.prompt).toContain('expert knowledge graph builder');
  });

  it('should fall back on Langfuse API error', async () => {
    mockLangfuseService.getPrompt.mockRejectedValue(new Error('Network error'));

    const result = await provider.getEntityExtractorPrompt();

    expect(result.source).toBe('fallback');
  });
});
```

### Integration Tests

```typescript
describe('LangGraph with Langfuse Prompts', () => {
  it('should use Langfuse prompt in extraction and link to trace', async () => {
    // Setup: Seed test prompt
    await langfuse.createPrompt({
      name: 'extraction-entity-extractor',
      prompt: 'Test prompt: Extract entities from {{document}}',
    });

    // Execute extraction
    const result = await extractionProvider.extract(document);

    // Verify trace includes prompt metadata
    const traces = await langfuse.fetchTraces({ name: 'extraction-job-*' });
    const generation = traces[0].observations[0];
    expect(generation.metadata.promptName).toBe('extraction-entity-extractor');
  });
});
```

## Migration Plan

### Phase 1: Add Prompt Fetching (No Behavior Change)

1. Add `getPrompt()` method to `LangfuseService`
2. Add `ExtractionPromptProvider` service
3. Add prompt type definitions
4. Unit tests for new code
5. **Result**: New code exists but isn't used yet

### Phase 2: Seed Initial Prompts

1. Create seed script
2. Run seed script to populate Langfuse with current hardcoded prompts
3. Verify prompts visible in Langfuse UI
4. **Result**: Prompts exist in Langfuse, matching hardcoded versions

### Phase 3: Wire Up LangGraph Nodes

1. Update node factory functions to accept `ExtractionPromptProvider`
2. Update `LangGraphExtractionProvider` to inject provider
3. Update each node to fetch prompt from provider
4. Add metadata to trace observations
5. Integration tests
6. **Result**: Pipeline uses Langfuse prompts (with hardcoded fallbacks)

### Phase 4: Enable & Validate

1. Enable `LANGFUSE_PROMPTS_ENABLED=true` in development
2. Run extraction jobs, verify prompts loaded from Langfuse
3. Verify trace linking in Langfuse UI
4. Test fallback by disabling Langfuse temporarily
5. Deploy to staging, validate
6. Deploy to production
7. **Result**: Full prompt management enabled

## Rollback Plan

1. **Immediate**: Set `LANGFUSE_PROMPTS_ENABLED=false` - falls back to hardcoded prompts instantly
2. **If prompts are invalid**: Edit in Langfuse UI, or set env var to disable
3. **Code rollback**: Revert commits; fallback prompts still work
4. **Data**: No data migration needed; prompts are additive

## Open Questions

1. **Prompt templating syntax**: Should we use Langfuse's `{{variable}}` syntax or compile prompts in our code?
   - Recommendation: Use Langfuse templating for simple variable substitution, compile in code for complex logic
2. **Version pinning**: Should we pin prompt versions in code or always use `production` label?

   - Recommendation: Use `production` label for flexibility; pin versions only for critical prompts

3. **Multi-environment**: Should dev/staging/prod use different Langfuse projects?

   - Recommendation: Yes, separate projects to avoid accidental production prompt changes

4. **Prompt review workflow**: Should prompt changes require code review or is Langfuse's versioning sufficient?
   - Recommendation: Use Langfuse's built-in audit trail; add Slack notifications for production prompt changes
