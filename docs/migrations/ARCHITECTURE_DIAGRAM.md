# Embedded Relationships Migration - Architecture Diagram

## System Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        TEMPLATE PACK LAYER                              │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │ kb.template_packs                                                 │  │
│  │ ├─ config.object_type_schemas                                     │  │
│  │ │  ├─ Event v3.0.0 (no embedded participants)                     │  │
│  │ │  ├─ Covenant v3.0.0 (no embedded parties)                       │  │
│  │ │  └─ Miracle v3.0.0 (no embedded performer/witnesses)            │  │
│  │ ├─ config.relationship_type_schemas                               │  │
│  │ │  ├─ HAS_PARTY (label: "Has Party", inverseLabel: "Party To")   │  │
│  │ │  ├─ HAS_PARTICIPANT                                             │  │
│  │ │  ├─ HAS_WITNESS                                                 │  │
│  │ │  ├─ PERFORMED_BY                                                │  │
│  │ │  └─ ... 19 other types                                          │  │
│  │ └─ config.ui_configs.__relationships__                            │  │
│  │     └─ Icon, color, labels for each type                          │  │
│  └───────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┴───────────────┐
                    ▼                               ▼
┌─────────────────────────────────┐   ┌──────────────────────────────────┐
│     OLD DATA (Pre-Migration)    │   │    NEW DATA (Post Phase 1)       │
│   kb.graph_objects (v2.0.0)     │   │   kb.graph_objects (v3.0.0)      │
├─────────────────────────────────┤   ├──────────────────────────────────┤
│ Event {                         │   │ Event {                          │
│   name: "Crossing Red Sea",     │   │   name: "Crossing Red Sea",      │
│   participants: [               │   │   // NO participants array!      │
│     "Moses",                    │   │   _schema_version: "3.0.0"       │
│     "Israelites"                │   │ }                                │
│   ],                            │   │                                  │
│   _schema_version: "2.0.0"      │   │ Relationships created via API:   │
│ }                               │   │ event -[HAS_PARTICIPANT]-> moses │
│                                 │   │ event -[HAS_PARTICIPANT]-> isr.  │
│ Covenant {                      │   │                                  │
│   name: "Abrahamic Covenant",   │   │ Covenant {                       │
│   parties: [                    │   │   name: "Abrahamic Covenant",    │
│     "God",                      │   │   // NO parties array!           │
│     "Abraham"                   │   │   _schema_version: "3.0.0"       │
│   ],                            │   │ }                                │
│   _schema_version: "2.0.0"      │   │                                  │
│ }                               │   │ Relationships:                   │
│                                 │   │ covenant -[HAS_PARTY]-> god      │
│ Miracle {                       │   │ covenant -[HAS_PARTY]-> abraham  │
│   name: "Healing Blind Man",    │   │                                  │
│   performer: "Jesus",           │   │ Miracle {                        │
│   witnesses: ["Disciples"],     │   │   name: "Healing Blind Man",     │
│   _schema_version: "2.0.0"      │   │   // NO performer/witnesses!     │
│ }                               │   │   _schema_version: "3.0.0"       │
│                                 │   │ }                                │
│ 1,551 embedded relationships    │   │                                  │
│ across 1,563 objects            │   │ Relationships:                   │
└─────────────────────────────────┘   │ miracle -[PERFORMED_BY]-> jesus  │
                                      │ miracle -[HAS_WITNESS]-> discip. │
                                      └──────────────────────────────────┘
                    │
                    │ Phase 2 Migration Script
                    │ (scripts/migrate-embedded-relationships.ts)
                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                  EXPLICIT RELATIONSHIPS TABLE                           │
│  kb.graph_relationships                                                 │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │ id: uuid-1                                                        │  │
│  │ from_canonical_id: event-crossing-red-sea                         │  │
│  │ to_canonical_id: person-moses                                     │  │
│  │ relationship_type: "HAS_PARTICIPANT"                              │  │
│  │ properties: {                                                     │  │
│  │   _migrated_from: "participants",                                │  │
│  │   _migrated_at: "2025-11-21T10:00:00Z",                          │  │
│  │   _source_object_id: "event-123"                                 │  │
│  │ }                                                                 │  │
│  │ version: 1                                                        │  │
│  │ canonical_id: rel-uuid-1                                          │  │
│  ├───────────────────────────────────────────────────────────────────┤  │
│  │ ... ~1,551 total relationships migrated                           │  │
│  └───────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         UI / API LAYER                                  │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │ GraphService.getRelationships()                                   │  │
│  │  ↓                                                                 │  │
│  │ SELECT * FROM kb.graph_relationships                              │  │
│  │ WHERE from_canonical_id = $1                                      │  │
│  │   AND relationship_type = 'HAS_PARTICIPANT'                       │  │
│  │  ↓                                                                 │  │
│  │ Display: "Moses participated in Crossing the Red Sea"             │  │
│  │          ^^^^^ (uses label from template pack)                    │  │
│  └───────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
```

## Data Flow: Before vs After

### Before (Embedded Properties)

```
┌──────────────────┐
│ LLM Extraction   │
│ (Event detected) │
└────────┬─────────┘
         │
         ▼
