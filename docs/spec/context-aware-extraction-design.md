# Context-Aware Extraction Design

## The Smart Approach

Instead of blindly re-extracting and merging, we **inject existing entity context** into the extraction prompt, so the LLM:

1. **Knows** what entities already exist in the knowledge graph
2. **Recognizes** when it encounters these entities in the text
3. **Enriches** them with missing fields only
4. **Creates** new entities only when truly new
5. **Links** entities intelligently using existing canonical_ids

## Architecture

### Flow Diagram

```
Document to Extract
        ↓
1. Pre-Extraction: Query Existing Entities
   ↓
   Query: Find all entities in this project by type
   Result: [
     { canonical_id: "abc-123", name: "Peter", role: "apostle", ... },
     { canonical_id: "def-456", name: "John", role: "apostle", ... }
   ]
        ↓
2. Build Context-Enhanced Prompt
   ↓
   System Prompt:
   "You are extracting entities. Here are entities that ALREADY EXIST in the knowledge graph:

   EXISTING PERSONS:
   - Peter (canonical_id: abc-123): apostle, fisherman, from Bethsaida
   - John (canonical_id: def-456): apostle, fisherman, brother of James

   When you encounter these entities in the text:
   1. Reference them by canonical_id
   2. ONLY extract NEW information not already present
   3. If schema has new fields, extract those
   4. Return: { canonical_id: 'abc-123', enrichment: { new_field: value } }

   For NEW entities not in the list, extract normally."
        ↓
3. LLM Extraction with Context
   ↓
   LLM Response:
   {
     "entities": [
       {
         "canonical_id": "abc-123",         // Existing entity
         "action": "enrich",
         "new_fields": {
           "eye_color": "brown",            // Only new information
           "hair_color": null
         }
       },
       {
         "name": "Thomas",                   // New entity
         "action": "create",
         "role": "apostle",
         ...
       }
     ]
   }
        ↓
4. Smart Processing
   ↓
   For existing entities (action="enrich"):
     - Fetch current version
     - Merge only new_fields
     - Create new version

   For new entities (action="create"):
     - Create new object
     - Set canonical_id
        ↓
5. Result: Enriched + New Entities
```

## Implementation Design

### Step 1: Modify Extraction Config

Add enrichment mode to extraction configuration:

```typescript
interface ExtractionConfig {
  // ... existing fields ...

  // NEW: Enrichment mode
  enrichment_mode?: 'disabled' | 'context_aware' | 'targeted_fields';

  // NEW: Provide existing entities as context
  provide_existing_entities?: boolean;

  // NEW: Specify which fields are new (for targeted extraction)
  new_fields?: Record<string, string[]>; // { "Person": ["eye_color"], "Place": ["elevation"] }

  // NEW: How many existing entities to include as context
  context_entity_limit?: number; // Default: 100 per type
}
```

### Step 2: Fetch Existing Entities

Before extraction, load existing entities from the knowledge graph:

```typescript
// In extraction-worker.service.ts

async function loadExistingEntitiesContext(
  projectId: string,
  entityTypes: string[],
  limit: number = 100
): Promise<Record<string, ExistingEntityContext[]>> {
  const context: Record<string, ExistingEntityContext[]> = {};

  for (const type of entityTypes) {
    const entities = await db.query(
      `
      SELECT 
        canonical_id,
        key as name,
        properties,
        version,
        created_at
      FROM kb.graph_objects
      WHERE project_id = $1
        AND type = $2
        AND deleted_at IS NULL
        AND supersedes_id IS NULL  -- Only latest versions
      ORDER BY created_at DESC
      LIMIT $3
    `,
      [projectId, type, limit]
    );

    context[type] = entities.rows.map((e) => ({
      canonical_id: e.canonical_id,
      name: e.properties.name || e.name,
      summary: buildEntitySummary(e.properties), // Key facts about entity
      schema_version: e.properties._schema_version || '1.0.0',
      missing_fields: detectMissingFields(e.properties, type), // Fields that are null/undefined
    }));
  }

  return context;
}

interface ExistingEntityContext {
  canonical_id: string;
  name: string;
  summary: string; // e.g., "Peter: apostle, fisherman, from Bethsaida"
  schema_version: string;
  missing_fields: string[]; // ["eye_color", "hair_color"]
}

function buildEntitySummary(properties: any): string {
  const parts: string[] = [];

  // Include key identifying properties
  if (properties.role) parts.push(properties.role);
  if (properties.occupation) parts.push(properties.occupation);
  if (properties.birth_location)
    parts.push(`from ${properties.birth_location}`);

  return parts.join(', ');
}

function detectMissingFields(properties: any, entityType: string): string[] {
  const schema = getSchemaForType(entityType);
  const missing: string[] = [];

  for (const [field, fieldSchema] of Object.entries(schema.properties || {})) {
    if (field.startsWith('_')) continue; // Skip internal fields
    if (properties[field] === undefined || properties[field] === null) {
      missing.push(field);
    }
  }

  return missing;
}
```

