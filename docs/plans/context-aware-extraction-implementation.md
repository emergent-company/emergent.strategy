# Context-Aware Extraction - Implementation Plan

## Vision

Transform extraction from a **blind re-processing** system to an **intelligent enrichment** system where the LLM:

- **Knows** what entities already exist before reading the document
- **Recognizes** existing entities as it reads
- **Enriches** with only missing/new information
- **Decides** whether to create new or enrich existing
- **Links** using canonical_ids for precision

## The Smart Prompt Pattern

### Before (Dumb)

```
System: Extract Person entities from this text.
User: [2000 token document]

LLM: Extracted 5 entities (all treated as new)
System: Check database... oh, 4 already exist, merge them
```

### After (Smart)

```
System: Extract Person entities. Here are existing entities:
- Peter (abc-123): apostle, fisherman, from Bethsaida [missing: eye_color]
- John (def-456): apostle [missing: eye_color, occupation]

When you see these, return: { canonical_id, action: "enrich", new_fields: {...} }
For new entities, return: { name, action: "create", ...all_fields }

User: [2000 token document]

LLM:
- Peter (abc-123): enrich with { eye_color: "brown" }
- John (def-456): enrich with { eye_color: null, occupation: "fisherman" }
- Thomas: create new { name: "Thomas", role: "apostle", ... }
```

## Implementation Steps

### Step 1: Update LLM Provider Interface

**File:** `apps/server/src/modules/extraction-jobs/llm/llm-provider.interface.ts`

```typescript
export interface ExistingEntityContext {
  canonical_id: string;
  name: string;
  key_properties: Record<string, any>; // Identifying info
  missing_fields: string[]; // Fields that are null/undefined
  schema_version: string;
}

export interface ExtractionContext {
  existing_entities?: Record<string, ExistingEntityContext[]>;
  mode?: 'normal' | 'enrichment';
  target_fields?: Record<string, string[]>; // Type → fields to focus on
}

export interface ExtractedEntity {
  type_name: string;

  // For new entities
  name?: string;
  description?: string;
  business_key?: string;
  properties?: Record<string, any>;

  // For enriching existing entities
  canonical_id?: string;
  action?: 'create' | 'enrich';
  new_fields?: Record<string, any>; // Only new/updated fields

  confidence?: number;
}

export interface ILLMProvider {
  extractEntities(
    documentContent: string,
    extractionPrompt: string,
    objectSchemas: Record<string, any>,
    allowedTypes?: string[],
    context?: ExtractionContext // NEW: Provide existing entities
  ): Promise<ExtractionResult>;
}
```

### Step 2: Load Existing Entities Before Extraction

**File:** `apps/server/src/modules/extraction-jobs/extraction-worker.service.ts`

```typescript
/**
 * Load existing entities from the knowledge graph to provide as context
 */
private async loadExistingEntitiesContext(
  projectId: string,
  entityTypes: string[],
  options: {
    limit?: number;
    include_properties?: string[];  // Which properties to include in context
    only_with_missing_fields?: boolean;  // Only entities with null fields
  } = {}
): Promise<Record<string, ExistingEntityContext[]>> {
  const limit = options.limit || 100;
  const context: Record<string, ExistingEntityContext[]> = {};

  for (const type of entityTypes) {
    const schema = await this.getSchemaForType(type, projectId);
    const allSchemaFields = Object.keys(schema?.properties || {});

    // Query existing entities
    const result = await this.db.query(`
      SELECT
        canonical_id,
        key,
        properties,
        version,
        properties->>'_schema_version' as schema_version
      FROM kb.graph_objects
      WHERE project_id = $1
        AND type = $2
        AND deleted_at IS NULL
        AND supersedes_id IS NULL
      ORDER BY created_at DESC
      LIMIT $3
    `, [projectId, type, limit]);

    context[type] = result.rows.map(row => {
      const props = row.properties;

      // Detect missing fields
      const missing = allSchemaFields.filter(field =>
        !field.startsWith('_') &&  // Skip internal fields
        (props[field] === null || props[field] === undefined)
      );

      // Build concise summary of key properties
      const keyProps: Record<string, any> = {};
      const importantFields = ['role', 'occupation', 'type', 'region', 'category'];
      for (const field of importantFields) {
        if (props[field]) keyProps[field] = props[field];
      }

      return {
        canonical_id: row.canonical_id,
        name: props.name || row.key,
        key_properties: keyProps,
        missing_fields: missing,
        schema_version: row.schema_version || '1.0.0'
      };
    });

    this.logger.log(
      `Loaded ${context[type].length} existing ${type} entities as context ` +
      `(avg ${context[type].reduce((sum, e) => sum + e.missing_fields.length, 0) / context[type].length} missing fields per entity)`
    );
  }

  return context;
}

/**
 * Process extraction job with context awareness
 */
async processExtractionJob(job: ExtractionJobDto): Promise<void> {
  // ... existing code ...

  // NEW: Check if enrichment mode enabled
  const enrichmentMode = job.extraction_config?.enrichment_mode;
  const provideContext = job.extraction_config?.provide_existing_entities;

  let extractionContext: ExtractionContext | undefined;

  if (provideContext && enrichmentMode) {
    // Load existing entities from KG
    const existingEntities = await this.loadExistingEntitiesContext(
      job.project_id,
      allowedTypes,
      {
        limit: job.extraction_config?.context_entity_limit || 100,
        only_with_missing_fields: enrichmentMode === 'targeted_fields'
      }
    );

    extractionContext = {
      existing_entities: existingEntities,
      mode: enrichmentMode,
      target_fields: job.extraction_config?.new_fields
    };

    this.logger.log(
      `Extraction context prepared: ${Object.keys(existingEntities).length} entity types, ` +
      `mode=${enrichmentMode}`
    );
  }

  // Call LLM with context
  const extractionResult = await llmProvider.extractEntities(
    documentContent,
    extractionPrompt,
    objectSchemas,
    allowedTypes,
    extractionContext  // NEW: Pass context
  );

  // Process results intelligently
  for (const entity of extractionResult.entities) {
    if (entity.action === 'enrich' && entity.canonical_id) {
      // ENRICHMENT: Update existing entity with only new fields
      await this.enrichExistingEntity(
        entity.canonical_id,
        entity.new_fields || {},
        job.id
      );
      outcome = 'merged';
    } else {
      // CREATION: Create new entity as normal
      await this.createNewEntity(entity, job);
      outcome = 'created';
    }
  }
}
```

