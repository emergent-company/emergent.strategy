# Phase 3 Task 3: Entity Linking - Key Match Strategy

**Status**: ✅ Complete  
**Date**: January 3, 2025  
**Test Coverage**: 23 tests passing (100%)

## Overview

Implements intelligent entity linking to avoid duplicate objects in the knowledge graph and merge new information into existing entities. This task implements the **key-based matching** strategy with support for exact key matches, normalized name matching, and property-based key extraction.

## Components

### EntityLinkingService

**Location**: `src/modules/extraction-jobs/entity-linking.service.ts`

A new service that provides sophisticated entity linking capabilities:

#### Core Methods

1. **`findSimilarObject(entity, projectId, strategy)`**
   - Entry point for similarity detection
   - Supports strategies: `always_new`, `key_match`, `vector_similarity` (future)
   - Returns: `objectId | null`

2. **`findByKeyMatch(entity, projectId)` (private)**
   - Multi-strategy key matching implementation
   - Tries in order:
     1. Exact `business_key` match
     2. Normalized `name` match (lowercase, trimmed)
     3. Property-based key extraction (`id`, `code`, `identifier`, etc.)
   - Returns: `objectId | null`

3. **`decideMergeAction(entity, projectId, strategy)`**
   - Determines if entity should be created, merged, or skipped
   - Uses property overlap calculation to decide merge vs skip
   - Returns: `{ action: 'create' | 'merge' | 'skip', existingObjectId?: string }`
   - **Thresholds**:
     - `overlap > 0.9` → **skip** (already exists, high similarity)
     - `overlap ≤ 0.9` → **merge** (partial match, update properties)
     - `no match` → **create** (new entity)

4. **`mergeEntityIntoObject(existingObjectId, entity, jobId)`**
   - Merges new entity properties into existing object
   - Strategy: New values override existing, missing properties preserved
   - Adds metadata: `_extraction_last_updated_by_job`, `_extraction_last_updated_at`
   - Returns: `objectId`

5. **`calculatePropertyOverlap(entity, existingProperties)`**
   - Calculates similarity ratio (0.0 - 1.0) based on property matching
   - Formula: `matchingValues / totalUniqueKeys`
   - Supports case-insensitive string comparison
   - Used to decide merge vs skip

#### Helper Methods

- **`findByExactKey(projectId, typeName, key)`**: Database query for exact key match
- **`findByNormalizedName(projectId, typeName, normalizedName)`**: Database query with normalized name
- **`normalizeKey(key)`**: Lowercase, trim whitespace
- **`extractKeyFromProperties(entity)`**: Extract key from common property fields
  - Priority fields: `id`, `identifier`, `code`, `reference`, `key`, `external_id`, `system_id`
  - Type-specific fields: `<type>_id`, `<type>_code`, `<type>_reference`

## Integration

### ExtractionWorkerService Changes

**Updated Flow**:

```typescript
// OLD: Simple boolean check
const shouldCreate = await this.shouldCreateEntity(entity, job, strategy);
if (shouldCreate) {
    await this.graphService.createObject(...);
}

// NEW: Sophisticated decision with merge support
const linkingDecision = await this.entityLinking.decideMergeAction(
    entity, job.project_id, strategy
);

if (linkingDecision.action === 'skip') {
    // Already exists with high similarity
    continue;
}

if (linkingDecision.action === 'merge') {
    // Merge into existing object
    await this.entityLinking.mergeEntityIntoObject(
        linkingDecision.existingObjectId, entity, job.id
    );
    continue;
}

if (linkingDecision.action === 'create') {
    // Create new object
    await this.graphService.createObject(...);
}
```

**Removed Methods**:
- `shouldCreateEntity()` - Replaced by `EntityLinkingService.decideMergeAction()`
- `objectExistsByKey()` - Replaced by `EntityLinkingService.findByExactKey()`

### Module Registration

Added `EntityLinkingService` to `ExtractionJobModule` providers.

## Test Coverage

**File**: `src/modules/extraction-jobs/__tests__/entity-linking.service.spec.ts`

### Test Suites (23 tests)

1. **findSimilarObject** (6 tests)
   - always_new strategy returns null
   - key_match finds exact key match
   - Normalized name match fallback
   - Property key extraction fallback
   - Returns null when no matches found
   - vector_similarity fallback to key_match

2. **mergeEntityIntoObject** (3 tests)
   - Merges properties correctly (new override, existing preserved)
   - Throws error if object not found
   - Preserves existing description if new entity has none

3. **calculatePropertyOverlap** (5 tests)
   - Returns 1.0 for identical properties
   - Returns 0.5 for partial overlap
   - Case-insensitive string matching
   - Returns 0.0 for empty entity properties
   - Returns 0.0 for no overlapping keys

4. **decideMergeAction** (5 tests)
   - Returns create for always_new strategy
   - Returns create if no similar object found
   - Returns skip for high overlap (>90%)
   - Returns merge for partial overlap (<90%)
   - Returns create if object deleted between find and get

5. **Key Normalization** (1 test)
   - Normalizes keys to lowercase and trimmed

6. **Property Key Extraction** (3 tests)
   - Extracts `id` field as key
   - Extracts `code` field if `id` not present
   - Extracts type-specific keys (e.g., `product_id`)

### Test Results

