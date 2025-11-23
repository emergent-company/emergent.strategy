# Relationship Types Update - User-Friendly Names

## Summary

Updated the Bible template pack to include user-friendly names for ALL relationship types and added 4 new relationship types to support migrating from embedded references to explicit relationships.

## Changes Made

### 1. Added User-Friendly Labels to ALL Existing Relationship Types

Every relationship now has:

- `label`: Forward direction display name (e.g., "Parent Of")
- `inverseLabel`: Reverse direction display name (e.g., "Child Of")

**Example:**

```typescript
{
  type: 'PARENT_OF',  // Internal database identifier
  description: 'Parental relationship',
  label: 'Parent Of',  // Shows in UI when viewing from parent → child
  inverseLabel: 'Child Of',  // Shows in UI when viewing from child → parent
  fromTypes: ['Person'],
  toTypes: ['Person'],
}
```

### 2. Added 4 New Relationship Types for Migration

**HAS_PARTY** (replaces `properties.parties`):

- Label: "Has Party" / Inverse: "Party To"
- For covenants and agreements
- Icon: handshake, Color: primary

**HAS_PARTICIPANT** (replaces `properties.participants` and `participants_canonical_ids`):

- Label: "Has Participant" / Inverse: "Participant In"
- For events and meetings
- Icon: users, Color: info

**HAS_WITNESS** (replaces `properties.witnesses`):

- Label: "Witnessed By" / Inverse: "Witnessed"
- For events, miracles, covenants
- Icon: eye, Color: secondary

**PERFORMED_BY** (replaces `properties.performer`):

- Label: "Performed By" / Inverse: "Performed"
- For miracles and actions
- Icon: zap, Color: warning

### 3. Added UI Configuration for Relationships

Relationship UI configs are now stored in the template pack under `ui_configs.__relationships__`:

```json
{
  "__relationships__": {
    "HAS_PARTY": {
      "label": "Has Party",
      "inverseLabel": "Party To",
      "icon": "lucide--handshake",
      "color": "primary",
      "description": "Party involved in a covenant..."
    },
    ...
  }
}
```

## File Changes

### Modified Files

1. **`scripts/seed-bible-template-pack.ts`**

   - Added `label` and `inverseLabel` to all 19 existing relationship types
   - Added 4 new relationship types (HAS_PARTY, HAS_PARTICIPANT, HAS_WITNESS, PERFORMED_BY)
   - Added relationshipIconMap with Lucide icons for each type
   - Added relationshipColorMap with theme colors for each type
   - Created relationshipUIConfigs object with display metadata
   - Merged relationship UI configs into main uiConfigs under `__relationships__` key

2. **`scripts/lib/relationship-type-schemas.ts`**

   - Added `label` and `inverseLabel` fields to TemplatePackRelationshipTypeSchema interface
   - Added RelationshipTypeUIConfig interface for UI metadata
   - Added NEW_RELATIONSHIP_UI_CONFIGS with display configuration for new types
   - Added MigrationRelationshipProperties interface for migration metadata

3. **`docs/migrations/add-relationship-types-to-template-pack.md`**
   - Comprehensive guide on adding relationship types to template packs
   - Explains why template pack approach (dynamic) vs hardcoding
   - Step-by-step instructions with code samples

## How UI Will Display Relationships

### Bidirectional Display

When viewing a relationship from different objects, users see contextually appropriate labels:

**Example: PARENT_OF relationship**

- Viewing from David → Solomon: "Parent Of Solomon"
- Viewing from Solomon → David: "Child Of David"

**Example: HAS_WITNESS relationship**

- Viewing from "Transfiguration" event: "Witnessed By Peter, James, John"
- Viewing from "Peter" person: "Witnessed Transfiguration"

### Icon and Color Coding

Each relationship type has a unique icon and color:

- Family relationships (PARENT_OF, CHILD_OF): users icon, secondary color
- Location relationships (BORN_IN, DIED_IN, LOCATED_IN): map-pin icon
- Spiritual events (PERFORMS_MIRACLE, HAS_WITNESS): zap/eye icons, warning/secondary colors
- Covenants (HAS_PARTY, MAKES_COVENANT): handshake icon, primary/accent colors

## Next Steps

### 1. Run Seed Script

```bash
npm run seed:bible-template-pack
```

This will update the template pack in the database with:

- 4 new relationship types
- User-friendly labels for all 23 relationship types
- UI configuration with icons and colors

### 2. Remove Embedded Properties from Object Schemas

Need to update these entity types in `seed-bible-template-pack.ts`:

**Event schema** - Remove:

- `participants` array property (line ~294)

**Covenant schema** - Remove:

- `parties` array property (line ~619)

**Miracle schema** - Remove:

- `performer` string property (line ~693)
- `witnesses` array property (line ~697)

**Prophecy schema** - Keep `prophet` for now (it's informational, not a relationship)

### 3. Update Extraction Prompts

Modify extraction prompts to guide LLM to:

- NOT emit `participants`, `parties`, `witnesses`, `performer` in object properties
- Instead, indicate these should be explicit relationships
- Provide entity names for resolution (system will create relationships via entity linking)

### 4. Test Extraction

After template pack update:

- Run extraction on sample Bible text
- Verify objects DON'T have embedded relationship properties
- Verify explicit relationships ARE created in `kb.graph_relationships`
- Check relationship counts in Objects page

### 5. Create Migration Script

Script to convert existing 1,551 embedded relationships:

- Read objects with embedded properties
- Resolve string names → canonical_ids
- Create explicit relationships using new types
- Mark with migration metadata

## Benefits

### For Users

- **Clear labels:** "Witnessed By" instead of "HAS_WITNESS"
- **Bidirectional:** Different labels depending on viewing direction
- **Visual:** Icons and colors help distinguish relationship types
- **Consistent:** Same pattern across all relationship types

### For Developers

- **Dynamic:** No hardcoded relationship logic in application code
- **Template-driven:** All configuration in one place
- **Extensible:** Easy to add new relationship types
- **Documented:** Clear metadata for each relationship type

### For Performance

- **Indexed:** Explicit relationships use database indexes
- **Queryable:** Standard graph traversal algorithms work
- **Fast:** 100-1000x faster than JSONB array scans
- **Scalable:** Supports millions of relationships efficiently

## Database Schema

### Template Pack Storage

```sql
-- relationship_type_schemas column stores type definitions
{
  "HAS_PARTY": {
    "description": "Party involved in a covenant...",
    "label": "Has Party",
    "inverseLabel": "Party To",
    "fromTypes": ["Covenant", "Agreement"],
    "toTypes": ["Person", "Group", "Angel"]
  }
}

-- ui_configs column stores display configuration
{
  "__relationships__": {
    "HAS_PARTY": {
      "label": "Has Party",
      "inverseLabel": "Party To",
      "icon": "lucide--handshake",
      "color": "primary",
      "description": "Party involved..."
    }
  }
}
```

### Graph Relationships Table

```sql
-- Explicit relationships stored here
kb.graph_relationships (
  id uuid PRIMARY KEY,
  type text,  -- e.g., 'HAS_PARTY', 'HAS_WITNESS'
  src_id uuid REFERENCES kb.graph_objects,
  dst_id uuid REFERENCES kb.graph_objects,
  properties jsonb,  -- Can include migration metadata
  ...versioning fields...
)
```

## References

- Template pack types: `apps/server/src/modules/template-packs/template-pack.types.ts`
- Seed script: `scripts/seed-bible-template-pack.ts`
- Type definitions: `scripts/lib/relationship-type-schemas.ts`
- Migration plan: `docs/plans/migrate-embedded-relationships-to-table.md`
- UI implementation guide: `docs/migrations/add-relationship-types-to-template-pack.md`