┌──────────────────────────────────┐
│ Create Event Object              │
│ {                                │
│   name: "Crossing Red Sea",      │
│   participants: [                │  ◄── Embedded in JSONB
│     "Moses", "Israelites"        │
│   ]                              │
│ }                                │
└────────┬─────────────────────────┘
         │
         ▼
┌──────────────────────────────────┐
│ Query: Find participants         │
│                                  │
│ SELECT * FROM kb.graph_objects   │
│ WHERE properties->'participants' │  ◄── Slow JSONB scan
│   @> '["Moses"]'::jsonb          │
│                                  │
│ ⚠️  No indexes, slow traversal   │
└──────────────────────────────────┘
```

### After (Explicit Relationships)

```
┌──────────────────┐
│ LLM Extraction   │
│ (Event detected) │
└────────┬─────────┘
         │
         ▼
┌──────────────────────────────────┐
│ Create Event Object              │
│ {                                │
│   name: "Crossing Red Sea"       │  ◄── Clean, no embedded data
│ }                                │
└────────┬─────────────────────────┘
         │
         ▼
┌──────────────────────────────────┐
│ Create Relationships             │
│                                  │
│ event -[HAS_PARTICIPANT]-> moses │  ◄── Explicit, indexed
│ event -[HAS_PARTICIPANT]-> isr.  │
└────────┬─────────────────────────┘
         │
         ▼
┌──────────────────────────────────┐
│ Query: Find participants         │
│                                  │
│ SELECT * FROM                    │
│   kb.graph_relationships r       │
│   JOIN kb.graph_objects o        │
│     ON o.canonical_id =          │  ◄── Fast indexed join
│        r.to_canonical_id         │
│ WHERE r.from_canonical_id = $1   │
│   AND r.relationship_type =      │
│       'HAS_PARTICIPANT'           │
│                                  │
│ ✅ Indexed, fast traversal       │
└──────────────────────────────────┘
```

## Migration Process Flow

```
┌────────────────────────────────────────────────────────────────────┐
│ Phase 1: Schema Updates (✅ COMPLETE)                              │
├────────────────────────────────────────────────────────────────────┤
│                                                                    │
│  1. Update Template Pack                                           │
│     ├─ Add labels to relationship types                            │
│     ├─ Create 4 new relationship types                             │
│     └─ Update object schemas (v3.0.0)                              │
│                                                                    │
│  2. Deploy Changes                                                 │
│     └─ npm run seed:bible-template                                 │
│                                                                    │
│  3. Result                                                         │
│     └─ New extractions use explicit relationships                  │
│        Old objects unchanged (backwards compatible)                │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌────────────────────────────────────────────────────────────────────┐
│ Phase 2: Data Migration (🚧 READY)                                │
├────────────────────────────────────────────────────────────────────┤
│                                                                    │
│  Step 1: Scan Objects with Embedded Properties                    │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │ SELECT * FROM kb.graph_objects                               │ │
│  │ WHERE properties->>'parties' IS NOT NULL                     │ │
│  │    OR properties->>'participants' IS NOT NULL                │ │
│  │    OR properties->>'witnesses' IS NOT NULL                   │ │
│  │    OR properties->>'performer' IS NOT NULL                   │ │
│  │                                                              │ │
│  │ Result: ~1,563 objects with 1,551 references                 │ │
│  └──────────────────────────────────────────────────────────────┘ │
│                              │                                     │
│                              ▼                                     │
│  Step 2: Entity Resolution                                         │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │ For each reference (e.g., "Moses"):                          │ │
│  │   1. Is it a canonical_id? (12 objects)                      │ │
│  │      → Use directly                                           │ │
│  │   2. Is it a name? (1,539 references)                        │ │
│  │      → Lookup by properties->>'name'                          │ │
│  │      → Try case-insensitive match                             │ │
│  │      → Log if unresolved                                      │ │
│  │                                                              │ │
│  │ Result: canonical_id or null                                 │ │
│  └──────────────────────────────────────────────────────────────┘ │
│                              │                                     │
│                              ▼                                     │
│  Step 3: Create Explicit Relationships                             │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │ For each resolved reference:                                 │ │
│  │   INSERT INTO kb.graph_relationships (                       │ │
│  │     canonical_id,                                            │ │
│  │     from_canonical_id,  ← source object                      │ │
│  │     to_canonical_id,    ← resolved entity                    │ │
│  │     relationship_type,  ← HAS_PARTY, etc.                    │ │
│  │     properties: {                                            │ │
│  │       _migrated_from: "participants",                        │ │
│  │       _migrated_at: "2025-11-21T10:00:00Z"                   │ │
│  │     }                                                         │ │
│  │   )                                                           │ │
│  │                                                              │ │
│  │ Result: ~1,551 explicit relationships created                │ │
│  └──────────────────────────────────────────────────────────────┘ │
│                              │                                     │
│                              ▼                                     │
│  Step 4: Verification                                              │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │ SELECT COUNT(*) FROM kb.graph_relationships                  │ │
│  │ WHERE properties->>'_migrated_from' IS NOT NULL              │ │
│  │                                                              │ │
│  │ Expected: ~1,551                                             │ │
│  │ Unresolved: < 5% (acceptable)                                │ │
│  └──────────────────────────────────────────────────────────────┘ │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
```

## Query Performance Comparison

### Before: JSONB Array Scan

```sql
-- Find all events Moses participated in
SELECT * FROM kb.graph_objects
WHERE type = 'Event'
  AND properties->'participants' @> '["Moses"]'::jsonb;

