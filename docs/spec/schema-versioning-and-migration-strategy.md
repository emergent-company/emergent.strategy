# Schema Versioning and Migration Strategy

## Executive Summary

**Critical Issue Identified:** The current `_ref` pattern using entity **names** is fundamentally flawed because:

1. ❌ Names are NOT unique (multiple "John" persons, multiple "Jerusalem" places across time periods)
2. ❌ Names can change (e.g., Abram → Abraham, Saul → Paul)
3. ❌ Creates ambiguous references that cannot be reliably resolved

**Recommendation:** Use **canonical_id** for references, not names.

## Current System Architecture

### ✅ Versioning System EXISTS

The system **already has** a sophisticated versioning mechanism:

#### Graph Objects Table Schema

```sql
-- graph_objects has built-in versioning
CREATE TABLE kb.graph_objects (
  id UUID PRIMARY KEY,                    -- Unique ID for THIS version
  canonical_id UUID NOT NULL,             -- ID shared by ALL versions of this entity
  supersedes_id UUID,                     -- Points to previous version
  version INTEGER DEFAULT 1,              -- Version number (1, 2, 3...)

  project_id UUID NOT NULL,
  type TEXT NOT NULL,
  key TEXT,                               -- Business key (project+type+key is unique)
  status TEXT,
  properties JSONB DEFAULT '{}',

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,                 -- Soft delete

  -- Additional fields
  branch_id UUID,                         -- For branching support
  change_summary JSONB,
  content_hash BYTEA,
  labels TEXT[],
  ...
);

-- Unique constraint ensures no duplicates
CREATE UNIQUE INDEX ON graph_objects(project_id, branch_id, type, key)
WHERE deleted_at IS NULL AND supersedes_id IS NULL AND key IS NOT NULL;
```

#### Graph Relationships Table Schema

```sql
-- graph_relationships also has versioning
CREATE TABLE kb.graph_relationships (
  id UUID PRIMARY KEY,
  canonical_id UUID NOT NULL,
  supersedes_id UUID,
  version INTEGER DEFAULT 1,

  project_id UUID NOT NULL,
  type TEXT NOT NULL,
  src_id UUID NOT NULL,                   -- Source object ID (UUID reference)
  dst_id UUID NOT NULL,                   -- Destination object ID (UUID reference)
  properties JSONB DEFAULT '{}',

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  ...
);
```

### Key Concepts

1. **canonical_id** - The permanent identifier that stays the same across all versions
2. **version** - Sequential version number (1, 2, 3, ...)
3. **supersedes_id** - Points to the previous version, forming a version chain
4. **key** - Business key for entity deduplication (type + key must be unique per project)

### Version Chain Example

```
canonical_id: abc123 (Person: "Abraham")

Version 1: id=v1-uuid, canonical_id=abc123, supersedes_id=null, version=1
  properties: { name: "Abram", birth_location: "Ur" }

Version 2: id=v2-uuid, canonical_id=abc123, supersedes_id=v1-uuid, version=2
  properties: { name: "Abraham", birth_location: "Ur", covenant: "Circumcision" }

Version 3: id=v3-uuid, canonical_id=abc123, supersedes_id=v2-uuid, version=3
  properties: { name: "Abraham", birth_location: "Ur", death_location: "Canaan" }
```

## Problem: Name-Based References

### Why `_ref` with Names is Broken

**Problem 1: Names Are Not Unique**

```typescript
// Multiple entities can have the same name
{
  name: "John",
  type: "Person"
}
// Which John? John the Baptist? John the Apostle? John Mark?
```

**Problem 2: Names Change**

```typescript
// Genesis 17:5
{
  name: "Abram",  // Early in Genesis
  ...
}

// Later renamed
{
  name: "Abraham",  // After covenant
  ...
}

// References break!
{
  father_ref: "Abram"  // ❌ Won't resolve after name change
}
```

**Problem 3: Ambiguous Resolution**

```json
// Event references location
{
  "type": "Event",
  "name": "David Defeats Goliath",
  "location_ref": "Valley of Elah"
}

// Later, someone creates another place with same name
{
  "type": "Place",
  "name": "Valley of Elah",  // Different time period or interpretation
  "region": "Different Region"
}

// Which one should the relationship point to?
```