### Step 3: Enhance LLM Provider with Context

**File:** `apps/server/src/modules/extraction-jobs/llm/langchain-gemini.provider.ts`

```typescript
async extractEntities(
  documentContent: string,
  extractionPrompt: string,
  objectSchemas: Record<string, any>,
  allowedTypes?: string[],
  context?: ExtractionContext  // NEW PARAMETER
): Promise<ExtractionResult> {
  if (!this.isConfigured()) {
    throw new Error('LangChain Gemini provider not configured');
  }

  const startTime = Date.now();
  const allEntities: ExtractedEntity[] = [];

  // Split document into chunks
  const chunks = await this.splitDocumentIntoChunks(documentContent);

  // Determine which types to extract
  const typesToExtract = allowedTypes || Object.keys(objectSchemas);

  // Extract from each chunk
  for (const chunk of chunks) {
    for (const typeName of typesToExtract) {
      const result = await this.extractEntitiesForType(
        typeName,
        chunk,
        extractionPrompt,
        objectSchemas[typeName],
        context?.existing_entities?.[typeName],  // NEW: Pass existing entities
        context?.target_fields?.[typeName]        // NEW: Pass target fields
      );

      allEntities.push(...result.entities);
    }
  }

  return {
    entities: allEntities,
    total_extracted: allEntities.length,
    extraction_time_ms: Date.now() - startTime
  };
}

private async extractEntitiesForType(
  typeName: string,
  documentContent: string,
  basePrompt: string,
  objectSchema?: any,
  existingEntities?: ExistingEntityContext[],  // NEW
  targetFields?: string[]                       // NEW
): Promise<{ entities: ExtractedEntity[] }> {
  // Build context-enhanced prompt
  const typePrompt = this.buildContextAwarePrompt(
    typeName,
    basePrompt,
    documentContent,
    objectSchema,
    existingEntities,
    targetFields
  );

  // Create discriminated union schema for enrichment vs creation
  const enrichmentSchema = z.object({
    canonical_id: z.string().uuid(),
    action: z.literal('enrich'),
    new_fields: z.record(z.any()),
    confidence: z.number().min(0).max(1).optional()
  });

  const creationSchema = this.buildCreationSchema(typeName, objectSchema);

  // Use discriminated union if we have existing entities
  const responseSchema = existingEntities && existingEntities.length > 0
    ? z.object({
        entities: z.array(
          z.discriminatedUnion('action', [enrichmentSchema, creationSchema])
        )
      })
    : z.object({
        entities: z.array(creationSchema)
      });

  const structuredModel = this.model!.withStructuredOutput(responseSchema);
  const result = await structuredModel.invoke(typePrompt);

  return {
    entities: this.transformToExtractedEntities(result.entities, typeName)
  };
}

/**
 * Build context-aware extraction prompt
 */
private buildContextAwarePrompt(
  typeName: string,
  basePrompt: string,
  documentContent: string,
  objectSchema: any,
  existingEntities?: ExistingEntityContext[],
  targetFields?: string[]
): string {
  let prompt = basePrompt + '\n\n';

  // CONTEXT INJECTION
  if (existingEntities && existingEntities.length > 0) {
    prompt += `═══════════════════════════════════════════════════════\n`;
    prompt += `EXISTING ${typeName.toUpperCase()} ENTITIES IN KNOWLEDGE GRAPH\n`;
    prompt += `═══════════════════════════════════════════════════════\n\n`;

    prompt += `The following ${typeName} entities ALREADY EXIST in the knowledge graph.\n`;
    prompt += `When you encounter these entities in the text:\n\n`;

    prompt += `**ACTION REQUIRED:**\n`;
    prompt += `1. Identify the entity by name\n`;
    prompt += `2. Return: { "canonical_id": "<id>", "action": "enrich", "new_fields": {...} }\n`;
    prompt += `3. In "new_fields", include ONLY:\n`;
    prompt += `   - Fields that are currently missing (null/empty)\n`;
    prompt += `   - New information found in the text\n`;
    prompt += `   - DO NOT include information already stored\n\n`;

    if (targetFields && targetFields.length > 0) {
      prompt += `**FOCUS FIELDS (extract these specifically):**\n`;
      for (const field of targetFields) {
        const fieldSchema = objectSchema?.properties?.[field];
        prompt += `  - ${field}: ${fieldSchema?.description || ''}\n`;
      }
      prompt += `\n`;
    }

    prompt += `**EXISTING ENTITIES:**\n\n`;

    // List existing entities with their current state
    for (const entity of existingEntities.slice(0, 50)) {
      prompt += `• ${entity.name} (canonical_id: \`${entity.canonical_id}\`)\n`;

      if (Object.keys(entity.key_properties).length > 0) {
        const propStr = Object.entries(entity.key_properties)
          .map(([k, v]) => `${k}=${v}`)
          .join(', ');
        prompt += `  Current: ${propStr}\n`;
      }

      if (entity.missing_fields.length > 0) {
        const missingStr = entity.missing_fields.join(', ');
        prompt += `  Missing: ${missingStr}\n`;
      } else {
        prompt += `  Complete: All fields populated\n`;
      }

      prompt += `\n`;
    }

    if (existingEntities.length > 50) {
      prompt += `... and ${existingEntities.length - 50} more existing entities\n\n`;
    }

    prompt += `**FOR NEW ENTITIES** (not in the list above):\n`;
    prompt += `Return: { "name": "...", "action": "create", ...all_schema_fields }\n\n`;

    prompt += `═══════════════════════════════════════════════════════\n\n`;
  }

  // ... rest of existing prompt building (schema, examples, etc.)

  prompt += `**Document Content:**\n\n${documentContent}\n\n`;

  if (existingEntities && existingEntities.length > 0) {
    prompt += `**Extract ${typeName} entities:**\n`;
    prompt += `- For EXISTING entities (in the list): return canonical_id + new_fields only\n`;
    prompt += `- For NEW entities: return complete entity data\n`;
  } else {
    prompt += `**Extract all ${typeName} entities from the document.**\n`;
  }

  return prompt;
}
```

## Configuration Examples

### Example 1: Smart Enrichment (All Fields)

```typescript
POST /api/extraction-jobs
{
  "project_id": "uuid",
  "source_type": "document",
  "source_id": "genesis-1-uuid",
  "extraction_config": {
    "entity_types": ["Person", "Place"],

    // ENABLE SMART MODE
    "enrichment_mode": "context_aware",
    "provide_existing_entities": true,
    "context_entity_limit": 100,  // Top 100 entities per type

    "confidence_threshold": 0.7
  }
}
```

**What happens:**

1. System loads 100 most recent Person and Place entities
2. Injects them into extraction prompt
3. LLM sees "Peter already exists, has role='apostle', missing eye_color"
4. LLM extracts: `{ canonical_id: "abc-123", action: "enrich", new_fields: { eye_color: "brown" } }`
5. System updates only the new field

### Example 2: Targeted Field Enrichment

```typescript
POST /api/extraction-jobs
{
  "project_id": "uuid",
  "source_type": "document",
  "source_id": "genesis-1-uuid",
  "extraction_config": {
    "entity_types": ["Person"],

    // FOCUS ON SPECIFIC FIELDS
    "enrichment_mode": "targeted_fields",
    "provide_existing_entities": true,
    "new_fields": {
      "Person": ["eye_color", "hair_color", "height"]
    },

    "confidence_threshold": 0.7
  }
}
```

**Prompt sent to LLM:**

```
EXISTING PERSON ENTITIES:
• Peter (abc-123)
  Current: role=apostle, occupation=fisherman
  Missing: eye_color, hair_color, height

