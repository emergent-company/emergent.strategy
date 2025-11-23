# Adding Relationship Types to Template Pack

## Overview

Relationship types are defined **dynamically** in template packs, not hardcoded in the application. To support the migration from embedded references to explicit relationships, we need to add new relationship types to the Bible Knowledge Graph template pack.

## Current Architecture

### Where Relationship Types Are Defined

1. **Template Pack Storage** (`kb.graph_template_packs` table):

   - Column: `relationship_type_schemas` (JSONB)
   - Format: `{ "RELATIONSHIP_TYPE_NAME": { description, fromTypes, toTypes } }`

2. **Template Pack Seed Script** (`scripts/seed-bible-template-pack.ts`):

   - Defines `relationshipTypes` array
   - Converts to `relationshipTypeSchemas` object
   - Inserts/updates in database

3. **Schema Registry Service** (`apps/server/src/modules/graph/schema-registry.service.ts`):
   - Currently returns default multiplicity (many-to-many)
   - Does NOT enforce fromTypes/toTypes validation (returns undefined)
   - Validation could be added in future

### Example from Current Template Pack

```typescript
const relationshipTypes = [
  {
    type: 'PERFORMS_MIRACLE',
    description: 'Person or angel performs miracle',
    fromTypes: ['Person', 'Angel'],
    toTypes: ['Miracle'],
  },
  {
    type: 'PARTICIPATES_IN',
    description: 'Person, group, or angel participates in event',
    fromTypes: ['Person', 'Group', 'Angel'],
    toTypes: ['Event'],
  },
];
```

## Why We Need New Relationship Types

Current embedded references in object properties:

- `properties.parties` (170 objects) → Need `HAS_PARTY` relationship type
- `properties.participants` (570 objects) → Need `HAS_PARTICIPANT` relationship type
- `properties.participants_canonical_ids` (12 objects) → Use `HAS_PARTICIPANT`
- `properties.witnesses` (357 objects) → Need `HAS_WITNESS` relationship type
- `properties.performer` (454 objects) → Need `PERFORMED_BY` relationship type

## Solution: Add to Template Pack

### Step 1: Update seed-bible-template-pack.ts

Add new relationship types to the `relationshipTypes` array:

```typescript
const relationshipTypes = [
  // ... existing types ...

  // NEW TYPES FOR MIGRATION
  {
    type: 'HAS_PARTY',
    description: 'Covenant or agreement has a party involved with obligations',
    fromTypes: ['Covenant', 'Agreement', 'Contract'],
    toTypes: ['Person', 'Group', 'Angel'],
  },
  {
    type: 'HAS_PARTICIPANT',
    description: 'Event or activity has a participant involved',
    fromTypes: ['Event', 'Meeting', 'Activity', 'Gathering'],
    toTypes: ['Person', 'Group', 'Angel'],
  },
  {
    type: 'HAS_WITNESS',
    description: 'Event, miracle, or covenant has a witness who observed it',
    fromTypes: ['Event', 'Miracle', 'Covenant', 'Testimony', 'Sign'],
    toTypes: ['Person', 'Group', 'Angel'],
  },
  {
    type: 'PERFORMED_BY',
    description: 'Action or miracle was performed by an agent',
    fromTypes: ['Miracle', 'Event', 'Action', 'Sign', 'Wonder'],
    toTypes: ['Person', 'Angel'],
  },
];
```

**Note:** These types are SIMILAR but NOT IDENTICAL to existing types:

- Existing `PARTICIPATES_IN`: Person → Event (person participates in event)
- New `HAS_PARTICIPANT`: Event → Person (event has participant)
- Different directionality allows querying "all events with this person" vs "all people in this event"

### Step 2: Run the Seed Script

```bash
npm run seed:bible-template-pack
```

This will update the existing template pack with new relationship types.

### Step 3: Verify in Database

```sql
SELECT
  name,
  version,
  jsonb_object_keys(relationship_type_schemas) as relationship_types
FROM kb.graph_template_packs
WHERE name = 'Bible Knowledge Graph';
```

You should see the new types: `HAS_PARTY`, `HAS_PARTICIPANT`, `HAS_WITNESS`, `PERFORMED_BY`

## How Migration Will Use These Types

### For canonical_id References (Already Have IDs)

```typescript
// Object has: properties.participants_canonical_ids = [uuid1, uuid2]
// Migration creates:
await graphService.createRelationship({
  type: 'HAS_PARTICIPANT', // From template pack
  src_id: eventObjectId,
  dst_id: personObjectId, // From canonical_id lookup
  project_id: projectId,
  properties: {
    _migrated_from: 'participants_canonical_ids',
    _migration_date: new Date().toISOString(),
    _migration_strategy: 'canonical_id',
  },
});
```

### For String Name References (Need Resolution)

```typescript
// Object has: properties.witnesses = ["Peter", "John"]
// Migration creates:
const targetObject = await resolveEntityByName('Peter', projectId);
if (targetObject) {
  await graphService.createRelationship({
    type: 'HAS_WITNESS', // From template pack
    src_id: miracleObjectId,
    dst_id: targetObject.id,
    project_id: projectId,
    properties: {
      _migrated_from: 'witnesses',
      _original_name: 'Peter',
      _resolution_confidence: 0.95,
      _migration_date: new Date().toISOString(),
      _migration_strategy: 'name_match',
    },
  });
}
```

## Benefits of Template Pack Approach

1. **Dynamic & Flexible:**

   - No code changes needed to add relationship types
   - Different projects can have different relationship types
   - Template packs can be versioned and updated

2. **Consistent with Architecture:**

   - Follows existing pattern for object types
   - Uses same schema registry system
   - Supports project-specific customizations

3. **Migration-Friendly:**

   - Add types before migration
   - No breaking changes
   - Can coexist with embedded references during transition

4. **Queryable:**
   - Relationship types visible in template pack UI
   - Can list available types via API
   - Documentation auto-generated from schemas

## Alternative Approaches (Not Recommended)

### ❌ Hardcode in Application Code

```typescript
// DON'T DO THIS
const HARDCODED_TYPES = {
  HAS_PARTY: { ... },
  HAS_PARTICIPANT: { ... },
};
```

**Problems:**

- Violates dynamic schema architecture
- Requires code deployment to add types
- Not project-specific
- Inconsistent with existing patterns

### ❌ Direct Database Insertion

```sql
-- DON'T DO THIS
UPDATE kb.graph_template_packs
SET relationship_type_schemas = relationship_type_schemas || '{"HAS_PARTY": {...}}'
WHERE name = 'Bible Knowledge Graph';
```

**Problems:**

- Bypasses seed script versioning
- Easy to introduce JSON errors
- Not reproducible across environments
- No validation

## Next Steps

1. ✅ Add new relationship types to seed-bible-template-pack.ts
2. Run seed script to update template pack
3. Verify types are available in template pack
4. Build migration script that uses these types
5. Test migration on subset of data
6. Run full migration

## References

- Template Pack Types: `apps/server/src/modules/template-packs/template-pack.types.ts`
- Seed Script: `scripts/seed-bible-template-pack.ts`
- Schema Registry: `apps/server/src/modules/graph/schema-registry.service.ts`
- Relationship Type Definitions: `scripts/lib/relationship-type-schemas.ts`
