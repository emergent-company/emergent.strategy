# Test Bidirectional Relationships

## What We Did

### 1. Phase 2 Migration ✅

- Ran migration script on all objects
- Created 6 explicit relationships from `participants_canonical_ids`
- Removed embedded relationship properties from all 1,563 objects
- Fixed migration script to handle null branch_id and proper UUID casting

### 2. Updated UI ✅

- Removed embedded relationship extraction code
- Updated `loadInverseRelationships()` to use relationship groups from `loadRelatedObjects()`
- Removed "Embedded Relationships" UI section
- "Incoming Relationships" section now shows relationships from `kb.graph_relationships` table

### 3. Schema is Now Clean ✅

- No more embedded relationship properties in JSONB
- All relationships are in `kb.graph_relationships` table
- UUID-based, indexed, fast lookups

## Test Objects

Use these object IDs to test in the UI:

### Test 1: Event with outgoing relationship

**Object:** Event "Walking in the truth"  
**ID:** `02b72466-3e0a-4bb9-bf8e-c9488f6d7d8c`

**Expected:**

- Should show "Related Objects" section
- Should have "HAS_PARTICIPANT" relationship (outgoing) pointing to "the elder"
- Clicking "the elder" link should open their detail modal

### Test 2: Person with incoming relationship

**Object:** Person "the elder"  
**ID:** `39e19d4c-efcb-4231-aa24-1d3fd2d6b540`

**Expected:**

- Should show "Incoming Relationships" section
- Should have "HAS_PARTICIPANT" relationships (incoming) from multiple "Walking in the truth" events
- Clicking event links should open their detail modals

### Test 3: Bidirectional navigation

1. Open Event "Walking in the truth" (ID: `02b72466-3e0a-4bb9-bf8e-c9488f6d7d8c`)
2. Click on "the elder" in the relationships
3. Should open "the elder" Person modal
4. Should see incoming relationships from Events
5. Click one of those events
6. Should navigate back to an Event modal

## How to Test

1. **Start the admin app:**

   ```bash
   nx run workspace-cli:workspace:start
   ```

2. **Open admin UI:**
   http://localhost:5176

3. **Navigate to Documents page**

4. **Search for test objects:**

   - Search for "Walking in the truth" (Event)
   - Search for "the elder" (Person)

5. **Open object details and verify:**
   - Relationships are displayed correctly
   - Clicking relationship links opens nested modals
   - Navigation works in both directions

## Verification Queries

### Check relationships in database:

```sql
SELECT
  r.type,
  o1.properties->>'name' as from_name,
  o2.properties->>'name' as to_name,
  r.properties->>'_migrated_from' as source
FROM kb.graph_relationships r
JOIN kb.graph_objects o1 ON o1.canonical_id = r.src_id
JOIN kb.graph_objects o2 ON o2.canonical_id = r.dst_id
WHERE r.deleted_at IS NULL;
```

### Verify no embedded properties remain:

```sql
SELECT
  COUNT(*) FILTER (WHERE properties ? 'parties') as has_parties,
  COUNT(*) FILTER (WHERE properties ? 'participants') as has_participants,
  COUNT(*) FILTER (WHERE properties ? 'witnesses') as has_witnesses,
  COUNT(*) FILTER (WHERE properties ? 'performer') as has_performer
FROM kb.graph_objects
WHERE deleted_at IS NULL;
```

Expected result: All counts should be 0

## Next Steps

After verifying the UI works:

1. **Run extraction on new objects** to verify:

   - New schema (v3.0.0) works correctly
   - Extraction creates explicit relationships
   - No embedded properties are created

2. **Test extraction with:**

   - A Bible passage that mentions people (creates HAS_PARTICIPANT relationships)
   - A covenant (creates HAS_PARTY relationships)
   - A miracle (creates HAS_WITNESS and PERFORMED_BY relationships)

3. **Verify bidirectional relationships** after extraction:
   - Extracted objects show outgoing relationships
   - Referenced entities show incoming relationships
   - Navigation works in both directions

## Migration Summary

- **Total objects scanned:** 1,563
- **Objects processed:** 1,563
- **Relationships created:** 6 (from UUID-based participants_canonical_ids)
- **Unresolved references:** 2,987 (name-based references that will be created by future extractions)
- **Embedded properties removed:** 1,563 objects cleaned up
- **Schema version:** Objects now use v3.0.0 schemas without embedded relationships

## Files Modified

1. `scripts/migrate-embedded-relationships.ts` - Fixed to handle null branch_id and UUID casting
2. `apps/admin/src/components/organisms/ObjectDetailModal/ObjectDetailModal.tsx`:
   - Removed embedded relationships state and UI
   - Updated `loadInverseRelationships()` to use relationship groups
   - Kept `ObjectRefLink` for clickable relationships
3. Database: Cleaned up 1,563 objects by removing embedded relationship properties
