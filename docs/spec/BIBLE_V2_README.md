# Bible Knowledge Graph v2.0 - Complete Guide

## Quick Start

```bash
# 1. Update template pack to v2.0
npm run seed:bible-template

# 2. Test migration (dry-run)
npm run migrate:bible-v1-to-v2 -- --project-id=<your-project-uuid> --dry-run

# 3. Apply migration
npm run migrate:bible-v1-to-v2 -- --project-id=<your-project-uuid>

# 4. Upload new Bible documents (will use v2.0 schema automatically)
npm run seed:bible -- --project-id=<your-project-uuid>
```

## What's New in v2.0

### Critical Fix: Entity References Use canonical_id

**Problem in v1.0:**

- References used strings: `"father": "Abraham"`
- Names are not unique (multiple "John"s exist)
- Names can change (Abram → Abraham)
- Cannot create reliable relationships

**Solution in v2.0:**

- LLMs extract with names (intuitive)
- System resolves names → canonical_ids (robust)
- Properties store both: `father_canonical_id` + `_father_display_name`
- Relationships use permanent canonical_ids

### Enhanced Entity Types

All entities now include:

- `_schema_version: "2.0.0"` - Migration tracking
- Better enum constraints for categorical fields
- `source_references` - Chapter references where mentioned
- `significance` - Why the entity matters biblically
- `aliases` - Alternative names

### Improved Extraction Prompts

- Clear instructions to use entity NAMES
- Comprehensive examples
- Explicit guidance on reference resolution

## Files Modified/Created

### Core Implementation

- **scripts/seed-bible-template-pack.ts** - UPDATED to v2.0
- **scripts/migrate-bible-v1-to-v2.ts** - NEW migration script
- **package.json** - Added `migrate:bible-v1-to-v2` script

### Documentation

- **docs/spec/schema-versioning-and-migration-strategy.md** - Versioning architecture
- **docs/spec/template-pack-versioning-strategy.md** - Template pack strategy
- **docs/spec/bible-v2-implementation-summary.md** - Implementation details
- **docs/spec/BIBLE_V2_README.md** - This file

### Earlier Documentation (Reference)

- **docs/spec/bible-entity-references.md** - Original reference pattern (superseded by canonical_id approach)
- **docs/spec/bible-schema-enhancements-summary.md** - Initial enhancement proposals
- **docs/spec/bible-schema-quick-reference.md** - Quick reference guide

## Architecture

### Entity Reference Pattern

```typescript
// LLM extracts with names
{
  "name": "Isaac",
  "father": "Abraham",           // Name for LLM
  "birth_location": "Canaan"     // Name for LLM
}

// System converts to canonical_id
{
  "name": "Isaac",
  "father_canonical_id": "abc-123-uuid",         // For relationships
  "_father_display_name": "Abraham",             // For UI
  "birth_location_canonical_id": "xyz-789-uuid",
  "_birth_location_display_name": "Canaan",
  "_schema_version": "2.0.0"
}

// Relationships created
Isaac --[CHILD_OF]--> Abraham (using canonical_ids)
Isaac --[BORN_IN]--> Canaan (using canonical_ids)
```

### Versioning System

The system already has comprehensive versioning:

**Graph Objects:**

- `id` - Unique ID for THIS version
- `canonical_id` - Permanent ID across ALL versions
- `version` - Version number (1, 2, 3...)
- `supersedes_id` - Points to previous version

**Version Chain:**

```
canonical_id: abc-123 (Person: "Abraham")
  ↓
v1: name="Abram" (initial version)
  ↓
v2: name="Abraham", covenant="Circumcision" (updated)
  ↓
v3: death_location_canonical_id="xyz..." (migrated to v2.0 schema)
```

**Template Packs:**

- Semantic versioning (1.0.0, 2.0.0, 3.0.0)
- `deprecated_at` - Marks when superseded
- `superseded_by` - Points to next version
- Multiple packs can coexist on same project

## Migration Strategy

### In-Place Update (Chosen Approach)

**Rationale:**

- canonical_id fix is a **critical bug fix**, not a feature
- All projects should get it immediately
- Simpler than managing multiple packs

**Process:**

1. Update template pack (same ID, new version)
2. Run migration script to convert existing objects
3. New extractions use v2.0 automatically

### Non-Destructive Migration

**Guarantees:**

- Old versions preserved
- Full version history maintained
- Can rollback if needed
- No data loss

## Usage Examples

### Deploy Template Pack

```bash
npm run seed:bible-template
```

**Output:**

