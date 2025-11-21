# Template Pack Versioning Strategy

## Executive Summary

**Key Finding:** Multiple template packs CAN be installed on the same project simultaneously, and their schemas are **merged** during extraction.

**Critical Decision Point:** We have two strategic options for evolving the Bible template pack:

### Option 1: In-Place Update (Recommended)

- Update existing template pack (`...0001`) to v2.0
- All projects automatically get new schema
- Requires migration of existing objects

### Option 2: Side-by-Side Installation

- Create new template pack (`...0002`) as v2.0
- Install both v1 and v2 on same project
- Schemas merge (v2 types override v1 types)
- Gradual migration possible

## How Template Pack Installation Works

### Database Schema

```sql
-- Global template pack registry
CREATE TABLE kb.graph_template_packs (
  id UUID PRIMARY KEY,
  name TEXT,
  version TEXT,              -- Semantic version (e.g., "2.0.0")
  object_type_schemas JSONB,
  relationship_type_schemas JSONB,
  extraction_prompts JSONB,
  ui_configs JSONB,
  deprecated_at TIMESTAMPTZ,
  superseded_by TEXT,
  ...
);

-- Project-specific installations
CREATE TABLE kb.project_template_packs (
  id UUID PRIMARY KEY,
  project_id UUID NOT NULL,
  template_pack_id UUID NOT NULL,  -- FK to graph_template_packs
  active BOOLEAN DEFAULT true,
  customizations JSONB,
  installed_by UUID,
  installed_at TIMESTAMPTZ,
  ...
);

-- Project's type registry (installed types)
CREATE TABLE kb.project_object_type_registry (
  id UUID PRIMARY KEY,
  project_id UUID NOT NULL,
  type_name TEXT NOT NULL,           -- e.g., "Person", "Place"
  template_pack_id UUID,              -- Which pack provided this type
  json_schema JSONB,
  ui_config JSONB,
  extraction_config JSONB,
  enabled BOOLEAN DEFAULT true,
  ...
);
```

### Installation Process

**Step 1: Install Template Pack**

```typescript
await templatePackService.assignTemplatePackToProject(projectId, {
  template_pack_id: 'aaaaaaaa-bbbb-4ccc-8ddd-000000000001',
  customizations: {
    enabledTypes: ['Person', 'Place', 'Event'], // Optional: filter types
    disabledTypes: ['Angel'], // Optional: exclude types
  },
});
```

**Step 2: What Happens**

1. Check if pack already installed (throws error if duplicate)
2. Check for type conflicts with existing types
3. Create `project_template_packs` record
4. For each entity type in the pack:
   - Create `project_object_type_registry` entry
   - Copy schema, UI config, extraction prompts
   - Associate with `template_pack_id`

**Result:**

```
project_template_packs:
  - project_id: xyz
    template_pack_id: ...0001
    active: true

project_object_type_registry:
  - type_name: "Person"
    template_pack_id: ...0001
    json_schema: { ... }
  - type_name: "Place"
    template_pack_id: ...0001
    json_schema: { ... }
  ...
```

### Multiple Template Packs on Same Project

**YES, This is Supported!**

A project can have multiple template packs installed:

```
project_template_packs:
  - template_pack_id: ...0001 (Bible v1.0)
    active: true
  - template_pack_id: ...0002 (Bible v2.0)
    active: true
  - template_pack_id: ...0003 (Other domain pack)
    active: true
```

### Schema Merging During Extraction

When extraction runs, ALL active template packs are merged:

```typescript
// From extraction-worker.service.ts line 1655-1730

// Merge extraction prompts and schemas from ALL active packs
for (const packAssignment of templatePacks) {
  const pack = packAssignment.template_pack;

  // Merge extraction prompts
  for (const [key, value] of Object.entries(pack.extraction_prompts)) {
    mergedExtractionPrompts[key] = value; // Later packs override earlier
  }

  // Merge object schemas
  for (const [typeName, schema] of Object.entries(pack.object_type_schemas)) {
    if (mergedObjectSchemas[typeName]) {
      // Type exists in multiple packs - merge schemas
      mergedObjectSchemas[typeName] = {
        ...mergedObjectSchemas[typeName], // Earlier pack
        ...schema, // Later pack (overrides)
        _sources: [...sources, { pack: packName }], // Track origins
      };
    } else {
      // New type from this pack
      mergedObjectSchemas[typeName] = schema;
    }
  }
}
```

**Merge Behavior:**

- **Same type in multiple packs:** Later packs override earlier packs
- **Different types:** All types available
- **Conflicts tracked:** `_sources` array shows which packs contributed

## Strategic Options for Bible Template Pack v2.0

### Option 1: In-Place Update (UPDATE Existing Pack)

**Approach:** Update the existing template pack with new schema

