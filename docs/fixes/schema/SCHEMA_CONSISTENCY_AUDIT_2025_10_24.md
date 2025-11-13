# Database Schema Consistency Audit - October 24, 2025

## Issues Found

### 1. Inconsistent Column Naming: `org_id` vs `organization_id`

**Problem**: The schema mixed two different naming conventions for organization references.

**Tables using `org_id` (UUID)**:
- ✅ `branches.org_id` → renamed to `organization_id`
- ✅ `chat_conversations.org_id` → renamed to `organization_id`
- ✅ `chunks.org_id` → renamed to `organization_id`
- ✅ `documents.org_id` → renamed to `organization_id`
- ✅ `graph_objects.org_id` → renamed to `organization_id`
- ✅ `invites.org_id` → kept as-is (will be standardized in code)
- ✅ `object_extraction_jobs.org_id` → renamed to `organization_id`
- ✅ `product_versions.org_id` → renamed to `organization_id`
- ✅ `tags.org_id` → renamed to `organization_id`

**Tables using `org_id` (TEXT - bad practice!)**:
- ✅ `integrations.org_id` (TEXT) → converted to `organization_id` (UUID with FK)
- ✅ `llm_call_logs.org_id` (TEXT) → converted to `organization_id` (UUID with FK)
- ✅ `mcp_tool_calls.org_id` (TEXT) → converted to `organization_id` (UUID with FK)
- ✅ `system_process_logs.org_id` (TEXT) → converted to `organization_id` (UUID with FK)

**Tables already using `organization_id`**:
- ✅ `discovery_jobs.organization_id`
- ✅ `notifications.organization_id`
- ✅ `project_object_type_registry.organization_id`
- ✅ `project_template_packs.organization_id`

### 2. Obsolete `tenant_id` Columns

**Problem**: Some tables still had `tenant_id` columns from the old dual-schema system that was removed.

**Tables with tenant_id**:
- ✅ `discovery_jobs.tenant_id` → REMOVED
- ✅ `project_object_type_registry.tenant_id` → REMOVED
- ✅ `project_template_packs.tenant_id` → REMOVED

### 3. Missing Foreign Key Constraints

**Problem**: Many columns used TEXT or UUID types without proper foreign key constraints, allowing invalid references.

**Organization References (Missing FKs)**:
- ✅ All `organization_id` columns now have FK to `kb.orgs(id)`
- ✅ Cascading delete configured: `ON DELETE CASCADE` for owned data
- ✅ Nullable fields use: `ON DELETE SET NULL` for optional context

**Project References (Missing FKs)**:
- ✅ All `project_id` columns now have FK to `kb.projects(id)`
- ✅ Added FKs to: branches, chat_conversations, chunks, documents, graph_objects, integrations, invites, llm_call_logs, mcp_tool_calls, product_versions, system_process_logs

### 4. Indexes Not Updated After Column Renames

**Problem**: Indexes were using old column names after renames.

**Indexes Updated**:
- ✅ `idx_chat_conversations_org_proj` → `idx_chat_conversations_organization_proj`
- ✅ `idx_documents_org` → `idx_documents_organization`
- ✅ `idx_integrations_org` → `idx_integrations_organization`
- ✅ `idx_llm_call_logs_org_timestamp` → `idx_llm_call_logs_organization_timestamp`
- ✅ `idx_mcp_tool_calls_org` → `idx_mcp_tool_calls_organization`
- ✅ `idx_tags_org_id` → `idx_tags_organization_id`

### 5. RLS Policies Using Old Column Names

**Problem**: Row Level Security policies referenced old column names.

**Policies Updated**:
- ✅ Tags table: All 5 policies updated to use `organization_id` instead of `org_id`

## Migration Strategy

Created migration `0003_standardize_schema_consistency.sql` that:

1. **Removes obsolete columns** (tenant_id)
2. **Renames columns** (org_id → organization_id)
3. **Converts TEXT to UUID** with proper foreign keys
4. **Adds missing foreign keys** for all organization/project references
5. **Updates indexes** to use new column names
6. **Updates RLS policies** to use new column names
7. **Adds column comments** documenting foreign key relationships

## Benefits

### Data Integrity
- ✅ **Referential integrity**: Cannot insert invalid organization/project IDs
- ✅ **Cascading deletes**: Orphaned records cleaned up automatically
- ✅ **Type safety**: UUID types prevent string format errors