Performance:
  ⚠️  Sequential scan of all Event objects
  ⚠️  JSONB array contains check (@>)
  ⚠️  No index utilization
  ⚠️  O(n) where n = total events
  ⏱️  ~50-200ms for 1000 events
```

### After: Indexed Relationship Join

```sql
-- Find all events Moses participated in
SELECT e.* 
FROM kb.graph_objects e
JOIN kb.graph_relationships r 
  ON r.from_canonical_id = e.canonical_id
WHERE e.type = 'Event'
  AND r.to_canonical_id = 'moses-canonical-id'
  AND r.relationship_type = 'HAS_PARTICIPANT';

Performance:
  ✅ Index seek on canonical_id
  ✅ Index seek on relationship_type
  ✅ Direct join (no array scan)
  ✅ O(1) or O(log n) lookup
  ⏱️  ~1-5ms for 1000 events
```

**Performance improvement: ~10-40x faster**

## Relationship Type Hierarchy

```
kb.template_packs.config.relationship_type_schemas
│
├─ HAS_PARTY
│  ├─ type: "HAS_PARTY"
│  ├─ label: "Has Party"
│  ├─ inverseLabel: "Party To"
│  ├─ sourceTypes: ["Covenant"]
│  ├─ destTypes: ["Person", "Group", "Angel"]
│  └─ multiplicity: { src: "one", dst: "many" }
│
├─ HAS_PARTICIPANT
│  ├─ type: "HAS_PARTICIPANT"
│  ├─ label: "Has Participant"
│  ├─ inverseLabel: "Participated In"
│  ├─ sourceTypes: ["Event"]
│  ├─ destTypes: ["Person", "Group", "Angel"]
│  └─ multiplicity: { src: "one", dst: "many" }
│
├─ HAS_WITNESS
│  ├─ type: "HAS_WITNESS"
│  ├─ label: "Witnessed By"
│  ├─ inverseLabel: "Witnessed"
│  ├─ sourceTypes: ["Miracle", "Event", "Covenant"]
│  ├─ destTypes: ["Person", "Group", "Angel"]
│  └─ multiplicity: { src: "one", dst: "many" }
│
├─ PERFORMED_BY
│  ├─ type: "PERFORMED_BY"
│  ├─ label: "Performed By"
│  ├─ inverseLabel: "Performed"
│  ├─ sourceTypes: ["Miracle", "Event"]
│  ├─ destTypes: ["Person", "Angel"]
│  └─ multiplicity: { src: "one", dst: "one" }
│
└─ ... 19 other relationship types
```

## UI Display Examples

### Before (Internal Types)

```
Event: Crossing the Red Sea
  └─ HAS_PARTICIPANT
      ├─ Moses
      └─ Israelites
```

### After (User-Friendly Labels)

```
Event: Crossing the Red Sea
  └─ Has Participant
      ├─ Moses
      └─ Israelites

Person: Moses
  └─ Participated In
      ├─ Crossing the Red Sea
      └─ Receiving Ten Commandments
```

## Migration Script Architecture

```typescript
class EmbeddedRelationshipMigrator {
  
  // 1. Connect to database
  async connect()
  
