# Extraction Enrichment Strategy

## Problem Statement

When a schema is updated with new fields (e.g., adding `eye_color` to Person entity), we need a way to:

1. Re-extract information from source documents for existing entities
2. Enrich existing objects with new properties without duplicating entities
3. Provide context to the LLM about what was already extracted
4. Ensure the LLM focuses only on new fields

## Current System Capabilities

### ✅ Existing Features (Already Implemented)

The system **already has** entity merging capabilities:

#### 1. Entity Linking Strategies

**Configuration:** `extraction_config.entity_linking_strategy`

Available strategies:

- `"key_match"` - Match by business key or normalized name
- `"vector_similarity"` - Semantic similarity matching
- `"fuzzy"` - Alias for vector_similarity
- `"always_new"` - Always create new entities (no deduplication)

**Current behavior:**

```typescript
// From entity-linking.service.ts:504-560

async decideMergeAction(entity, projectId, strategy):
  if (strategy === 'always_new'):
    return { action: 'create' }

  existingObject = findSimilarObject(entity, projectId, strategy)

  if (!existingObject):
    return { action: 'create' }

  overlap = calculatePropertyOverlap(entity, existingObject.properties)

  if (overlap > 0.9):  // 90% overlap
    return { action: 'skip', existingObjectId }  // Skip duplicate
  else:
    return { action: 'merge', existingObjectId }  // Merge new info
```

#### 2. Property Merging

**From entity-linking.service.ts:414-443:**

```typescript
async mergeEntityIntoObject(existingObjectId, entity, jobId):
  existingObject = await getObject(existingObjectId)

  // Merge properties (new values override existing)
  mergedProperties = {
    ...existingObject.properties,   // Keep old properties
    ...entity.properties,             // Add/override with new
    name: entity.name,
    description: entity.description || existingObject.description,
    _extraction_last_updated_by_job: jobId,
    _extraction_last_updated_at: now()
  }

  // Creates new version with merged properties
  await patchObject(existingObjectId, { properties: mergedProperties })
```

#### 3. Duplicate Strategy

**Configuration:** `extraction_config.duplicate_strategy`

Values:

- `"skip"` - Skip creating duplicate entities (default)
- `"merge"` - Merge into existing entity (creates new version)

### ❌ Missing Features (Need Implementation)

1. **Context-aware extraction** - Don't send existing info to LLM, only ask for new fields
2. **Schema diff detection** - Automatically detect new fields added to schema
3. **Targeted enrichment prompts** - Generate prompts focusing on missing fields
4. **Enrichment mode** - Special extraction mode specifically for enriching existing entities

## Proposed Enrichment Strategies

### Strategy 1: Full Re-Extraction with Merge (Quick Win)

**Use Case:** Simple schema updates, small number of new fields

**How it works:**

1. Update schema with new fields (e.g., add `eye_color` to Person)
2. Re-run extraction on same documents with `entity_linking_strategy: "key_match"`
3. System automatically merges new information into existing entities
4. New versions created with enriched properties

**Pros:**

- ✅ Uses existing merge capability
- ✅ No code changes needed
- ✅ Simple to execute

**Cons:**

- ⚠️ LLM re-processes all information (wasteful)
- ⚠️ Higher token cost
- ⚠️ Slower for large datasets

**Implementation:**

```bash
# 1. Update schema with new field
npm run seed:bible-template  # Adds eye_color field

# 2. Re-run extraction with merge strategy
POST /api/extraction-jobs
{
  "project_id": "uuid",
  "source_type": "document",
  "source_id": "document-uuid",
  "extraction_config": {
    "entity_types": ["Person"],
    "entity_linking_strategy": "key_match",  // Match existing entities
    "duplicate_strategy": "merge",           // Merge new info
    "confidence_threshold": 0.7
  }
}
```

### Strategy 2: Targeted Field Extraction (Optimal)

**Use Case:** Large datasets, many new fields, cost-sensitive

**How it works:**

1. Detect new fields added to schema (schema diff)
2. Load existing entity data
3. Generate custom extraction prompt focusing ONLY on new fields
4. Send existing entity data + new fields prompt to LLM
5. Merge results into existing entities

**Pros:**

- ✅ Minimal token usage (only new fields)
- ✅ Faster extraction
- ✅ Lower cost
- ✅ Focused LLM attention

**Cons:**

- ⚠️ Requires new code
- ⚠️ More complex prompt engineering
- ⚠️ Need schema diffing capability

**Implementation:**

**Step 1: Schema Diff Detection**

