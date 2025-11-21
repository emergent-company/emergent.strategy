# Bible Knowledge Graph v2.0 - Implementation Summary

## What Was Implemented

### ✅ Task 1: Updated Bible Template Pack to v2.0

**File:** `scripts/seed-bible-template-pack.ts`

**Changes:**

1. **Version bump:** 1.0.0 → 2.0.0 (same template pack ID for in-place update)
2. **Entity references redesigned:** Properties now use entity NAMES (not strings), which the system resolves to canonical_ids
3. **Schema version tracking:** All entities now have `_schema_version: "2.0.0"` field
4. **Enhanced properties:** Added `aliases`, `significance`, `source_references` to core entities
5. **Improved extraction prompts:** Clear instructions to use entity NAMES, with examples

**Key Design Decision:**

- Properties store entity **NAMES** (human-readable for LLMs)
- Entity linking service resolves names → canonical_ids during extraction
- This keeps LLM prompts intuitive while ensuring robust database relationships

**Updated Entities:**

- **Person:** Now includes `father`, `mother`, `tribe`, `birth_location`, `death_location` (all as names)
- **Place:** Now includes `region`, `country` (as names), with `type` enum
- **Event:** Now includes `location`, `participants` (as names), with `type` enum
- **Book:** Enhanced with author reference, chapter_count
- **Quote:** Now includes `speaker`, `audience` (as names), with `type` enum
- **Group:** Now includes `leader`, `founded_by`, `region` (as names), with `type` enum
- **Object, Covenant, Prophecy, Miracle, Angel:** Added schema version tracking

**Deployment:**

```bash
npm run seed:bible-template
```

### ✅ Task 2: Created Migration Script

**File:** `scripts/migrate-bible-v1-to-v2.ts`

**Features:**

- Migrates existing v1.0 objects to v2.0 schema
- Non-destructive: creates new versions, preserves old versions
- Resolves entity name strings to canonical_ids
- Transactional: each object update is atomic
- Dry-run mode: test before applying
- Batch processing for large datasets
- Detailed progress reporting

**What It Migrates:**

**Person entities:**

```
v1.0: birth_location: "Bethlehem" (string)
v2.0: birth_location_canonical_id: "uuid-123..."
      _birth_location_display_name: "Bethlehem" (for UI)
```

**Place entities:**

```
v1.0: region: "Judea" (string)
v2.0: region_canonical_id: "uuid-456..."
      _region_display_name: "Judea" (for UI)
```

**Event entities:**

```
v1.0: location: "Red Sea" (string)
      participants: ["Moses", "Aaron"] (string array)
v2.0: location_canonical_id: "uuid-789..."
      participants_canonical_ids: ["uuid-abc...", "uuid-def..."]
      _location_display_name: "Red Sea"
      _participants_display_names: ["Moses", "Aaron"]
```

**Usage:**

```bash
# Dry run (test first)
npm run migrate:bible-v1-to-v2 -- --project-id=<uuid> --dry-run

# Apply migration
npm run migrate:bible-v1-to-v2 -- --project-id=<uuid>

# Custom batch size
npm run migrate:bible-v1-to-v2 -- --project-id=<uuid> --batch-size=100
```

## Architecture

### Entity Reference Resolution Flow

```
1. LLM Extraction
   ↓
   Entity extracted with NAME references:
   {
     "name": "Isaac",
     "father": "Abraham",  ← name (string)
     "birth_location": "Canaan"  ← name (string)
   }

2. Entity Linking Service
   ↓
   Resolves names to canonical_ids:
   - Looks up "Abraham" → finds canonical_id: abc123
   - Looks up "Canaan" → finds canonical_id: xyz789

3. Object Creation
   ↓
   Stores in properties:
   {
     "name": "Isaac",
     "father_canonical_id": "abc123",  ← canonical_id for DB relations
     "_father_display_name": "Abraham",  ← name for UI
     "birth_location_canonical_id": "xyz789",
     "_birth_location_display_name": "Canaan",
     "_schema_version": "2.0.0"
   }

4. Relationship Creation
   ↓
   Creates graph relationship:
   Isaac (src_id) --[CHILD_OF]--> Abraham (dst_id)

   Uses canonical_ids for permanent, unambiguous links
```

### Why This Approach?

**Problem with v1.0:**

- Stored names as strings: `"birth_location": "Bethlehem"`
- Names are not unique (multiple "John"s)
- Names can change (Abram → Abraham)
- Cannot create reliable relationships

**Solution in v2.0:**

- LLMs work with names (intuitive, natural)
- System resolves names → canonical_ids (robust, unique)
- Properties store both: canonical_id (for relationships) + display_name (for UI)
- Relationships use canonical_ids (permanent identifiers)

## Documentation Created

1. **`docs/spec/schema-versioning-and-migration-strategy.md`**

   - Comprehensive versioning architecture
   - Why name-based refs are broken
   - canonical_id-based solution
   - Migration strategies