### Step 3: Build Context-Enhanced Prompt

Modify the extraction prompt to include existing entities:

```typescript
// In langchain-gemini.provider.ts - enhance buildTypeSpecificPrompt()

private buildTypeSpecificPrompt(
  typeName: string,
  basePrompt: string,
  documentContent: string,
  objectSchema?: any,
  existingEntities?: ExistingEntityContext[]  // NEW PARAMETER
): string {
  let prompt = basePrompt + '\n\n';

  // NEW: Inject existing entities as context
  if (existingEntities && existingEntities.length > 0) {
    prompt += `**IMPORTANT: EXISTING ${typeName.toUpperCase()} ENTITIES IN KNOWLEDGE GRAPH**\n\n`;
    prompt += `The following ${typeName} entities ALREADY EXIST in the knowledge graph. When you encounter these in the text:\n`;
    prompt += `1. Reference them by their canonical_id\n`;
    prompt += `2. Extract ONLY NEW information not already present\n`;
    prompt += `3. Return: { "canonical_id": "<id>", "action": "enrich", "new_fields": {...} }\n\n`;

    prompt += `EXISTING ENTITIES:\n`;
    for (const entity of existingEntities.slice(0, 50)) {  // Limit to avoid token overflow
      prompt += `  - ${entity.name} (canonical_id: ${entity.canonical_id})\n`;
      prompt += `    Current info: ${entity.summary}\n`;
      if (entity.missing_fields.length > 0) {
        prompt += `    Missing fields: ${entity.missing_fields.join(', ')}\n`;
      }
    }

    if (existingEntities.length > 50) {
      prompt += `  ... and ${existingEntities.length - 50} more existing entities\n`;
    }

    prompt += `\n`;
    prompt += `For entities NOT in this list, extract normally as new entities.\n\n`;
  }

  prompt += `**Entity Type to Extract:** ${typeName}\n\n`;

  // ... rest of existing prompt building

  return prompt;
}
```

### Step 4: Update Extraction Response Schema

Modify the response to support both creation and enrichment:

```typescript
// Update Zod schema to support enrichment actions

const enrichmentSchema = z.object({
  canonical_id: z.string().uuid().describe('Canonical ID of existing entity'),
  action: z
    .literal('enrich')
    .describe('Indicates this is enrichment of existing entity'),
  new_fields: z
    .record(z.any())
    .describe('Only the NEW fields being added/updated'),
  confidence: z.number().min(0).max(1).optional(),
});

const creationSchema = z.object({
  name: z.string(),
  action: z
    .literal('create')
    .optional()
    .describe('Indicates this is a new entity'),
  // ... all other Person fields
  confidence: z.number().min(0).max(1).optional(),
});

const personSchema = z.discriminatedUnion('action', [
  enrichmentSchema,
  creationSchema,
]);

const arraySchema = z.object({
  entities: z.array(personSchema),
});
```

### Step 5: Process Mixed Results

Handle both enrichment and creation in the extraction worker:

```typescript
// In extraction-worker.service.ts

for (const entity of extractionResult.entities) {
  if (entity.canonical_id && entity.action === 'enrich') {
    // ENRICHMENT PATH
    console.log(`Enriching existing entity: ${entity.canonical_id}`);

    // Find current version of entity by canonical_id
    const existingObject = await db.query(`
      SELECT id, properties, version
      FROM kb.graph_objects
      WHERE canonical_id = $1
        AND deleted_at IS NULL
        AND supersedes_id IS NULL
      LIMIT 1
    `, [entity.canonical_id]);

    if (existingObject.rows.length > 0) {
      const current = existingObject.rows[0];

      // Merge ONLY new fields
      const enrichedProperties = {
        ...current.properties,
        ...entity.new_fields,  // Only the new/missing fields
        _schema_version: '2.1.0',
        _enriched_at: new Date().toISOString(),
        _enriched_fields: Object.keys(entity.new_fields)
      };

      // Create new version
      await graphService.patchObject(current.id, {
        properties: enrichedProperties,
        change_summary: {
          type: 'enrichment',
          fields_added: Object.keys(entity.new_fields),
          extraction_job_id: job.id
        }
      });

      console.log(`✓ Enriched ${Object.keys(entity.new_fields).length} fields`);
    }
  } else {
    // CREATION PATH (existing logic)
    // Create new entity as normal
    await graphService.createObject({...});
  }
}
```

## Example: Smart Extraction in Action

### Scenario: Adding `eye_color` field to Person schema

**Document Content:**

```
Peter, the fisherman from Bethsaida, had brown eyes and was known for his boldness.
John, his fellow apostle, was tall with dark hair. Thomas, another disciple,
doubted the resurrection.
```

**Existing Entities in Knowledge Graph:**

```json
[
  {
    "canonical_id": "abc-123",
    "name": "Peter",
    "role": "apostle",
    "occupation": "fisherman",
    "birth_location": "Bethsaida",
    "_schema_version": "2.0.0"
  },
  {
    "canonical_id": "def-456",
    "name": "John",
    "role": "apostle",
    "_schema_version": "2.0.0"
  }
]
```

**Context-Enhanced Prompt to LLM:**

```
**IMPORTANT: EXISTING PERSON ENTITIES IN KNOWLEDGE GRAPH**

The following Person entities ALREADY EXIST. When you encounter them:
1. Reference by canonical_id
2. Extract ONLY NEW information
3. Return: { "canonical_id": "<id>", "action": "enrich", "new_fields": {...} }

EXISTING ENTITIES:
  - Peter (canonical_id: abc-123)
    Current info: apostle, fisherman, from Bethsaida
    Missing fields: eye_color, hair_color, height

  - John (canonical_id: def-456)
    Current info: apostle
    Missing fields: eye_color, hair_color, height, occupation, birth_location

For entities NOT in this list, extract normally as new entities.

**Entity Type to Extract:** Person

**Schema:** (includes eye_color, hair_color fields)

**Document:**
Peter, the fisherman from Bethsaida, had brown eyes and was known for his boldness.
John, his fellow apostle, was tall with dark hair. Thomas, another disciple,
doubted the resurrection.

Extract ALL Person entities. For existing entities, provide canonical_id and ONLY new fields.
```

**Smart LLM Response:**

```json
{
  "entities": [
    {
      "canonical_id": "abc-123",
      "action": "enrich",
      "new_fields": {
        "eye_color": "brown" // ONLY the new information found
      },
      "confidence": 0.9
    },
    {
      "canonical_id": "def-456",
      "action": "enrich",
      "new_fields": {
        "hair_color": "dark" // ONLY the new information found
      },
      "confidence": 0.85
    },
    {
      "name": "Thomas", // New entity - not in existing list
      "action": "create",
      "role": "disciple",
      "confidence": 0.8
    }
  ]
}
```

**Processing Result:**

```
✓ Enriched Peter (abc-123): Added eye_color="brown"
✓ Enriched John (def-456): Added hair_color="dark"
✓ Created new entity: Thomas (disciple)
```

## Benefits vs. Dumb Re-Extraction

### Old Approach (Dumb)

```
1. Extract all entities blindly
2. For each entity, check if exists
3. If exists, merge ALL properties
4. Creates unnecessary database queries
5. LLM wastes tokens re-extracting known info
```

### New Approach (Smart)

```
1. Load existing entities ONCE upfront
2. Inject into context
3. LLM recognizes existing entities
4. Extracts ONLY new/missing information
5. Uses canonical_id for precise targeting
```

### Token Savings Example

**Document:** 2000 tokens  
**Existing context:** 500 tokens (50 entities × 10 tokens each)

**Dumb approach:**

- Extract 3 existing entities: 3 × 200 tokens = 600 tokens
- Total wasted: 600 tokens (re-extracting known info)

**Smart approach:**

