# Design: Agentic Relationship Extraction

## Context

We are upgrading the extraction pipeline from simple "Entity Extraction" to "Graph Extraction". This involves extracting both nodes (Entities) and edges (Relationships) from unstructured text.

## Goals

- Extract relationships between entities defined in the Template Pack.
- Ensure strict referential integrity (no broken edges).
- Prevent hallucinations (LLM inventing entities to satisfy relationships).
- Maintain performance (single-pass extraction preferred).

## Architecture

### 1. Agentic LLM Interaction

We will switch from `responseMimeType: 'application/json'` to `bindTools()` with two tools:

```typescript
// Tool 1: Extract Entity
function extract_entity(
  name: string,
  type: string,
  description: string,
  properties: Record<string, any>
);

// Tool 2: Extract Relationship
function extract_relationship(
  source_name: string | null, // For NEW entities (just extracted)
  source_id: string | null, // For EXISTING entities (from context)
  target_name: string | null, // For NEW entities (just extracted)
  target_id: string | null, // For EXISTING entities (from context)
  relationship_type: string,
  description?: string
);
```

**Prompting Strategy**:

- Instruct LLM to first extract all entities it finds.
- For relationships:
  - Use `source_name`/`target_name` when referencing entities just extracted in this batch
  - Use `source_id`/`target_id` (UUID) when referencing existing entities passed in context
- This eliminates ambiguity for existing entities while keeping flexibility for new ones.

### 2. Extraction Worker: Two-Phase Processing

The `ExtractionWorker` will orchestrate the persistence to ensure safety.

#### Phase A: Entity Materialization

1. Execute LLM call.
2. Collect all `extract_entity` calls.
3. For each entity:
   - Create/Update in DB.
   - Store result in `BatchEntityMap`: `Map<EntityName, UUID>`.

#### Phase B: Relationship Resolution

1. Collect all `extract_relationship` calls.
2. For each relationship `(Source, Target, Type)`:
   - **Resolve Source**:
     - IF `source.id` is provided → use directly (existing entity)
     - ELSE → Check `BatchEntityMap` by name → Fallback to DB Lookup (by name & project)
   - **Resolve Target**:
     - IF `target.id` is provided → use directly (existing entity)
     - ELSE → Check `BatchEntityMap` by name → Fallback to DB Lookup (by name & project)
   - **Verify**:
     - IF `SourceUUID` AND `TargetUUID` are found:
       - Validate relationship type against `relationship_type_schemas`.
       - Persist relationship.
     - ELSE:
       - Drop relationship.
       - Log warning: `Skipping relationship ${Type} from ${Source} to ${Target}: One or both entities not found.`

### 3. Schema Integration

- `loadExtractionConfig` must be updated to merge `relationship_type_schemas` from all active template packs.
- These schemas are passed to the LLM Provider to inform the model of valid relationship types.

## Trade-offs

- **One-Shot vs Conversational**: We chose One-Shot with strict verification.
  - _Risk_: If LLM forgets an entity but links it, we lose the link.
  - _Mitigation_: It's better to lose a link than corrupt the graph with hallucinated nodes.
- **Name-based Resolution**: Relies on unique names or "best match".
  - _Risk_: "John" might match multiple "Johns".
  - _Mitigation_: Scope lookup to the current project. Future work can add disambiguation logic.

## Data Structures

**EntityReference** (for relationship endpoints):

```typescript
interface EntityReference {
  name?: string; // For newly extracted entities
  id?: string; // For existing entities (UUID)
}
```

**Updated ExtractionResult**:

```typescript
interface ExtractionResult {
  entities: ExtractedEntity[];
  relationships: ExtractedRelationship[]; // New field
  // ...
}

interface ExtractedRelationship {
  source: EntityReference;
  target: EntityReference;
  relationship_type: string;
  description?: string;
  confidence?: number;
}
```