```
✓ entity-linking.service.spec.ts (23 tests) 33ms
  ✓ findSimilarObject (6 tests)
  ✓ mergeEntityIntoObject (3 tests)
  ✓ calculatePropertyOverlap (5 tests)
  ✓ decideMergeAction (5 tests)
  ✓ key normalization (1 test)
  ✓ property key extraction (3 tests)
```

**Overall Test Suite**: 105 tests passing (7 test files)

## Key Matching Strategies

### 1. Exact Business Key Match

```typescript
// Entity has explicit business_key
entity.business_key = 'prod-001';

// Matches database record
SELECT id FROM kb.graph_objects
WHERE project_id = $1 AND type = $2 AND key = $3
```

**Use Case**: Entities with explicit identifiers from source systems

### 2. Normalized Name Match

```typescript
// Normalize entity name
normalizedName = entity.name.trim().toLowerCase(); // 'test product'

// Match against normalized database names
SELECT id FROM kb.graph_objects
WHERE project_id = $1 
  AND type = $2
  AND LOWER(TRIM(properties->>'name')) = $3
```

**Use Case**: Entities without business keys but with consistent naming

### 3. Property-Based Key Extraction

```typescript
// Extract key from common property fields
const keyFields = ['id', 'identifier', 'code', 'reference', 'key', ...];
for (const field of keyFields) {
    if (entity.properties[field]) {
        return entity.properties[field];
    }
}

// Try type-specific fields
const typeSpecific = [`${typeName}_id`, `${typeName}_code`, ...];
```

**Use Case**: Entities with identifiers embedded in properties

## Merge Logic

### Property Merge Strategy

```typescript
mergedProperties = {
    ...existingObject.properties,  // Keep existing
    ...entity.properties,           // Override with new
    // Always update metadata
    name: entity.name,
    description: entity.description || existingObject.properties.description,
    _extraction_last_updated_by_job: jobId,
    _extraction_last_updated_at: new Date().toISOString(),
}
```

### Merge Decision Thresholds

- **overlap > 0.9** → **Skip**: Already exists, no significant new information
- **overlap ≤ 0.9** → **Merge**: Partial match, update with new information
- **no match** → **Create**: Entirely new entity

## Logging

```
DEBUG [EntityLinkingService] Found exact key match for Test Product: obj-123
DEBUG [EntityLinkingService] Found normalized name match for Product A: obj-456
DEBUG [EntityLinkingService] Found property-based key match for Product: obj-789
DEBUG [EntityLinkingService] Merged entity Updated Product into existing object obj-123
DEBUG [EntityLinkingService] Skipping entity Product A: high overlap (100%) with existing object obj-123
DEBUG [EntityLinkingService] Merging entity Product A: partial overlap (33%) with existing object obj-456
WARN  [EntityLinkingService] Object obj-deleted not found (may have been deleted)
```

## Future Enhancements

### Task 3.4: Vector Similarity Strategy

- Implement semantic similarity search using pgvector
- Find entities with similar meaning but different names/keys
- Use embeddings for fuzzy matching
- Support configurable similarity threshold

### Task 3.5: Integration Tests

- End-to-end tests with real database
- Test skip/merge/create scenarios
- Verify property preservation and updates
- Test concurrent entity linking

## Configuration

### Entity Linking Strategy

Controlled by `ExtractionJobDto.entity_linking_strategy`:

- `always_new` - Always create new objects (no linking)
- `key_match` - Use key-based matching (current implementation)
- `vector_similarity` - Use semantic similarity (future)

### Database Schema

Uses existing `kb.graph_objects` table:
- `project_id`: Scope for matching
- `type`: Entity type for matching
- `key`: Business key for exact matches
- `properties->>'name'`: Name for normalized matching
- `properties`: Source for property-based key extraction

## Performance Considerations

### Query Optimization

- Uses `LIMIT 1` for early termination
- Indexes on `(project_id, type, key)` for exact matches
- Indexes on `(project_id, type)` for name/property scans

### Fallback Strategy

Tries matching strategies in order of specificity:
1. Exact key (fastest, most accurate)
2. Normalized name (medium speed, good accuracy)
3. Property extraction (slower, good coverage)

Stops at first match to minimize database queries.

### Error Handling

- Catches `NotFoundException` when object deleted between find and get
- Logs warnings but continues processing
- Returns `'create'` action on errors to avoid blocking extraction

## References

- **Specification**: `docs/spec/19-dynamic-object-graph.md` (Entity Linking section)
- **Related Tasks**:
  - Task 3.1: Confidence Scoring (completed)
  - Task 3.2: Quality Thresholds (completed)
  - Task 3.3: Entity Linking - Key Match (this document)
  - Task 3.4: Entity Linking - Vector Similarity (next)
  - Task 3.5: Integration Tests (future)

## Summary

✅ **Implemented**:
- EntityLinkingService with multi-strategy key matching
- Property merge logic with preservation of existing data
- Overlap-based decision making (skip/merge/create)
- 23 comprehensive unit tests (100% passing)
- Integration with ExtractionWorkerService
- Logging and error handling

✅ **Benefits**:
- Prevents duplicate objects in knowledge graph
- Merges new information into existing entities
- Supports multiple key matching strategies
- Configurable via entity_linking_strategy
- Well-tested and documented

🔜 **Next Steps**:
- Task 3.4: Implement vector similarity strategy for semantic matching
- Task 3.5: End-to-end integration tests with database
- Performance testing with large-scale entity linking