## Solution: Use canonical_id for References

### Recommended Reference Pattern

Instead of storing **names** in `_ref` fields, store **canonical_id** values:

```typescript
// ❌ CURRENT (BROKEN) - Using names
{
  type: "Person",
  properties: {
    name: "Isaac",
    father_ref: "Abraham",        // String name - breaks if renamed
    mother_ref: "Sarah",          // Ambiguous if multiple Sarahs
    birth_location_ref: "Canaan"  // Which Canaan?
  }
}

// ✅ PROPOSED - Using canonical_id
{
  type: "Person",
  properties: {
    name: "Isaac",
    father_canonical_id: "abc123-...",     // Points to Abraham's canonical_id
    mother_canonical_id: "def456-...",     // Points to Sarah's canonical_id
    birth_location_canonical_id: "ghi789-..."  // Points to specific Canaan
  }
}
```

### How It Works

**Step 1: Entity Extraction**

```typescript
// LLM extracts entities with names
{
  "type": "Person",
  "name": "Isaac",
  "father": "Abraham",  // Name for human/LLM understanding
  "mother": "Sarah"
}
```

**Step 2: Entity Linking Service Resolves Names to canonical_id**

```typescript
// System looks up canonical_id for each referenced name
const fatherEntity = await findEntity({
  type: 'Person',
  name: 'Abraham',
  project_id,
});
// Returns: { id: "uuid1", canonical_id: "abc123", ... }

const motherEntity = await findEntity({
  type: 'Person',
  name: 'Sarah',
  project_id,
});
// Returns: { id: "uuid2", canonical_id: "def456", ... }
```

**Step 3: Create Object with canonical_id References**

```typescript
// Store canonical_id in properties
await createObject({
  type: 'Person',
  properties: {
    name: 'Isaac',
    father_canonical_id: 'abc123', // Stored as canonical_id
    mother_canonical_id: 'def456',
    // Also store name for display purposes
    _father_name: 'Abraham',
    _mother_name: 'Sarah',
  },
});
```

**Step 4: Create Relationships**

```typescript
// Create relationships using actual UUIDs
await createRelationship({
  type: 'CHILD_OF',
  src_id: isaacEntity.id, // Isaac's current version ID
  dst_id: abrahamEntity.id, // Abraham's current version ID
  // Relationships automatically track canonical_ids internally
});
```

### Benefits

1. **Survives Name Changes** - canonical_id never changes
2. **Unambiguous** - Points to specific entity, no confusion
3. **Version-Safe** - Relationships reference canonical entities, not specific versions
4. **Migration-Safe** - Old versions maintain their references

## Template Pack Versioning

### Current Template Pack Structure

```typescript
// kb.graph_template_packs table
{
  id: UUID,
  name: "Bible Knowledge Graph",
  version: "2.0.0",              // Semantic versioning string
  deprecated_at: TIMESTAMP,      // Mark when deprecated
  superseded_by: "3.0.0",        // Point to next version

  object_type_schemas: JSONB,    // Schema definitions
  relationship_type_schemas: JSONB,
  extraction_prompts: JSONB,
  ui_configs: JSONB,
  ...
}
```

### Template Pack Versioning Strategy

**Approach:** Use semantic versioning with template pack IDs

```typescript
// v1.0.0 - Original
{
  id: "aaaaaaaa-bbbb-4ccc-8ddd-000000000001",
  name: "Bible Knowledge Graph",
  version: "1.0.0",
  deprecated_at: null
}

// v2.0.0 - Enhanced with hierarchy
{
  id: "aaaaaaaa-bbbb-4ccc-8ddd-000000000002",
  name: "Bible Knowledge Graph",
  version: "2.0.0",
  deprecated_at: null,
  superseded_by: null
}

// When v3.0.0 is released, update v2.0.0
{
  ...
  version: "2.0.0",
  deprecated_at: "2025-06-01",
  superseded_by: "3.0.0"
}
```

## Schema Update Strategies