```typescript
// Compare old vs new schema to find new fields
interface SchemaDiff {
  entityType: string;
  addedFields: string[];
  modifiedFields: string[];
  removedFields: string[];
}

function compareSchemas(oldSchema, newSchema): SchemaDiff {
  const addedFields = Object.keys(newSchema.properties).filter(
    key => !oldSchema.properties[key]
  );

  return {
    entityType: newSchema.type,
    addedFields,
    modifiedFields: [],  // Fields with changed types/descriptions
    removedFields: []     // Deprecated fields
  };
}

// Example result:
{
  entityType: "Person",
  addedFields: ["eye_color", "hair_color", "height"],
  modifiedFields: [],
  removedFields: []
}
```

**Step 2: Enrichment Extraction Prompt**

```typescript
// Generate targeted extraction prompt
function generateEnrichmentPrompt(
  entityType: string,
  existingEntity: any,
  newFields: string[],
  fieldSchemas: Record<string, any>
): string {
  return `You are enriching an existing ${entityType} entity with additional information.

EXISTING ENTITY:
${JSON.stringify(existingEntity, null, 2)}

NEW FIELDS TO EXTRACT:
${newFields
  .map((field) => {
    const schema = fieldSchemas[field];
    return `- ${field}: ${schema.description}`;
  })
  .join('\n')}

TASK:
Read the source text and extract ONLY the new fields listed above for this ${entityType}.
Do NOT re-extract existing information.
Focus ONLY on: ${newFields.join(', ')}

Return a JSON object with ONLY the new fields.

Example response:
{
  "eye_color": "brown",
  "hair_color": "dark",
  "height": "average"
}`;
}
```

**Step 3: Enrichment Extraction Job**

```typescript
// New extraction mode: 'enrichment'
POST /api/extraction-jobs/enrich
{
  "project_id": "uuid",
  "entity_type": "Person",
  "mode": "enrichment",
  "schema_version_from": "2.0.0",
  "schema_version_to": "2.1.0",
  "new_fields": ["eye_color", "hair_color", "height"],
  "batch_config": {
    "batch_size": 50,
    "max_concurrent": 5
  }
}
```

### Strategy 3: Incremental Batch Enrichment (Production-Ready)

**Use Case:** Large production datasets, ongoing schema evolution

**How it works:**

1. **Schema Change Detection**: Detect when schema is updated
2. **Enrichment Queue**: Create enrichment tasks for affected entities
3. **Background Processing**: Process enrichment in batches
4. **Progressive Enrichment**: Track which entities have been enriched
5. **Validation**: Verify enrichment quality

**Architecture:**

```
┌─────────────────────────────────────────────────────────┐
│  Schema Update Event                                    │
│  - Person schema v2.0 → v2.1                           │
│  - New fields: eye_color, hair_color                    │
└──────────────────┬──────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────┐
│  Schema Diff Analyzer                                   │
│  - Compare v2.0 vs v2.1                                 │
│  - Identify: addedFields, modifiedFields                │
└──────────────────┬──────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────┐
│  Enrichment Planner                                     │
│  - Find all Person entities with schema_version = 2.0   │
│  - Group by source document                             │
│  - Create enrichment tasks                              │
└──────────────────┬──────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────┐
│  Enrichment Queue (kb.object_enrichment_jobs)          │
│  - task_id, entity_id, source_doc_id                   │
│  - new_fields: ["eye_color", "hair_color"]             │
│  - status: pending                                      │
└──────────────────┬──────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────┐
│  Enrichment Worker (Background Process)                │
│  1. Load existing entity data                           │
│  2. Load source document chunk                          │
│  3. Generate targeted enrichment prompt                 │
│  4. Call LLM for new fields only                        │
│  5. Validate extracted values                           │
│  6. Merge into existing entity (create new version)     │
└──────────────────┬──────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────┐
│  Enriched Entity (New Version)                         │
│  - Version incremented                                  │
│  - New fields populated                                 │
│  - _enrichment_metadata tracking                        │
└─────────────────────────────────────────────────────────┘
```

## Detailed Design

### Database Schema for Enrichment

