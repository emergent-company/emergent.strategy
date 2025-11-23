# Remove Embedded Relationships from Object Type Schemas

**Status:** ✅ Completed  
**Date:** 2025-11-21  
**Related:** [Add Relationship Types to Template Pack](./add-relationship-types-to-template-pack.md)

## Overview

Removed embedded relationship properties from Event, Covenant, and Miracle object type schemas to enforce explicit relationship modeling via `kb.graph_relationships` table.

## Changes Made

### 1. Event Schema (v2.0.0 → v3.0.0)

**Removed:**
```typescript
participants: {
  type: 'array',
  items: { type: 'string' },
  description: 'People or groups participating in the event'
}
```

**Replacement:** Use explicit `HAS_PARTICIPANT` relationships

**Updated Extraction Prompts:**
- System: "Participants should be represented as HAS_PARTICIPANT relationships, not embedded in properties."
- User: "Do NOT include a participants array - participants will be linked via explicit HAS_PARTICIPANT relationships."

### 2. Covenant Schema (v2.0.0 → v3.0.0)

**Removed:**
```typescript
parties: {
  type: 'array',
  items: { type: 'string' },
  description: 'Parties involved in the covenant'
}
```

**Replacement:** Use explicit `HAS_PARTY` relationships

**Updated Extraction Prompts:**
- System: "Parties should be represented as HAS_PARTY relationships, not embedded in properties."
- User: "Do NOT include a parties array - parties will be linked via explicit HAS_PARTY relationships."

### 3. Miracle Schema (v2.0.0 → v3.0.0)

**Removed:**
```typescript
performer: {
  type: 'string',
  description: 'Who performed the miracle'
},
witnesses: {
  type: 'array',
  items: { type: 'string' },
  description: 'Who witnessed the miracle'
}
```

**Replacements:**
- Performer: Use explicit `PERFORMED_BY` relationships
- Witnesses: Use explicit `HAS_WITNESS` relationships

**Updated Extraction Prompts:**
- System: "Performer and witnesses should be represented as PERFORMED_BY and HAS_WITNESS relationships, not embedded in properties."
- User: "Do NOT include performer or witnesses fields - these will be linked via explicit PERFORMED_BY and HAS_WITNESS relationships."

## Schema Versions

All three schemas bumped from `2.0.0` → `3.0.0`:
- Event: Now v3.0.0 (removed participants)
- Covenant: Now v3.0.0 (removed parties)
- Miracle: Now v3.0.0 (removed performer, witnesses)

## Impact

### Extraction Behavior

**Before (v2.0.0):**
```json
{
  "type": "Event",
  "properties": {
    "name": "Crossing the Red Sea",
    "participants": ["Moses", "Israelites", "Pharaoh"]
  }
}
```

**After (v3.0.0):**
```json
{
  "type": "Event",
  "properties": {
    "name": "Crossing the Red Sea"
  }
}
```

With separate relationships:
```sql
INSERT INTO kb.graph_relationships 
  (from_object_id, to_object_id, relationship_type, ...)
VALUES
  (event_id, moses_id, 'HAS_PARTICIPANT', ...),
  (event_id, israelites_id, 'HAS_PARTICIPANT', ...),
  (event_id, pharaoh_id, 'HAS_PARTICIPANT', ...);
```

### Existing Data

**No automatic migration** - existing objects with embedded properties are unaffected. They will continue to work but should be migrated via separate script.

See: `docs/plans/migrate-embedded-relationships-to-table.md`

## Testing

After running seed script:

```bash
npm run seed:bible-template
```

Verify:
1. ✅ Template pack version updated
2. ✅ New relationship types available (HAS_PARTY, HAS_PARTICIPANT, HAS_WITNESS, PERFORMED_BY)
3. ✅ Schema versions show 3.0.0
4. ✅ Extraction prompts reference explicit relationships

## Files Modified

- `scripts/seed-bible-template-pack.ts` (lines 611-638, 685-713)
  - Event schema and extraction prompts
  - Covenant schema and extraction prompts
  - Miracle schema and extraction prompts

## Next Steps

1. ✅ **Completed:** Schema definitions updated
2. ✅ **Completed:** Extraction prompts updated
3. ✅ **Completed:** Seed script run successfully
4. ⏭️ **TODO:** Create migration script to convert existing embedded relationships
5. ⏭️ **TODO:** Test extraction with new schemas
6. ⏭️ **TODO:** Update admin UI to show/create explicit relationships

## Rollback

If needed, revert schemas to v2.0.0 and restore embedded properties:

```typescript
// Event
participants: {
  type: 'array',
  items: { type: 'string' },
  description: 'People or groups participating in the event'
}

// Covenant  
parties: {
  type: 'array',
  items: { type: 'string' },
  description: 'Parties involved in the covenant'
}

// Miracle
performer: {
  type: 'string',
  description: 'Who performed the miracle'
},
witnesses: {
  type: 'array',
  items: { type: 'string' },
  description: 'Who witnessed the miracle'
}
```

Then run seed script again.

## References

- [Add Relationship Types to Template Pack](./add-relationship-types-to-template-pack.md)
- [Migration Plan: Embedded Relationships to Table](../plans/migrate-embedded-relationships-to-table.md)
- [Relationship Types with User-Friendly Names](./relationship-types-user-friendly-names.md)