**FOCUS FIELDS (extract these specifically):**
  - eye_color: Eye color if mentioned
  - hair_color: Hair color if mentioned
  - height: Physical height if mentioned

For Peter, extract ONLY: eye_color, hair_color, height
If the text says "Peter had brown eyes", return:
{ canonical_id: "abc-123", action: "enrich", new_fields: { eye_color: "brown" } }
```

## Advanced Features

### Feature 1: Fuzzy Name Matching

LLM can handle name variations:

```
Existing: Peter (canonical_id: abc-123)
Text mentions: "Simon Peter", "Cephas", "Peter the apostle"
LLM recognizes all as same person, uses canonical_id: abc-123
```

### Feature 2: Confidence-Based Enrichment

```typescript
{
  "canonical_id": "abc-123",
  "action": "enrich",
  "new_fields": {
    "eye_color": "brown"
  },
  "confidence": 0.95,  // High confidence
  "reasoning": "Text explicitly states 'Peter had brown eyes'"
}
```

### Feature 3: Conflict Detection

```typescript
// Existing: eye_color = "blue"
// New extraction: eye_color = "brown"

LLM Response:
{
  "canonical_id": "abc-123",
  "action": "enrich",
  "new_fields": {
    "eye_color": "brown"
  },
  "conflict_detected": true,
  "conflict_details": {
    "field": "eye_color",
    "existing_value": "blue",
    "new_value": "brown",
    "resolution": "needs_review"
  }
}

