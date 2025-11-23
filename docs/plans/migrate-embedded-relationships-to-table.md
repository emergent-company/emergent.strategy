# Migration Plan: Embedded Relationships → Explicit Relationship Table

**Status:** 🚧 Phase 1 Complete - Schema Updates Done  
**Updated:** 2025-11-21

## Progress Summary

### ✅ Completed (Phase 1)

- **Relationship type schemas defined** with user-friendly labels
- **Template pack updated** with 4 new relationship types (HAS_PARTY, HAS_PARTICIPANT, HAS_WITNESS, PERFORMED_BY)
- **Object schemas cleaned** - removed embedded properties from Event, Covenant, Miracle (v2.0.0 → v3.0.0)
- **Extraction prompts updated** to instruct LLM to use explicit relationships
- **Seed script run** - changes deployed to database

### 🚧 Next Steps (Phase 2)

- Create migration script to convert existing 1,551 embedded relationships
- Implement entity resolution (name → canonical_id)
- Test extraction with new schemas
- Verify UI displays explicit relationships correctly

## Problem Statement

Currently, relationships between objects are stored in two ways:

1. **Embedded in JSONB properties** (active, ~1,551 relationships):

   - `properties.parties` (170 objects)
   - `properties.participants` (570 objects)
   - `properties.witnesses` (357 objects)
   - `properties.performer` (454 objects)
   - `properties.participants_canonical_ids` (12 objects - direct canonical_id refs)

2. **Explicit relationships table** `kb.graph_relationships` (empty, 0 records)

**Performance Impact:**

- Querying JSONB arrays requires expensive array scans
- Cannot use indexes effectively for relationship traversal
- Relationship counts require scanning all object properties
- No referential integrity constraints
- No relationship-level versioning or provenance

## Current Infrastructure

The system already has full relationship table support:

- ✅ `kb.graph_relationships` table with versioning (`version`, `canonical_id`, `supersedes_id`)
- ✅ `GraphService.createRelationship()` with schema validation
- ✅ Multiplicity constraints (one-to-many, many-to-many)
- ✅ Branch support for relationship isolation
- ✅ Soft delete with `deleted_at`
- ✅ Properties field for metadata
- ✅ Temporal validity (`valid_from`, `valid_to`)
- ✅ Content hashing and change tracking

## Proposed Solution

### Phase 1: Define Relationship Type Schemas

Create relationship type schemas for the embedded reference patterns:

```typescript
// Relationship types extracted from embedded references
const RELATIONSHIP_TYPES = [
  {
    type: 'HAS_PARTY',
    sourceTypes: ['Covenant', 'Agreement'],
    destTypes: ['Person', 'Group', 'Angel'],
    multiplicity: { src: 'one', dst: 'many' },
    description: 'Indicates a party involved in a covenant or agreement',
  },
  {
    type: 'HAS_PARTICIPANT',
    sourceTypes: ['Event', 'Meeting'],
    destTypes: ['Person', 'Group', 'Angel'],
    multiplicity: { src: 'one', dst: 'many' },
    description: 'Indicates a participant in an event or meeting',
  },
  {
    type: 'HAS_WITNESS',
    sourceTypes: ['Miracle', 'Event', 'Covenant'],
    destTypes: ['Person', 'Group', 'Angel'],
    multiplicity: { src: 'one', dst: 'many' },
    description: 'Indicates a witness to an event, miracle, or covenant',
  },
  {
    type: 'PERFORMED_BY',
    sourceTypes: ['Miracle', 'Event'],
    destTypes: ['Person', 'Angel', 'God'],
    multiplicity: { src: 'one', dst: 'one' },
    description: 'Indicates who performed a miracle or action',
  },
];
```

### Phase 2: Entity Resolution Strategy

**Challenge:** Embedded references are often string names ("David", "God"), not canonical_ids.

**Options:**