```sql
-- New table for tracking enrichment tasks
CREATE TABLE kb.object_enrichment_jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL,

  -- What to enrich
  object_id UUID NOT NULL REFERENCES kb.graph_objects(id),
  entity_type TEXT NOT NULL,
  source_document_id UUID REFERENCES kb.documents(id),

  -- Schema change context
  schema_version_from TEXT NOT NULL,  -- e.g., "2.0.0"
  schema_version_to TEXT NOT NULL,    -- e.g., "2.1.0"
  new_fields JSONB NOT NULL,          -- ["eye_color", "hair_color"]

  -- Execution
  status TEXT NOT NULL DEFAULT 'pending',  -- pending, running, completed, failed
  priority INTEGER DEFAULT 0,
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,

  -- Results
  enriched_properties JSONB,          -- Only the new fields extracted
  confidence_score REAL,
  error_message TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,

  -- Metadata
  created_by UUID,
  enrichment_config JSONB            -- LLM settings, prompts, etc.
);

CREATE INDEX idx_enrichment_jobs_status
  ON kb.object_enrichment_jobs(status, priority DESC, created_at);

CREATE INDEX idx_enrichment_jobs_object
  ON kb.object_enrichment_jobs(object_id);
```

### Enrichment Configuration

```typescript
interface EnrichmentConfig {
  // Schema evolution
  schema_version_from: string; // "2.0.0"
  schema_version_to: string; // "2.1.0"
  new_fields: string[]; // ["eye_color", "hair_color"]

  // Targeting
  entity_types: string[]; // ["Person", "Place"]
  filter?: {
    // Optional: only enrich specific entities
    object_ids?: string[];
    canonical_ids?: string[];
    labels?: string[];
    where?: Record<string, any>;
  };

  // Execution
  batch_size: number; // Process N entities at once
  max_concurrent: number; // Parallel processing limit
  priority: number; // Higher priority processed first

  // LLM configuration
  llm_provider?: string; // Override default provider
  confidence_threshold?: number;
  require_review?: boolean;

  // Context provision
  include_existing_properties: boolean; // Send existing data to LLM
  include_source_context: boolean; // Send surrounding text
  context_window_chars: number; // How much context to include

  // Validation
  validate_against_existing: boolean; // Check for conflicts
  merge_strategy: 'override' | 'append' | 'smart';
}
```

### Enrichment Prompt Template

```typescript
interface EnrichmentPrompt {
  system: string;
  user: string;
  existingEntity?: any;
  newFieldSchemas: Record<string, any>;
  sourceContext: string;
}

function buildEnrichmentPrompt(config: {
  entityType: string;
  existingEntity: any;
  newFields: string[];
  fieldSchemas: Record<string, any>;
  sourceText: string;
}): EnrichmentPrompt {
  const fieldDescriptions = config.newFields
    .map((field) => {
      const schema = config.fieldSchemas[field];
      return `  - ${field}: ${schema.description}${
        schema.enum ? ` (options: ${schema.enum.join(', ')})` : ''
      }`;
    })
    .join('\n');

  return {
    system: `You are enriching an existing ${
      config.entityType
    } entity with additional fields that were added to the schema.

CRITICAL INSTRUCTIONS:
1. You are ONLY extracting the new fields: ${config.newFields.join(', ')}
2. DO NOT re-extract existing information
3. Focus your attention on finding information for the new fields only
4. If a new field's information is not found in the text, return null for that field
5. Use the existing entity context to understand which entity you're enriching`,

    user: `EXISTING ENTITY (for context only - DO NOT re-extract):
\`\`\`json
${JSON.stringify(config.existingEntity, null, 2)}
\`\`\`

SOURCE TEXT:
\`\`\`
${config.sourceText}
\`\`\`

NEW FIELDS TO EXTRACT (focus ONLY on these):
${fieldDescriptions}

Extract ONLY the new fields listed above for the entity "${
      config.existingEntity.name
    }".

Return JSON with ONLY the new fields:
\`\`\`json
{
${config.newFields.map((f) => `  "${f}": null or value`).join(',\n')}
}
\`\`\``,

    existingEntity: config.existingEntity,
    newFieldSchemas: config.fieldSchemas,
    sourceContext: config.sourceText,
  };
}
```

### Example: Adding `eye_color` to Person

**Scenario:** Bible template pack updated from v2.0 to v2.1 with new field

**Step 1: Update Schema**

```typescript
// scripts/seed-bible-template-pack.ts
{
  type: 'Person',
  schema: {
    properties: {
      name: { type: 'string', ... },
      role: { type: 'string', ... },
      // NEW FIELD
      eye_color: {
        type: 'string',
        enum: ['brown', 'blue', 'green', 'hazel', 'gray', 'unknown'],
        description: 'Eye color if mentioned in text'
      },
      hair_color: {
        type: 'string',
        enum: ['black', 'brown', 'blonde', 'red', 'gray', 'white', 'unknown'],
        description: 'Hair color if mentioned in text'
      },
      _schema_version: { type: 'string', default: '2.1.0' }
    }
  }
}
```

**Step 2: Generate Enrichment Tasks**

```typescript
// Find all Person entities with old schema version
const personsToEnrich = await db.query(
  `
  SELECT o.id, o.canonical_id, o.properties, o.extraction_job_id
  FROM kb.graph_objects o
  WHERE o.project_id = $1
    AND o.type = 'Person'
    AND o.deleted_at IS NULL
    AND (o.properties->>'_schema_version' = '2.0.0' OR o.properties->>'_schema_version' IS NULL)
`,
  [projectId]
);