```
=== Bible Template Pack Seed ===

✓ Updated existing Bible template pack

✓ Bible template pack seed completed successfully

Template Pack ID: aaaaaaaa-bbbb-4ccc-8ddd-000000000001
Name: Bible Knowledge Graph
Version: 2.0.0

Entity Types: Person, Place, Event, Book, Quote, Group, Object, Covenant, Prophecy, Miracle, Angel
```

### Migrate Existing Objects

```bash
# Dry run first
npm run migrate:bible-v1-to-v2 -- --project-id=abc-123-uuid --dry-run

# Apply migration
npm run migrate:bible-v1-to-v2 -- --project-id=abc-123-uuid
```

**Output:**

```
=== Bible Template Pack Migration: v1.0 → v2.0 ===

Project ID: abc-123-uuid
Dry Run: NO
Batch Size: 50

Finding v1.0 objects...
Found 150 objects to migrate

Objects by type:
  Person: 75
  Place: 35
  Event: 25
  Group: 15

✓ [1/150] Person "Abraham" (3 changes)
    - birth_location: "Ur" → canonical_id: xyz-789
    - tribe: "Israelites" → canonical_id: abc-456
    - Added schema version tracking
✓ [2/150] Person "Isaac" (2 changes)
...

=== Migration Summary ===

Total objects processed: 150
✓ Migrated: 142
⊘ Skipped: 8
✗ Failed: 0

✓ Migration complete!
```

## Key Design Decisions

### 1. Names vs canonical_ids

**Decision:** Store names in entity properties, resolve to canonical_ids during processing

**Reasoning:**

- LLMs work better with names than UUIDs
- Names are human-readable in extraction prompts
- System handles complexity of resolution
- Keeps extraction prompts simple and intuitive

### 2. In-Place vs Side-by-Side

**Decision:** In-place update (same template pack ID)

**Reasoning:**

- This is a bug fix, not a feature addition
- All projects should get the fix
- Simpler to manage than multiple packs
- Can still add new packs later for new features (Chapter, Verse, etc.)

### 3. Display Names

**Decision:** Store both canonical_id and display_name

**Reasoning:**

- canonical_id for database relationships (permanent, unambiguous)
- display_name for UI rendering (human-readable)
- Survives entity renames
- Enables click-through navigation

## FAQ

### Q: Will existing v1.0 objects still work?

A: YES. The versioning system preserves all old versions. Old objects remain fully functional.

### Q: Do I need to migrate immediately?

A: For new projects, no migration needed. For existing projects with v1.0 data, migration is recommended to enable proper relationships.

### Q: Can I rollback the migration?

A: YES. Delete the new versions and the old versions remain intact. The system preserves full version history.

### Q: What if a referenced entity doesn't exist?

A: The migration script skips unresolved references and logs warnings. You may need to create missing entities first.

### Q: Will this break existing extractions?

A: NO. New extractions will use v2.0 schema. Old extractions remain valid with version history.

### Q: Can I install both v1 and v2 packs?

A: Not recommended for in-place update. Use the same pack ID. For completely new features (Chapter/Verse), consider a separate pack.

## Troubleshooting

### Migration fails with "entity not found"

Referenced entity doesn't exist yet. Options:

1. Create the referenced entity first
2. Run migration with `--batch-size=1` to see specific failures
3. Skip unresolved references (migration will report them)

### Template pack update doesn't appear

1. Check database: `SELECT * FROM kb.graph_template_packs WHERE id = 'aaaaaaaa-bbbb-4ccc-8ddd-000000000001'`
2. Verify version = '2.0.0'
3. Check object_type_schemas includes new fields

### Objects still have v1.0 schema

Migration script only creates new versions. Old version remains as previous history.

- Check latest version: `SELECT * FROM kb.graph_objects WHERE canonical_id = '...' ORDER BY version DESC LIMIT 1`

## Next Steps

### Immediate

1. ✅ Template pack updated to v2.0
2. ✅ Migration script created
3. ⏳ Deploy and test on sample project
4. ⏳ Run migration on production projects

### Short-term

5. Enhance entity linking to auto-create relationships from canonical_id properties
6. Update UI to render references as clickable links
7. Add Chapter and Verse entities (consider separate template pack)

### Medium-term

8. Build migration API endpoint
9. Create schema diff/comparison tools
10. Add automated relationship creation from properties

## Summary

Bible Knowledge Graph v2.0 fixes a critical architectural flaw by moving from string-based references to canonical_id-based references, while keeping the extraction process intuitive for LLMs. The in-place update strategy ensures all projects benefit from the fix, and the non-destructive migration preserves full version history.

**Ready to deploy!** Start with `npm run seed:bible-template` to update the template pack in your database.