1. **Name-based lookup** (immediate):

   - Look up by `properties.name` or `key` in `kb.graph_objects`
   - Match within same project context
   - Handle ambiguity (multiple "David" objects)

2. **Use existing canonical_ids** (partial):

   - `properties.participants_canonical_ids` already has canonical_ids (12 objects)
   - Migrate these first as proof-of-concept

3. **LLM-assisted resolution** (future):
   - Use context from source document
   - Disambiguate based on type, properties, time period
   - Store resolution confidence score

**Recommended approach:** Start with #2 (canonical_ids), then #1 (name matching with manual review), defer #3.

### Phase 3: Migration Script

```typescript
// Migration script structure
async function migrateEmbeddedRelationships() {
  const objects = await db.query(`
    SELECT id, canonical_id, type, properties, project_id
    FROM kb.graph_objects
    WHERE deleted_at IS NULL
      AND (
        properties ? 'parties' OR
        properties ? 'participants' OR
        properties ? 'participants_canonical_ids' OR
        properties ? 'witnesses' OR
        properties ? 'performer'
      )
  `);

  const relationshipsToCreate = [];
  const resolutionLog = [];

  for (const obj of objects.rows) {
    // Handle participants_canonical_ids (direct canonical_id refs)
    if (obj.properties.participants_canonical_ids) {
      for (const canonical_id of obj.properties.participants_canonical_ids) {
        // Find the current head version of target object
        const target = await findHeadByCanonicalId(
          canonical_id,
          obj.project_id
        );
        if (target) {
          relationshipsToCreate.push({
            type: 'HAS_PARTICIPANT',
            src_id: obj.id,
            dst_id: target.id,
            project_id: obj.project_id,
            properties: {
              _migrated_from: 'participants_canonical_ids',
              _migration_date: new Date().toISOString(),
            },
          });
        } else {
          resolutionLog.push({
            object: obj.id,
            ref: canonical_id,
            status: 'not_found',
          });
        }
      }
    }

    // Handle parties (string names)
    if (obj.properties.parties && Array.isArray(obj.properties.parties)) {
      for (const partyName of obj.properties.parties) {
        const target = await resolveByName(partyName, obj.project_id);
        if (target) {
          relationshipsToCreate.push({
            type: 'HAS_PARTY',
            src_id: obj.id,
            dst_id: target.id,
            project_id: obj.project_id,
            properties: {
              _migrated_from: 'parties',
              _migration_date: new Date().toISOString(),
              _original_name: partyName,
              _resolution_confidence: target.confidence,
            },
          });
        } else {
          resolutionLog.push({
            object: obj.id,
            ref: partyName,
            status: 'unresolved',
          });
        }
      }
    }

    // Similar logic for participants, witnesses, performer...
  }

  // Bulk insert relationships
  for (const rel of relationshipsToCreate) {
    await graphService.createRelationship(rel, null, rel.project_id);
  }

  // Report results
  return {
    total_objects: objects.rows.length,
    relationships_created: relationshipsToCreate.length,
    unresolved: resolutionLog.filter((r) => r.status === 'unresolved').length,
    not_found: resolutionLog.filter((r) => r.status === 'not_found').length,
    log: resolutionLog,
  };
}
```

### Phase 4: Dual-Write Period

During transition, support both representations:

1. **Write:** When creating/updating objects with embedded refs, also create explicit relationships
2. **Read:** Query includes both embedded refs and explicit relationships
3. **UI:** Show both types in relationship displays

### Phase 5: Deprecate Embedded References

After validation period:

1. Update extraction jobs to use `participants_canonical_ids` exclusively
2. Stop populating `parties`, `participants`, `witnesses` arrays
3. Archive existing embedded data (keep for audit)
4. Update schemas to make these fields deprecated

### Phase 6: Update Query Performance

Replace JSONB array counting:

```sql
-- OLD (slow):
COALESCE(jsonb_array_length(o.properties->'participants'), 0)

-- NEW (fast):
(SELECT COUNT(DISTINCT r.canonical_id)::int
 FROM kb.graph_relationships r
 WHERE (r.src_id = o.id OR r.dst_id = o.id)
 AND r.deleted_at IS NULL)
```