// Create enrichment job for each
for (const person of personsToEnrich) {
  // Get source document for this entity
  const sourceDoc = await getSourceDocument(person.extraction_job_id);

  await db.query(
    `
    INSERT INTO kb.object_enrichment_jobs (
      project_id, object_id, entity_type,
      source_document_id, schema_version_from, schema_version_to,
      new_fields, enrichment_config
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
  `,
    [
      projectId,
      person.id,
      'Person',
      sourceDoc.id,
      '2.0.0',
      '2.1.0',
      JSON.stringify(['eye_color', 'hair_color']),
      JSON.stringify({ confidence_threshold: 0.7 }),
    ]
  );
}
```

**Step 3: Process Enrichment Tasks (Background Worker)**

```typescript
async function processEnrichmentTask(task) {
  // 1. Load existing entity
  const entity = await graphService.getObject(task.object_id);

  // 2. Load source document
  const document = await documentsService.getDocument(task.source_document_id);

  // 3. Generate enrichment prompt
  const prompt = buildEnrichmentPrompt({
    entityType: task.entity_type,
    existingEntity: entity.properties,
    newFields: task.new_fields,
    fieldSchemas: getFieldSchemas(task.entity_type, task.new_fields),
    sourceText: document.content,
  });

  // 4. Call LLM with enrichment prompt
  const result = await llmProvider.extractFields({
    systemPrompt: prompt.system,
    userPrompt: prompt.user,
    fields: task.new_fields,
    fieldSchemas: prompt.newFieldSchemas,
  });

  // 5. Validate results
  const validated = validateExtractedFields(result, task.new_fields);

  // 6. Merge into existing entity
  const enrichedProperties = {
    ...entity.properties,
    ...validated, // Only new fields
    _schema_version: task.schema_version_to,
    _enriched_at: new Date().toISOString(),
    _enriched_by_job: task.id,
    _enriched_fields: task.new_fields,
  };

  // 7. Create new version
  await graphService.patchObject(task.object_id, {
    properties: enrichedProperties,
    change_summary: {
      type: 'enrichment',
      schema_upgrade: `${task.schema_version_from} → ${task.schema_version_to}`,
      fields_added: task.new_fields,
      enrichment_job_id: task.id,
    },
  });

  // 8. Mark task complete
  await db.query(
    `
    UPDATE kb.object_enrichment_jobs
    SET status = 'completed',
        enriched_properties = $1,
        confidence_score = $2,
        completed_at = NOW()
    WHERE id = $3
  `,
    [JSON.stringify(validated), result.confidence, task.id]
  );
}
```

**Step 4: Execute Enrichment**

```bash
# Create enrichment tasks
npm run enrich:create -- --project-id=<uuid> --entity-type=Person --from=2.0.0 --to=2.1.0

# Process enrichment tasks (background worker)
npm run enrich:process

# Or via API
POST /api/projects/{projectId}/enrich
{
  "entity_types": ["Person"],
  "schema_version_from": "2.0.0",
  "schema_version_to": "2.1.0",
  "new_fields": ["eye_color", "hair_color"],
  "batch_size": 50
}
```

### Strategy 3b: Context-Aware Re-Extraction

**Enhancement:** Include existing entity data as context in the prompt

**Benefits:**

- LLM understands which entity to focus on
- Can disambiguate between multiple entities in same document
- More accurate extraction

**Example Prompt:**

```
EXISTING ENTITY (for context - you are extracting NEW fields for THIS entity):
{
  "name": "Peter",
  "role": "apostle",
  "occupation": "fisherman",
  "birth_location": "Bethsaida"
}

SOURCE TEXT:
[... full document text ...]

NEW FIELDS TO EXTRACT for Peter:
- eye_color: Eye color if mentioned
- hair_color: Hair color if mentioned
- height: Physical height if mentioned