```typescript
// Update existing pack with new schema
{
  id: "aaaaaaaa-bbbb-4ccc-8ddd-000000000001",  // SAME ID
  name: "Bible Knowledge Graph",
  version: "2.0.0",  // Version bump
  deprecated_at: null,
  object_type_schemas: {
    Person: { /* v2.0 schema with canonical_id refs */ },
    Place: { /* v2.0 schema */ },
    Chapter: { /* NEW entity type */ },
    ...
  }
}
```

**Pros:**

- ✅ Simpler - one source of truth
- ✅ All projects automatically get new schema
- ✅ No type conflicts
- ✅ Clear upgrade path

**Cons:**

- ⚠️ Breaking change for existing extractions
- ⚠️ Requires migration of existing objects
- ⚠️ Can't gradually roll out

**Migration Required:**

1. Update template pack in database
2. Run migration script to update existing objects
3. New extractions use v2.0 schema

### Option 2: Side-by-Side Installation (NEW Pack)

**Approach:** Create a NEW template pack with different ID

```typescript
// v1.0 - Original (keep as-is)
{
  id: "aaaaaaaa-bbbb-4ccc-8ddd-000000000001",
  name: "Bible Knowledge Graph",
  version: "1.0.0",
  deprecated_at: "2025-12-01",  // Mark for deprecation
  superseded_by: "2.0.0"
}

// v2.0 - New pack
{
  id: "aaaaaaaa-bbbb-4ccc-8ddd-000000000002",  // DIFFERENT ID
  name: "Bible Knowledge Graph Enhanced",  // Different name recommended
  version: "2.0.0",
  object_type_schemas: {
    Person: { /* v2.0 schema with canonical_id refs */ },
    Place: { /* v2.0 schema */ },
    Chapter: { /* NEW entity type */ },
    ...
  }
}
```

**Installation Options:**

**2a. Install BOTH packs on same project:**

```typescript
// Project has both v1 and v2
project_template_packs:
  - template_pack_id: ...0001 (v1.0)
    active: true
  - template_pack_id: ...0002 (v2.0)
    active: true
```

**Result:**

- Types with same name: v2 schema overrides v1 (later pack wins)
- New types (Chapter, Verse): Only in v2
- Old objects: Keep using v1 schema
- New extractions: Use merged schema (v2 overrides)

**2b. Replace v1 with v2:**

```typescript
// Uninstall v1, install v2
project_template_packs:
  - template_pack_id: ...0002 (v2.0)
    active: true
```

**Pros:**

- ✅ Gradual migration possible (both versions coexist)
- ✅ Can test v2 alongside v1
- ✅ Projects can choose when to upgrade
- ✅ Rollback possible (uninstall v2, keep v1)
- ✅ Old objects remain valid

**Cons:**

- ⚠️ More complex - two sources of truth
- ⚠️ Type conflicts need resolution
- ⚠️ Schema merging can be confusing
- ⚠️ Need to manage deprecation timeline

## Recommended Strategy

### Phase 1: Fix Critical Issues (In-Place Update)

**For the canonical_id reference fix, use Option 1 (In-Place Update)**

**Reasoning:**

- This is a **critical bug fix** (name-based refs are broken)
- All projects should get the fix immediately
- In-place update is simpler

**Steps:**

1. Update `seed-bible-template-pack.ts` with canonical_id references
2. Bump version to 2.0.0
3. Run migration script for existing objects
4. Document breaking changes

### Phase 2: Add New Features (Side-by-Side)

**For adding new entity types (Chapter, Verse, Theme, etc.), consider Option 2**

**Reasoning:**

- New features are additive
- Projects can opt-in when ready
- Less disruptive

**Steps:**

1. Create `seed-bible-template-pack-enhanced.ts` with new ID
2. Install alongside v1.0
3. Schemas merge (Chapter, Verse added to Person, Place, etc.)
4. Projects gradually migrate to v2 pack

## Type Conflict Resolution

### Scenario: Same Type in Both Packs

```typescript
// v1.0 Person schema
{
  name: { type: "string" },
  role: { type: "string" },
  birth_location: { type: "string" }  // v1 style (string)
}

// v2.0 Person schema
{
  name: { type: "string" },
  role: { type: "string" },
  birth_location_canonical_id: { type: "string" },  // v2 style (canonical_id)
  _birth_location_display_name: { type: "string" }
}
```

**If both packs installed:**

- Extraction uses **v2 schema** (later pack wins)
- Existing v1 objects remain valid
- New extractions create v2-style objects
- Objects marked with `_schema_version` metadata

### Handling in Code