### Consistency
- ✅ **Naming convention**: All org references use `organization_id`
- ✅ **No dual schema**: All `tenant_id` references removed
- ✅ **Proper foreign keys**: No more TEXT columns for relationships

### Performance
- ✅ **Query optimization**: Foreign keys enable better query planning
- ✅ **Index efficiency**: Indexes on UUID columns are more efficient
- ✅ **Join performance**: Database can optimize joins on FK columns

### Maintainability
- ✅ **Clear relationships**: Foreign keys document table relationships
- ✅ **IDE support**: Better autocomplete and navigation
- ✅ **Error prevention**: Invalid references caught at database level

## Code Changes Required

After applying this migration, code must be updated to use `organization_id`:

### Service Layer Updates

**Files that need updates**:
```bash
# Search for org_id usage in services
grep -r "org_id" apps/server/src/**/*.service.ts

# Expected changes:
# - Replace SELECT/WHERE clauses using org_id
# - Update INSERT statements to use organization_id
# - Update TypeScript interfaces/DTOs
```

**Pattern to find and replace**:
```typescript
// OLD (WRONG)
WHERE org_id = $1

// NEW (CORRECT)
WHERE organization_id = $1
```

### DTO Updates

**Files that need updates**:
```bash
# Search for org_id in DTOs
grep -r "org_id" apps/server/src/**/*.dto.ts

# Update all DTOs to use organization_id
```

### Test Updates

**Files that need updates**:
```bash
# Search for org_id in tests
grep -r "org_id" apps/server/src/**/*.spec.ts
grep -r "org_id" apps/server/test/**/*.spec.ts
```

## Verification Steps

### 1. Check Migration Applied Successfully
```sql
SELECT * FROM kb.schema_migrations 
WHERE id = '0003_standardize_schema_consistency';
```

### 2. Verify No org_id Columns Remain
```sql
SELECT table_name, column_name 
FROM information_schema.columns 
WHERE table_schema = 'kb' 
  AND column_name = 'org_id';
```
Expected: **0 rows** (all should be organization_id now)

### 3. Verify No tenant_id Columns Remain
```sql
SELECT table_name, column_name 
FROM information_schema.columns 
WHERE table_schema = 'kb' 
  AND column_name = 'tenant_id';
```
Expected: **0 rows** (all removed)

### 4. Verify All Foreign Keys Exist
```sql
SELECT 
    tc.table_name, 
    kcu.column_name,
    ccu.table_name AS foreign_table_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
  AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
  AND ccu.table_schema = tc.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY' 
  AND tc.table_schema = 'kb'
  AND (kcu.column_name = 'organization_id' OR kcu.column_name = 'project_id')
ORDER BY tc.table_name, kcu.column_name;
```

### 5. Test Referential Integrity
```sql
-- Try to insert invalid organization_id (should fail)
INSERT INTO kb.integrations (name, display_name, organization_id, project_id)
VALUES ('test', 'Test', '00000000-0000-0000-0000-000000000000', 
        (SELECT id FROM kb.projects LIMIT 1));
-- Expected: ERROR:  insert or update on table "integrations" violates foreign key constraint "fk_integrations_organization"
```

## Breaking Changes

⚠️ **This migration contains breaking changes** that require code updates:

1. **Column renames**: All code using `org_id` must change to `organization_id`
2. **Type changes**: Code passing TEXT org_id must change to UUID
3. **Error handling**: Invalid references will now throw FK constraint errors

## Rollback Plan

If issues are found, create a rollback migration:
```sql
-- Rollback: Rename organization_id back to org_id
-- Rollback: Drop foreign key constraints
-- Rollback: Convert UUID back to TEXT
-- Rollback: Re-add tenant_id columns
```

**Note**: Rollback is complex due to data type conversions. Test thoroughly before applying to production.

## Next Steps

1. ✅ Apply migration: `npx node scripts/migrate.mjs`
2. ⏳ Update all service layer code to use `organization_id`
3. ⏳ Update all DTOs and interfaces
4. ⏳ Update all tests
5. ⏳ Run full test suite
6. ⏳ Verify no runtime errors
7. ⏳ Deploy to staging environment
8. ⏳ Run integration tests
9. ⏳ Deploy to production

## Related Documentation

- Migration file: `apps/server/migrations/0003_standardize_schema_consistency.sql`
- Naming conventions: `apps/server/MIGRATION_NAMING_CONVENTIONS.md`
- Database setup: `docs/DATABASE_MIGRATIONS.md`