Look for information about PETER specifically (not other people in the text).
Extract ONLY the new fields listed above.
```

## Recommended Implementation Plan

### Phase 1: Quick Win (Week 1)

Use **Strategy 1: Full Re-Extraction with Merge**

1. ✅ Already implemented - no code changes needed
2. Update schema with new fields
3. Re-run extraction with `entity_linking_strategy: "key_match"` and `duplicate_strategy: "merge"`
4. Test on sample document

**Command:**

```bash
# Already works today!
POST /api/extraction-jobs
{
  "extraction_config": {
    "entity_linking_strategy": "key_match",
    "duplicate_strategy": "merge"
  }
}
```

### Phase 2: Targeted Enrichment (Week 2-3)

Implement **Strategy 2: Targeted Field Extraction**

1. Build schema diff detector
2. Create enrichment prompt generator
3. Add enrichment mode to extraction worker
4. Create enrichment scripts

### Phase 3: Production System (Week 4-6)

Implement **Strategy 3: Incremental Batch Enrichment**

1. Create `object_enrichment_jobs` table
2. Build enrichment planner service
3. Create enrichment worker process
4. Add enrichment API endpoints
5. Build monitoring dashboard

## Handling Specific Scenarios

### Scenario 1: Adding Optional Field

**Example:** Add `eye_color` to Person (optional field)

**Approach:**

- Use Strategy 1 or 2
- LLM returns `null` if not mentioned
- Merge into existing entity
- Property present but may be `null`

### Scenario 2: Adding Required Field

**Example:** Add `gender` to Person (required field)

**Approach:**

- Use Strategy 2 with validation
- LLM must return value or extraction fails
- Entities without value marked for review
- Manual intervention may be needed

### Scenario 3: Changing Field Type

**Example:** Change `birth_location` from string to canonical_id reference

**Approach:**

- This is a migration, not enrichment
- Use migration script (like v1 → v2 migration)
- Transform existing values to new format
- Track with schema version

### Scenario 4: Large Dataset Enrichment

**Example:** 10,000 Person entities need new fields

**Approach:**

- Use Strategy 3 (Batch Enrichment)
- Process in batches of 50-100
- Background worker processes queue
- Progress tracking and monitoring
- Estimated time calculation

## Cost Optimization

### Token Usage Comparison

**Strategy 1: Full Re-Extraction**

```
Per entity:
  Existing properties: 500 tokens (sent to LLM, wasted)
  New fields prompt: 100 tokens
  Source document: 2000 tokens
  Total input: 2600 tokens

For 1000 entities: 2,600,000 tokens input
```

**Strategy 2: Targeted Extraction**

```
Per entity:
  Existing entity context: 200 tokens (for disambiguation)
  New fields prompt: 100 tokens
  Source document chunk: 500 tokens (focused excerpt)
  Total input: 800 tokens

For 1000 entities: 800,000 tokens input
Savings: 69% reduction!
```

### Recommendations

1. **< 100 entities:** Use Strategy 1 (simple, fast to implement)
2. **100-1,000 entities:** Use Strategy 2 (worth the development effort)
3. **> 1,000 entities:** Use Strategy 3 (production-grade system)

## Implementation Checklist

### Strategy 1 (Immediate - No Code Needed)

- [ ] Update schema with new fields
- [ ] Run `npm run seed:bible-template`
- [ ] Re-run extraction with `duplicate_strategy: "merge"`
- [ ] Verify merged entities have new fields

### Strategy 2 (Short-term - Targeted Extraction)

- [ ] Build schema diff detector
- [ ] Create enrichment prompt generator
- [ ] Add `mode: "enrichment"` to extraction config
- [ ] Implement enrichment-specific LLM call
- [ ] Create enrichment scripts
- [ ] Test on sample entities

### Strategy 3 (Long-term - Production System)

- [ ] Create `object_enrichment_jobs` table migration
- [ ] Build enrichment planner service
- [ ] Create enrichment worker service
- [ ] Add enrichment API endpoints
- [ ] Build progress tracking
- [ ] Create monitoring dashboard

## See Also

- `/apps/server/src/modules/extraction-jobs/entity-linking.service.ts` - Entity linking and merging
- `/apps/server/src/modules/extraction-jobs/extraction-worker.service.ts` - Main extraction logic
- `/docs/spec/schema-versioning-and-migration-strategy.md` - Schema versioning
- `/docs/spec/template-pack-versioning-strategy.md` - Template pack evolution