With proper indexes:

```sql
CREATE INDEX idx_graph_relationships_src_id ON kb.graph_relationships(src_id)
  WHERE deleted_at IS NULL;
CREATE INDEX idx_graph_relationships_dst_id ON kb.graph_relationships(dst_id)
  WHERE deleted_at IS NULL;
CREATE INDEX idx_graph_relationships_type ON kb.graph_relationships(type, project_id)
  WHERE deleted_at IS NULL;
```

## Compatibility with Dynamic Schema System

**Concern:** Will explicit relationships work with the dynamic type system?

**Answer:** Yes, the system is designed for this:

1. **Relationship Type Registry:**

   - Can be stored in `kb.project_object_type_registry` or separate table
   - Schema defines: source types, dest types, multiplicity, properties schema
   - Template packs already include relationship schemas (see spec: `trace_to`, `refine`, `realize`, etc.)

2. **Schema Validation:**

   - `GraphService.createRelationship()` already calls `schemaRegistry.getRelationshipValidator()`
   - Validates relationship properties against JSON schema
   - Enforces multiplicity constraints dynamically

3. **Extraction Integration:**

   - Extraction jobs can emit relationship candidates
   - Use `participants_canonical_ids` field for resolved entities
   - Store confidence scores in relationship properties

4. **Versioning:**
   - Relationships are versioned like objects (canonical_id, version, supersedes_id)
   - Branch isolation supported
   - Change tracking with diff summaries

## Benefits

1. **Performance:**

   - Index-based relationship traversal (100-1000x faster)
   - Efficient neighbor queries
   - Fast aggregation (counts, grouping)

2. **Data Integrity:**

   - Foreign key constraints
   - Referential integrity checks
   - Cascade delete options

3. **Queryability:**

   - Graph traversal algorithms
   - Shortest path queries
   - Pattern matching
   - Relationship type filtering

4. **Provenance:**

   - Track when/how relationships were created
   - Version history
   - Confidence scores

5. **Compatibility:**
   - Works with existing dynamic schema system
   - Template packs already designed for explicit relationships
   - No breaking changes to object schemas

## Risks & Mitigation

| Risk                                     | Impact                         | Mitigation                                          |
| ---------------------------------------- | ------------------------------ | --------------------------------------------------- |
| Entity resolution ambiguity              | Multiple "David" objects       | Manual review, disambiguation UI, confidence scores |
| Migration breaks existing queries        | Objects lose relationships     | Dual-write period, comprehensive testing            |
| Performance degradation during migration | Slow queries during transition | Run during low-usage period, batch processing       |
| Incomplete migration                     | Some relationships lost        | Detailed logging, rollback plan, validation queries |

## Timeline Estimate

- **Phase 1 (Define schemas):** 2 days
- **Phase 2 (Entity resolution):** 3 days
- **Phase 3 (Migration script):** 5 days
- **Phase 4 (Dual-write period):** 2 weeks (monitoring)
- **Phase 5 (Deprecation):** 1 day
- **Phase 6 (Query optimization):** 2 days

**Total:** ~4 weeks with testing and validation

## Next Steps

1. ✅ Document current state and proposal
2. Review and approve migration plan
3. Create relationship type schemas
4. Implement entity resolution logic
5. Build migration script with dry-run mode
6. Test on subset of data
7. Run full migration with monitoring
8. Validate relationship counts and queries
9. Update UI to use explicit relationships
10. Deprecate embedded references

## References

- Spec: `docs/spec/04-data-model.md` (Relationship storage design)
- Code: `apps/server/src/modules/graph/graph.service.ts:836` (createRelationship)
- Code: `apps/server/src/modules/graph/schema-registry.service.ts` (getRelationshipValidator)
- Database: `kb.graph_relationships` table structure