### Strategy 1: Additive Changes (Backward Compatible)

**Use Case:** Adding new entity types or properties

**Example:**

```typescript
// v1.0: Person entity
{
  type: "Person",
  properties: {
    name: { type: "string" },
    role: { type: "string" }
  }
}

// v2.0: Add new optional properties
{
  type: "Person",
  properties: {
    name: { type: "string" },
    role: { type: "string" },
    // NEW: Optional fields
    aliases: { type: "array", items: { type: "string" } },
    significance: { type: "string" }
  }
}
```

**Migration:** ✅ NO MIGRATION NEEDED

- Old objects remain valid
- New extractions include new fields
- Old objects can be gradually enriched

### Strategy 2: Breaking Changes (Non-Backward Compatible)

**Use Case:** Changing property names, types, or required fields

**Example:**

```typescript
// v1.0
{
  birth_location: 'Bethlehem'; // String
}

// v2.0
{
  birth_location_canonical_id: 'uuid-123'; // UUID reference
}
```

**Migration:** ⚠️ REQUIRES MIGRATION

#### Option A: Keep Both Versions (Recommended)

```typescript
// Allow v1.0 and v2.0 to coexist
{
  // v1.0 style (deprecated but still works)
  birth_location: "Bethlehem",

  // v2.0 style (preferred)
  birth_location_canonical_id: "uuid-123",

  // Metadata tracks which version created this
  _schema_version: "2.0.0"
}
```

#### Option B: Batch Migration Script

```typescript
/**
 * Migration script: v1 string references → v2 canonical_id references
 */
async function migrateV1ToV2(projectId: string) {
  const objects = await db.query(
    `
    SELECT id, type, properties 
    FROM kb.graph_objects 
    WHERE project_id = $1 
      AND properties->>'_schema_version' = '1.0.0'
      AND deleted_at IS NULL
  `,
    [projectId]
  );

  for (const obj of objects.rows) {
    const updatedProps = await resolveStringRefsToCanonicalIds(
      obj.properties,
      projectId
    );

    // Create new version with updated properties
    await graphService.patchObject(obj.id, {
      properties: updatedProps,
      change_summary: {
        migration: 'v1.0.0 → v2.0.0',
        changes: ['Resolved string references to canonical_ids'],
      },
    });
  }
}

async function resolveStringRefsToCanonicalIds(props: any, projectId: string) {
  const updated = { ...props };

  // Find all _ref fields
  for (const [key, value] of Object.entries(props)) {
    if (key.endsWith('_ref') && typeof value === 'string') {
      // Determine entity type from field name
      const entityType = inferTypeFromFieldName(key);

      // Look up entity by name
      const entity = await findEntity({
        type: entityType,
        name: value,
        project_id: projectId,
      });

      if (entity) {
        // Replace string with canonical_id
        const newKey = key.replace('_ref', '_canonical_id');
        updated[newKey] = entity.canonical_id;

        // Keep original name for display
        updated[`_${key}_display_name`] = value;

        // Remove old string reference
        delete updated[key];
      } else {
        console.warn(`Could not resolve reference: ${key}=${value}`);
      }
    }
  }

  updated._schema_version = '2.0.0';
  return updated;
}
```

### Strategy 3: Non-Destructive Evolution

**Approach:** Never delete old data, only add new versions

```typescript
// Object version timeline
v1: { name: "Abram", ... }           // Original
v2: { name: "Abraham", ... }         // Name changed
v3: { name: "Abraham", age: 100 }    // Property added

// All versions preserved with canonical_id linking them
```

**Benefits:**

- Full audit history
- Can revert to previous versions
- No data loss
- Queries can target specific versions or "latest"

## Migration Strategies

### 1. In-Place Migration

**When:** Small projects, low object count

```bash
npm run migrate:schema -- --project-id=<uuid> --from=1.0.0 --to=2.0.0
```

**Process:**

1. Take database backup
2. Run migration script
3. Create new versions of affected objects
4. Validate migration success
5. Mark old template pack as deprecated

### 2. Shadow Migration

**When:** Large projects, high object count

**Process:**

