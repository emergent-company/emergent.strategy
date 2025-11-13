# CRITICAL: Type System Schema Mismatch

## Discovery Date: October 25, 2025

## Problem

The refactored schema has a **completely different design** for the type system compared to production. This is not just missing columns - it's a fundamental architectural change.

## Impact

- **22+ test failures** in graph.traversal-advanced.e2e.spec.ts
- Likely affects many more tests
- Production error: `column "project_id" does not exist`
- SchemaRegistryService cannot query schemas

## Production Schema (Old Design)

### object_type_schemas
```sql
CREATE TABLE kb.object_type_schemas (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid,
    project_id uuid,
    type text NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    supersedes_id uuid,
    canonical_id uuid,
    json_schema jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
```

**Key Features:**
- Both `org_id` AND `project_id` (schemas can be org-level or project-level)
- Versioning system (`version`, `supersedes_id`, `canonical_id`)
- Raw `json_schema` JSONB (JSON Schema standard)
- Simple structure: one table stores everything

### relationship_type_schemas
Similar structure with `multiplicity` field added.

## Refactored Schema (New Design)

### object_type_schemas
```sql
CREATE TABLE kb.object_type_schemas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type_name TEXT NOT NULL,
    display_name TEXT NOT NULL,
    description TEXT NULL,
    properties JSONB NOT NULL DEFAULT '[]'::jsonb,
    organization_id UUID NULL REFERENCES kb.orgs(id) ON DELETE CASCADE,
    source TEXT NOT NULL DEFAULT 'user',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**Key Features:**
- Only `organization_id` (schemas are org-level only)
- No versioning system (single version per org)
- `properties` JSONB (custom format, not JSON Schema)
- Separate `display_name` and `description` fields
- `source` field (user vs system schemas)

### project_object_type_registry
```sql
CREATE TABLE kb.project_object_type_registry (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES kb.projects(id) ON DELETE CASCADE,
    type_name TEXT NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**Key Features:**
- Project-level **enablement** (not project-level schemas)
- Projects "enable" org-level schemas rather than having their own schemas
- Simpler model: org defines types, projects enable/disable them

### relationship_type_schemas
```sql
CREATE TABLE kb.relationship_type_schemas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type_name TEXT NOT NULL,
    display_name TEXT NOT NULL,
    description TEXT NULL,
    from_object_types TEXT[] NOT NULL DEFAULT '{}',
    to_object_types TEXT[] NOT NULL DEFAULT '{}',
    properties JSONB NOT NULL DEFAULT '[]'::jsonb,
    organization_id UUID NULL REFERENCES kb.orgs(id) ON DELETE CASCADE,
    source TEXT NOT NULL DEFAULT 'user',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

## Comparison

| Feature | Production (Old) | Refactored (New) |
|---------|-----------------|------------------|
| **Scope** | Org OR Project level | Org-level only |
| **Versioning** | Full version history | Single version |
| **Schema Format** | JSON Schema standard | Custom properties format |
| **Project Schemas** | Project can define its own | Project enables org schemas |
| **Multiplicity** | Stored in schema | Stored in schema |
| **Superseding** | Tracks schema evolution | No versioning |
| **Registry Pattern** | Single table | Two-table pattern (schema + registry) |

## Code That Depends on Old Schema

### SchemaRegistryService
**File**: `apps/server/src/modules/graph/schema-registry.service.ts`

```typescript
async getObjectValidator(projectId: string | null, type: string): Promise<ValidateFunction | undefined> {
    const key = this.cacheKey(projectId, type);
    const hit = this.objectCache.get(key);
    if (hit) return hit.validator;
    const row = await this.db.query<{ id: string; canonical_id: string; version: number; json_schema: any; project_id: string | null; type: string }>(
        `SELECT id, canonical_id, version, json_schema, project_id, type FROM (
         SELECT DISTINCT ON (canonical_id) *
         FROM kb.object_type_schemas
         WHERE project_id IS NOT DISTINCT FROM $1 AND type = $2  ← FAILS: column project_id doesn't exist
         ORDER BY canonical_id, version DESC
       ) h
       WHERE h.supersedes_id IS NULL
       LIMIT 1`, [projectId, type]
    );
    // ...
}
```

**Problems:**
1. Queries for `project_id` column (doesn't exist in new schema)
2. Queries for `canonical_id`, `version`, `supersedes_id` (don't exist)
3. Expects `json_schema` JSONB (new schema has `properties` in different format)
4. Uses `type` column (new schema uses `type_name`)

### Similar issues in:
- `getRelationshipValidator()` method
- `getRelationshipMultiplicity()` method
- Any code that creates/updates schemas

## Options

### Option 1: Revert to Production Schema ⚠️ SAFE BUT DISCARDS WORK
**Effort**: Low (1-2 hours)  
**Risk**: Low

**Steps:**
1. Copy production schema structure to new migration
2. Add `org_id` and `project_id` columns to type tables
3. Remove `organization_id`, `display_name`, `description`, `source` columns
4. Change `properties` back to `json_schema`
5. Add `version`, `supersedes_id`, `canonical_id` columns
6. Drop `project_object_type_registry` table (not needed in old design)
7. Keep SchemaRegistryService code as-is

**Pros:**
- Code works immediately
- Tests should pass
- Minimal risk

**Cons:**
- Loses new design improvements (if any)
- May reintroduce old problems (if that's why refactor happened)
- Need to understand why refactor was done

### Option 2: Update SchemaRegistryService for New Schema ⚙️ MEDIUM EFFORT
**Effort**: Medium (4-8 hours)  
**Risk**: Medium

**Steps:**
1. Update SchemaRegistryService queries:
   - Use `organization_id` instead of `org_id`
   - Query `project_object_type_registry` for project enablement
   - Remove versioning logic (supersedes, canonical_id)
   - Convert `properties` format to JSON Schema for validation
2. Update schema creation code (TypeRegistryService?)
3. Update all tests that create schemas
4. Verify GraphService validation still works

**Pros:**
- Keeps new design
- May be simpler long-term (no versioning complexity)
- Clearer org/project separation

**Cons:**
- More code changes required
- Need to convert property format
- May reveal more incompatibilities
- Tests might need rewriting

### Option 3: Complete Schema Migration 🚀 COMPREHENSIVE BUT SLOW
**Effort**: High (2-3 days)  
**Risk**: High

**Steps:**
1. Analyze all differences between schemas
2. Create migration plan for each table
3. Update all service code
4. Update all tests
5. Create data migration scripts (if needed)
6. Verify entire system works

**Pros:**
- Thorough solution
- No technical debt
- Modern design

**Cons:**
- Very time-consuming
- High risk of breaking things
- May discover more issues
- Unclear if new design is better

## Recommendation

**Start with Option 1 (Revert to Production Schema)** because:

1. **Fast fix**: Get tests passing quickly
2. **Low risk**: Known working design
3. **Buy time**: Can investigate refactor purpose later
4. **Verifiable**: Production proves it works

**Before reverting, investigate:**
- Why was refactor done? (check git history)
- Was there a problem with old design?
- Is new design documented anywhere?
- Are there other schema changes that depend on new design?

**Investigation Commands:**
```bash
# Find when object_type_schemas was changed
cd /Users/mcj/code/spec-server-2
git log --all --full-history -- "**/migrations/*object_type_schemas*"

# Search for documentation about refactor
grep -r "object_type_schemas\|type system refactor\|schema redesign" docs/

# Check if TypeRegistryService exists and how it works
find . -name "*type-registry*" -o -name "*type_registry*"
```

## Test Error Example

```
stderr | tests/e2e/graph.traversal-advanced.e2e.spec.ts > Graph Advanced Traversal (E2E) - Phase 3 > 3a: Phased Traversal > two-phase traversal: dependencies then implementations

[ERROR] Unhandled non-HTTP exception: error: column "project_id" does not exist
    at /Users/mcj/code/spec-server-2/node_modules/pg/lib/client.js:545:17
    at DatabaseService.query (/Users/mcj/code/spec-server-2/apps/server/src/common/database/database.service.ts:166:24)
    at SchemaRegistryService.getObjectValidator (/Users/mcj/code/spec-server-2/apps/server/src/modules/graph/schema-registry.service.ts:38:21)
```

## Next Steps

1. **Investigate** why refactor was done (git history, docs)
2. **Decide** which option to pursue
3. **If Option 1**: Create migration to revert schema changes
4. **If Option 2**: Update SchemaRegistryService queries and logic
5. **Test** that graph operations work
6. **Re-run** E2E tests to verify fix

## Related Files

- `apps/server/migrations/0001_init.sql` - Refactored schema
- `apps/server/migrations/_old/0001_complete_schema.sql` - Production schema
- `apps/server/src/modules/graph/schema-registry.service.ts` - Breaks with new schema
- `apps/server/src/modules/type-registry/type-registry.service.ts` - May handle schema creation
- Tests: `tests/e2e/graph.*.e2e.spec.ts` - 22+ failures from this issue