```typescript
// Adapter pattern for reading objects
function readPersonObject(object: GraphObject) {
  const schemaVersion = object.properties._schema_version || '1.0.0';

  if (schemaVersion === '1.0.0') {
    // Convert v1 to v2 on-the-fly
    return {
      ...object.properties,
      birth_location_canonical_id: resolveNameToCanonicalId(
        object.properties.birth_location
      ),
      _schema_version: '2.0.0 (adapted)',
    };
  }

  return object.properties; // Already v2
}
```

## Migration Scripts

### Script 1: Update Template Pack

```bash
# Update existing pack to v2.0
npx tsx scripts/seed-bible-template-pack.ts

# Creates/updates pack ID ...0001 with new schema
```

### Script 2: Migrate Existing Objects

```bash
# Migrate objects from v1 to v2
npm run migrate:bible-objects -- --project-id=<uuid> --from=1.0.0 --to=2.0.0
```

```typescript
// Migration logic
async function migrateBibleObjects(projectId: string) {
  // Find all v1 objects
  const objects = await db.query(
    `
    SELECT id, type, properties, canonical_id
    FROM kb.graph_objects
    WHERE project_id = $1
      AND type IN ('Person', 'Place', 'Event', ...)
      AND (properties->>'_schema_version' = '1.0.0' OR properties->>'_schema_version' IS NULL)
      AND deleted_at IS NULL
  `,
    [projectId]
  );

  for (const obj of objects.rows) {
    // Convert v1 properties to v2
    const v2Properties = await convertV1ToV2(obj.properties, projectId);

    // Create new version
    await graphService.patchObject(obj.id, {
      properties: v2Properties,
      change_summary: {
        migration: 'v1.0 → v2.0',
        changes: ['Converted string refs to canonical_id refs'],
      },
    });
  }
}

async function convertV1ToV2(v1Props: any, projectId: string) {
  const v2Props = { ...v1Props };

  // Convert birth_location string → canonical_id
  if (v1Props.birth_location) {
    const place = await findEntity({
      type: 'Place',
      name: v1Props.birth_location,
      project_id: projectId,
    });

    if (place) {
      v2Props.birth_location_canonical_id = place.canonical_id;
      v2Props._birth_location_display_name = v1Props.birth_location;
      delete v2Props.birth_location;
    }
  }

  // Convert father_ref string → canonical_id
  if (v1Props.father_ref) {
    const person = await findEntity({
      type: 'Person',
      name: v1Props.father_ref,
      project_id: projectId,
    });

    if (person) {
      v2Props.father_canonical_id = person.canonical_id;
      v2Props._father_display_name = v1Props.father_ref;
      delete v2Props.father_ref;
    }
  }

  // ... repeat for all _ref fields

  v2Props._schema_version = '2.0.0';
  v2Props._migrated_at = new Date().toISOString();

  return v2Props;
}
```

## Recommended Implementation Plan

### Immediate (Week 1-2)

1. **Create v2.0 template pack with canonical_id references**

   - Update schema to use canonical_id pattern
   - Keep same template pack ID (in-place update)
   - Bump version to 2.0.0

2. **Build migration script**

   - Convert existing objects from v1 to v2
   - Test on small project first
   - Include rollback capability

3. **Update extraction service**
   - Enhance entity linking to resolve names → canonical_ids
   - Store both canonical_id (for relationships) and display_name (for UI)

### Short-term (Week 3-4)

4. **Add schema version tracking**

   - Add `_schema_version` to all extracted objects
   - Track which template pack version created each object
   - Build schema compatibility checker

5. **Create migration API endpoint**

   ```typescript
   POST /api/projects/{projectId}/migrations/bible-schema
   Body: {
     from_version: "1.0.0",
     to_version: "2.0.0",
     dry_run: boolean
   }
   ```

6. **Documentation**
   - Migration guide for users
   - Breaking changes documentation
   - Schema changelog

### Medium-term (Month 2)

7. **Add new entity types (Chapter, Verse)**

   - Consider side-by-side installation for these
   - Allow projects to opt-in
   - Ensure backward compatibility

8. **Build schema diff tool**
   - Compare schema versions
   - Show impact analysis
   - Suggest migration strategies

## Conclusion

**Answer to Your Question:**

> "Are we creating just another template pack with a new version and then installing both packs?"

**We have two options:**

1. **In-Place Update (Recommended for bug fixes):**

   - Update existing pack (`...0001`) to v2.0
   - Same ID, new version number
   - All projects automatically get new schema
   - Requires migration of existing objects

2. **Side-by-Side (Better for additive features):**
   - Create NEW pack (`...0002`) as v2.0
   - Both packs can coexist on same project
   - Schemas merge (later pack wins conflicts)
   - Gradual migration possible

**Recommendation:**

- Use **Option 1 (In-Place)** for fixing canonical_id references (critical bug)
- Consider **Option 2 (Side-by-Side)** for adding Chapter/Verse later (additive feature)

The system is designed to handle both approaches gracefully!