1. Install new template pack (v2.0) alongside old (v1.0)
2. New extractions use v2.0
3. Gradually migrate old objects in background
4. Objects have metadata indicating schema version
5. UI shows both versions until migration complete

### 3. Dual-Schema Support

**When:** Ongoing operations, can't afford downtime

**Approach:** Support both old and new schemas simultaneously

```typescript
// Adapter pattern
class ObjectPropertyAdapter {
  read(object: GraphObject): Properties {
    const schemaVersion = object.properties._schema_version || '1.0.0';

    if (schemaVersion === '1.0.0') {
      return this.adaptV1ToV2(object.properties);
    }

    return object.properties;
  }

  adaptV1ToV2(v1Props: any): any {
    return {
      ...v1Props,
      // Resolve string refs on-the-fly
      father_canonical_id: resolveNameToCanonicalId(v1Props.father_ref),
      _schema_version: '2.0.0 (adapted)',
    };
  }
}
```

## Recommended Implementation Plan

### Phase 1: Fix Reference System (HIGH PRIORITY)

1. **Update schema to use canonical_id for references**

   ```typescript
   // Change _ref fields to _canonical_id fields
   father_ref: string → father_canonical_id: uuid
   ```

2. **Update entity linking service**

   - Resolve name → canonical_id during extraction
   - Store both canonical_id (for links) and name (for display)

3. **Update extraction prompts**
   - Keep prompts using names (human-readable for LLM)
   - System automatically converts names to canonical_ids

### Phase 2: Add Migration Tooling

4. **Create migration script generator**

   ```bash
   npm run create-migration -- --name="string-refs-to-canonical-ids"
   ```

5. **Add schema version tracking**

   - Add `_schema_version` to all objects
   - Track which template pack version created each object

6. **Build migration API endpoint**
   ```typescript
   POST /api/projects/{projectId}/migrate
   Body: {
     from_schema: "1.0.0",
     to_schema: "2.0.0",
     strategy: "shadow" | "in-place"
   }
   ```

### Phase 3: Documentation & Tooling

7. **Document migration procedures**
8. **Create migration testing framework**
9. **Build schema diff tool**
10. **Add rollback capability**

## Answers to Your Questions

### Q: What is the strategy when updating objects, definitions, and schema?

**A:** The system uses **non-destructive versioning**:

- Objects are never deleted, only new versions created
- `canonical_id` links all versions of same entity
- Old versions remain accessible
- Schema changes create new template pack versions
- Both old and new schemas can coexist

### Q: What will happen with the existing objects?

**A:** Existing objects remain **fully functional**:

- They keep their `canonical_id` (never changes)
- They remain queryable
- New versions can be created with updated schema
- Version history is preserved
- Relationships continue to work (use UUIDs, not names)

### Q: Is there any way to migrate existing objects?

**A:** YES, multiple migration strategies exist:

1. **In-place migration** - Batch update creating new versions
2. **Shadow migration** - Gradual background migration
3. **Dual-schema** - Support both old and new simultaneously
4. **On-read adaptation** - Convert old format when accessed

### Q: Do we have a versioned schema?

**A:** YES:

- **Graph Objects:** versioned via `canonical_id` + `version` + `supersedes_id`
- **Template Packs:** versioned via semantic versioning (1.0.0, 2.0.0, etc.)
- **Relationships:** versioned same as objects
- **Full audit trail:** All changes tracked with version chains

### Q: Should references use names or IDs?

**A:** Definitively **canonical_id** (UUID), NOT names:

- Names are not unique
- Names can change
- canonical_id is permanent and unambiguous
- LLMs can still work with names (converted to IDs by system)

## Next Steps

1. **Immediate:** Create updated Bible template pack using canonical_id references
2. **Short-term:** Build migration tooling for v1 → v2 transition
3. **Medium-term:** Document migration procedures for all template packs
4. **Long-term:** Build automated schema evolution system

## See Also

- `/apps/server/src/modules/graph/graph.service.ts` - Versioning implementation
- `/apps/server/src/modules/extraction-jobs/entity-linking.service.ts` - Entity resolution
- `/docs/database/schema.dbml` - Database schema documentation