- Context provided once: 500 tokens
- Extract only new fields: 3 × 20 tokens = 60 tokens
- Net savings: 40 tokens (600 - 500 - 60)

**For 1000 documents:**

- Dumb: 600,000 wasted tokens
- Smart: Net cost reduction (especially with many entities)

## Implementation Files

### 1. Update LLM Provider Interface

```typescript
// apps/server/src/modules/extraction-jobs/llm/llm-provider.interface.ts

export interface ExtractionContext {
  existing_entities?: Record<string, ExistingEntityContext[]>;
  enrichment_mode?: boolean;
  new_fields?: Record<string, string[]>;
}

export interface ILLMProvider {
  extractEntities(
    documentContent: string,
    extractionPrompt: string,
    objectSchemas: Record<string, any>,
    allowedTypes?: string[],
    context?: ExtractionContext // NEW PARAMETER
  ): Promise<ExtractionResult>;
}
```

### 2. Update Extraction Worker

```typescript
// apps/server/src/modules/extraction-jobs/extraction-worker.service.ts

async processExtractionJob(job: ExtractionJobDto) {
  // ... existing code ...

  // NEW: Load existing entities if enrichment mode enabled
  let existingEntitiesContext: Record<string, ExistingEntityContext[]> | undefined;

  if (job.extraction_config?.enrichment_mode === 'context_aware') {
    existingEntitiesContext = await this.loadExistingEntitiesContext(
      job.project_id,
      allowedTypes,
      job.extraction_config?.context_entity_limit || 100
    );

    this.logger.log(`Loaded ${Object.keys(existingEntitiesContext).length} entity type contexts`);
  }

  // Call LLM with context
  const extractionResult = await llmProvider.extractEntities(
    documentContent,
    extractionPrompt,
    objectSchemas,
    allowedTypes,
    {
      existing_entities: existingEntitiesContext,
      enrichment_mode: job.extraction_config?.enrichment_mode === 'context_aware',
      new_fields: job.extraction_config?.new_fields
    }
  );

  // Process results - handle both 'enrich' and 'create' actions
  for (const entity of extractionResult.entities) {
    if (entity.action === 'enrich' && entity.canonical_id) {
      await this.enrichExistingEntity(entity.canonical_id, entity.new_fields, job.id);
    } else {
      await this.createNewEntity(entity, job.id);
    }
  }
}
```

### 3. Update Gemini Provider

```typescript
// apps/server/src/modules/extraction-jobs/llm/langchain-gemini.provider.ts

async extractEntities(
  documentContent: string,
  extractionPrompt: string,
  objectSchemas: Record<string, any>,
  allowedTypes?: string[],
  context?: ExtractionContext  // NEW
): Promise<ExtractionResult> {
  // ... existing chunking logic ...

  for (const chunk of chunks) {
    for (const typeName of typesToExtract) {
      const result = await this.extractEntitiesForType(
        typeName,
        chunk,
        basePrompt,
        objectSchemas[typeName],
        context?.existing_entities?.[typeName]  // Pass existing entities
      );

      allEntities.push(...result.entities);
    }
  }

  return { entities: allEntities, ... };
}

private async extractEntitiesForType(
  typeName: string,
  documentContent: string,
  basePrompt: string,
  objectSchema?: any,
  existingEntities?: ExistingEntityContext[]  // NEW
): Promise<{ entities: ExtractedEntity[]; ... }> {
  // Build context-enhanced prompt
  const typePrompt = this.buildTypeSpecificPrompt(
    typeName,
    basePrompt,
    documentContent,
    objectSchema,
    existingEntities  // NEW - inject context
  );

  // Update Zod schema to support enrichment
  const enrichmentAction = z.object({
    canonical_id: z.string().uuid(),
    action: z.literal('enrich'),
    new_fields: z.record(z.any()),
    confidence: z.number().optional()
  });

  const createAction = z.object({
    name: z.string(),
    action: z.literal('create').optional(),
    ...  // all schema fields
  });

  const entitySchema = z.discriminatedUnion('action', [
    enrichmentAction,
    createAction
  ]);

  const arraySchema = z.object({
    entities: z.array(entitySchema)
  });

  // Call LLM with enhanced schema
  const result = await structuredModel.invoke(typePrompt);

  return result;
}
```