// System marks for manual review instead of auto-merging
```

### Feature 4: Relationship Context

Provide related entities as additional context:

```
Existing: Peter (abc-123)
  Related entities:
    - CHILD_OF → John (father)
    - MEMBER_OF → Twelve Apostles
    - BORN_IN → Bethsaida

This helps LLM understand: "Peter, son of John" refers to the same Peter
```

## Benefits

### 1. Token Efficiency

**Without Context:**

- Process 1000-entity document
- Extract all 1000 (500 already exist)
- 500 unnecessary extractions

**With Context:**

- Provide list of 500 existing entities: +5,000 tokens once
- LLM recognizes them: 500 × 20 tokens = 10,000 tokens (just canonical_id + new fields)
- Extracts 500 new entities: 500 × 200 tokens = 100,000 tokens
- Total: 115,000 tokens vs 200,000 tokens (42% savings!)

### 2. Data Quality

- **No duplication** - LLM knows what exists
- **Precise enrichment** - Only adds missing fields
- **Preserved data** - Doesn't override existing values
- **Smart linking** - Uses canonical_ids from the start

### 3. Incremental Learning

```
Extract Run 1: Create Peter with basic info
Extract Run 2: Add eye_color to schema, re-extract → enriches Peter
Extract Run 3: Add relationships to schema → enriches with relationships
...

Each run builds on previous knowledge!
```

## Implementation Checklist

- [ ] Update `llm-provider.interface.ts` with ExtractionContext
- [ ] Add `loadExistingEntitiesContext()` to extraction-worker
- [ ] Add `enrichment_mode` config to extraction_config
- [ ] Update Gemini provider `extractEntities()` signature
- [ ] Implement `buildContextAwarePrompt()`
- [ ] Create discriminated union Zod schema (enrich | create)
- [ ] Add `enrichExistingEntity()` method to worker
- [ ] Update extraction result processing logic
- [ ] Add enrichment metadata tracking
- [ ] Test on Bible sample document
- [ ] Measure token savings
- [ ] Add conflict detection logic
- [ ] Build monitoring for enrichment vs creation ratio

## Testing Plan

### Test 1: Basic Context Awareness

```
Setup:
- Existing: Peter (apostle, fisherman)
- Schema: Add eye_color field
- Document: "Peter had brown eyes"

Expected:
- LLM returns: { canonical_id: peter-id, action: "enrich", new_fields: { eye_color: "brown" } }
- System enriches Peter
- No duplicate Peter created
```

### Test 2: Mixed Enrichment and Creation

```
Setup:
- Existing: Peter, John
- Document: "Peter had brown eyes. John was tall. Thomas doubted."

Expected:
- Enrich Peter with eye_color
- Enrich John with height
- Create new entity: Thomas
```

### Test 3: No Enrichment Needed

```
Setup:
- Existing: Peter (complete profile, all fields filled)
- Document: "Peter was an apostle"

Expected:
- LLM recognizes Peter
- Returns: { canonical_id: peter-id, action: "enrich", new_fields: {} }
- No changes made (no new info)
```

## Next Steps

1. Implement basic context injection (Phase 1)
2. Test with sample Bible document
3. Measure token savings
4. Implement targeted field mode (Phase 2)
5. Add conflict detection
6. Build enrichment monitoring dashboard

This transforms extraction from a dumb re-processing system into an intelligent knowledge graph enrichment engine!