2. **`docs/spec/template-pack-versioning-strategy.md`**

   - How template pack installation works
   - Multiple pack coexistence
   - Schema merging behavior
   - In-place vs side-by-side strategies

3. **`docs/spec/bible-entity-references.md`** (from earlier)

   - Reference pattern explanation
   - Schema design guidelines (OUTDATED - needs update)

4. **`docs/spec/bible-schema-enhancements-summary.md`** (from earlier)

   - Overall enhancements (OUTDATED - needs update)

5. **`docs/spec/bible-schema-quick-reference.md`** (from earlier)

   - Quick lookup guide (OUTDATED - needs update)

6. **`docs/spec/bible-v2-implementation-summary.md`** (this document)
   - Implementation summary
   - What was done
   - How to use

## Next Steps

### Immediate (Do First)

1. **Run the template pack update:**

   ```bash
   npm run seed:bible-template
   ```

   This updates the template pack in the database to v2.0.

2. **Test with dry-run:**

   ```bash
   npm run migrate:bible-v1-to-v2 -- --project-id=<uuid> --dry-run
   ```

   Review what would be migrated.

3. **Apply migration:**
   ```bash
   npm run migrate:bible-v1-to-v2 -- --project-id=<uuid>
   ```
   Migrate existing objects to v2.0.

### Short-term (Enhancement)

4. **Update entity linking service** (if needed)

   - The entity linking service in `apps/server/src/modules/extraction-jobs/entity-linking.service.ts` already handles name-based lookups
   - It uses `business_key` matching, which aligns with our approach
   - May need to enhance to create relationships automatically from references in properties

5. **Update UI to display references**

   - When showing `father_canonical_id`, resolve to display name
   - Make references clickable for navigation
   - Show both name and relationship type

6. **Add relationship auto-creation**
   - When object has `father_canonical_id`, automatically create `CHILD_OF` relationship
   - When object has `birth_location_canonical_id`, create `BORN_IN` relationship
   - This would happen post-extraction

### Medium-term (New Features)

7. **Add Chapter and Verse entities**

   - Create hierarchical Book → Chapter → Verse structure
   - Update extraction to create these automatically
   - Add `PART_OF`, `CONTAINS`, `MENTIONED_IN` relationships

8. **Build schema diff tool**

   - Compare v1 vs v2 objects
   - Show migration impact
   - Validate migrations

9. **Create migration API endpoint**
   ```typescript
   POST /api/projects/{projectId}/migrations/bible-schema
   Body: { from_version: "1.0.0", to_version: "2.0.0", dry_run: true }
   ```

## Testing Checklist

### Pre-Migration Testing

- [ ] Verify template pack updates successfully
- [ ] Check extraction still works with new schema
- [ ] Test dry-run on sample project
- [ ] Review dry-run output for correctness

### Post-Migration Testing

- [ ] Verify objects have v2.0 schema version
- [ ] Check canonical_id references resolve correctly
- [ ] Test relationship creation works
- [ ] Verify UI displays references properly
- [ ] Test search/query with new schema
- [ ] Validate version history preserved

### Rollback Testing

- [ ] Document rollback procedure
- [ ] Test reverting to previous version
- [ ] Ensure no data loss in rollback

## Known Limitations

1. **Entity Linking Dependency**

   - Migration requires referenced entities to exist
   - If "Abraham" doesn't exist, `father: "Abraham"` cannot be resolved
   - Workaround: Create placeholder entities or skip unresolved references

2. **Name Ambiguity**

   - If multiple entities have same name, resolution uses first match
   - Consider adding context hints (e.g., "Abraham (patriarch)" vs "Abraham (other)")

3. **Manual Relationship Creation**

   - Current implementation creates new object versions but not relationships
   - Relationships still need to be created manually or via extraction
   - Future: Auto-create relationships from canonical_id properties

4. **Display Name Management**
   - If entity is renamed, `_display_name` becomes stale
   - Consider refreshing display names periodically
   - Or fetch fresh name from canonical_id on display

## Success Criteria

✅ **Template pack updated to v2.0**

- Version number: 2.0.0
- Schema version tracking: Present in all entities
- Entity references: Use name-based pattern

✅ **Migration script created**

- Non-destructive: ✓
- Transactional: ✓
- Dry-run mode: ✓
- Progress reporting: ✓

⏳ **Remaining Work:**

- Entity linking enhancement
- Auto-relationship creation
- UI updates for references
- Chapter/Verse entities
- Migration API endpoint

## Conclusion

The Bible Knowledge Graph v2.0 represents a significant architectural improvement:

**From:** String-based references (brittle, ambiguous)
**To:** canonical_id-based references (robust, permanent)

**Key Innovation:** LLMs work with names (intuitive), system resolves to canonical_ids (reliable)

**Migration Path:** In-place update with non-destructive migration script

**Next Steps:** Deploy template pack, run migration, enhance entity linking for auto-relationships

This foundation enables reliable entity linking, click-through navigation, and sophisticated graph queries while keeping the extraction process natural and intuitive for LLMs.