### 4. Add Enrichment Helper Method

```typescript
// In extraction-worker.service.ts

async enrichExistingEntity(
  canonical_id: string,
  newFields: Record<string, any>,
  jobId: string
): Promise<void> {
  // Get latest version of entity
  const entity = await db.query(`
    SELECT id, properties
    FROM kb.graph_objects
    WHERE canonical_id = $1
      AND deleted_at IS NULL
      AND supersedes_id IS NULL
    LIMIT 1
  `, [canonical_id]);

  if (entity.rows.length === 0) {
    this.logger.warn(`Entity ${canonical_id} not found for enrichment`);
    return;
  }

  const current = entity.rows[0];

  // Merge ONLY the new fields (don't override existing data)
  const enrichedProperties = {
    ...current.properties,
  };

  // Only add new_fields if they're currently null/undefined
  for (const [field, value] of Object.entries(newFields)) {
    if (current.properties[field] === undefined || current.properties[field] === null) {
      enrichedProperties[field] = value;
    } else {
      this.logger.debug(`Field ${field} already exists, keeping original value`);
    }
  }

  // Add enrichment metadata
  enrichedProperties._enriched_at = new Date().toISOString();
  enrichedProperties._enriched_by_job = jobId;
  enrichedProperties._enriched_fields = [
    ...(enrichedProperties._enriched_fields || []),
    ...Object.keys(newFields)
  ];

  // Create new version
  await this.graphService.patchObject(current.id, {
    properties: enrichedProperties,
    change_summary: {
      type: 'enrichment',
      fields_enriched: Object.keys(newFields),
      job_id: jobId
    }
  });

  this.logger.log(`Enriched entity ${canonical_id} with ${Object.keys(newFields).length} new fields`);
}
```

## Usage

### Example 1: Context-Aware Extraction

```typescript
POST /api/extraction-jobs
{
  "project_id": "uuid",
  "source_type": "document",
  "source_id": "document-uuid",
  "extraction_config": {
    "entity_types": ["Person", "Place"],
    "enrichment_mode": "context_aware",        // NEW: Enable smart mode
    "provide_existing_entities": true,         // NEW: Inject context
    "context_entity_limit": 100,               // NEW: How many to include
    "entity_linking_strategy": "key_match",
    "duplicate_strategy": "merge",
    "confidence_threshold": 0.7
  }
}
```

### Example 2: Targeted Field Enrichment

```typescript
POST /api/extraction-jobs
{
  "project_id": "uuid",
  "source_type": "document",
  "source_id": "document-uuid",
  "extraction_config": {
    "entity_types": ["Person"],
    "enrichment_mode": "targeted_fields",  // NEW: Only extract specific fields
    "new_fields": {
      "Person": ["eye_color", "hair_color", "height"]
    },
    "provide_existing_entities": true,
    "confidence_threshold": 0.7
  }
}
```

**Prompt sent to LLM:**

```
EXISTING PERSON: Peter (canonical_id: abc-123)
Current info: apostle, fisherman, from Bethsaida

NEW FIELDS TO EXTRACT FOR THIS ENTITY:
- eye_color
- hair_color
- height

Extract ONLY these 3 fields for Peter from the text.
```

## Implementation Priority

### Phase 1: Basic Context Injection (Week 1)

- [ ] Add `provide_existing_entities` config option
- [ ] Implement `loadExistingEntitiesContext()`
- [ ] Modify prompt to include existing entities list
- [ ] LLM returns mixed create/enrich actions
- [ ] Test on sample document

### Phase 2: Discriminated Response Handling (Week 2)

- [ ] Update Zod schemas with enrichment action
- [ ] Implement `enrichExistingEntity()` method
- [ ] Handle both creation and enrichment in worker
- [ ] Add enrichment metadata tracking

### Phase 3: Targeted Field Extraction (Week 3)

- [ ] Add `new_fields` configuration
- [ ] Build targeted prompts for specific fields
- [ ] Schema diff detection
- [ ] Field-level enrichment logic

## See Also

- `/docs/spec/extraction-enrichment-strategy.md` - Full strategy document
- `/apps/server/src/modules/extraction-jobs/extraction-worker.service.ts` - Worker implementation
- `/apps/server/src/modules/extraction-jobs/llm/langchain-gemini.provider.ts` - LLM provider