  // 2. Main migration loop
  async migrate() {
    for (const mapping of RELATIONSHIP_MAPPINGS) {
      await this.processMappingBatch(mapping)
    }
  }
  
  // 3. Process batch of objects
  private async processMappingBatch(mapping) {
    // Find objects with embedded property
    const objects = await this.findObjects(mapping)
    
    // Process each object
    for (const obj of objects) {
      await this.processObject(obj, mapping)
    }
  }
  
  // 4. Process single object
  private async processObject(obj, mapping) {
    // Extract references from embedded property
    const references = obj.properties[mapping.propertyPath]
    
    // Resolve each reference
    for (const ref of references) {
      const canonicalId = await this.resolveReference(ref)
      
      if (canonicalId) {
        await this.createRelationship({
          from: obj.canonical_id,
          to: canonicalId,
          type: mapping.relationshipType
        })
      }
    }
  }
  
  // 5. Entity resolution
  private async resolveReference(name) {
    // Try exact match
    // Try case-insensitive
    // Log if unresolved
  }
  
  // 6. Create relationship
  private async createRelationship(params) {
    // Check for duplicates
    // Insert into kb.graph_relationships
    // Add migration metadata
  }
}
```

## Database Schema

```sql
-- Objects (before migration)
CREATE TABLE kb.graph_objects (
  id UUID PRIMARY KEY,
  canonical_id UUID NOT NULL,
  type VARCHAR NOT NULL,
  properties JSONB,  -- Contains embedded relationships
  _schema_version VARCHAR DEFAULT '2.0.0'
);

-- Objects (after Phase 1, new extractions)
-- Same table, but new objects have:
-- - properties WITHOUT embedded relationships
-- - _schema_version = '3.0.0'

-- Relationships (after Phase 2)
CREATE TABLE kb.graph_relationships (
  id UUID PRIMARY KEY,
  canonical_id UUID NOT NULL,
  from_canonical_id UUID NOT NULL,
  to_canonical_id UUID NOT NULL,
  relationship_type VARCHAR NOT NULL,
  properties JSONB,  -- Contains _migrated_from, _migrated_at
  version INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Indexes for fast lookups
  INDEX idx_from_canonical (from_canonical_id),
  INDEX idx_to_canonical (to_canonical_id),
  INDEX idx_relationship_type (relationship_type),
  INDEX idx_from_type (from_canonical_id, relationship_type)
);
```

## Key Design Decisions

### 1. Why Keep Embedded Properties?

**Decision:** Don't delete embedded properties after migration

**Rationale:**
- ✅ Backwards compatible (old code still works)
- ✅ Safe rollback (can delete relationships and retry)
- ✅ Gradual transition (can verify explicit relationships work)
- ✅ Audit trail (can compare embedded vs explicit)

### 2. Why Add Migration Metadata?

**Decision:** Add `_migrated_from`, `_migrated_at` to relationships

**Rationale:**
- ✅ Track which relationships came from migration
- ✅ Can query migrated vs manual relationships
- ✅ Helps debugging and verification
- ✅ Can selectively revert migration

### 3. Why Use Canonical IDs?

**Decision:** Relationships use canonical_id, not object id

**Rationale:**
- ✅ Survives object versioning
- ✅ Consistent across branches
- ✅ Enables relationship versioning
- ✅ Follows existing architecture

### 4. Why Batch Processing?

**Decision:** Process objects in configurable batches

**Rationale:**
- ✅ Memory efficient (don't load all 1,563 objects)
- ✅ Progress tracking
- ✅ Can pause/resume if needed
- ✅ Reduces database connection load

## Rollback Strategy

```
Current State (Phase 1):
├─ Template pack: Updated ✅
├─ Object schemas: v3.0.0 ✅
├─ Embedded data: Intact ✅
└─ Explicit relationships: 0

After Phase 2:
├─ Template pack: Updated ✅
├─ Object schemas: v3.0.0 ✅
├─ Embedded data: Intact ✅
└─ Explicit relationships: ~1,551

Rollback (if needed):
└─ DELETE FROM kb.graph_relationships
   WHERE properties->>'_migrated_from' IS NOT NULL;
   
Result: Back to "Current State"
   ├─ Template pack: Still updated (fine)
   ├─ Object schemas: Still v3.0.0 (fine)
   ├─ Embedded data: Intact ✅
   └─ Explicit relationships: 0
```

**Low Risk:** Can always roll back by deleting migrated relationships.

---

**This architecture enables:**
- ⚡ 10-40x faster relationship queries
- 🔗 Referential integrity and versioning
- 🎨 User-friendly UI labels
- 📊 Better graph analytics
- 🔄 Safe, incremental migration
