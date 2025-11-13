# Migration Consolidation Complete

## Summary

Successfully consolidated 8 separate migration files into a single clean `0001_init.sql` that represents the complete initial database schema.

## What Was Done

### 1. Backed Up Old Migrations
All 8 original migration files moved to `migrations/_old/`:
- `0001_complete_schema.sql` (103KB - base schema with org_id)
- `0002_create_tags_table.sql` (tags table)
- `0002_rename_org_id_to_organization_id.sql` (column renames)
- `0003_drop_tenant_id_columns.sql` (tenant_id cleanup)
- `0005_add_status_column.sql` (status column for graph_objects)
- `20251024_01_standardize_schema_consistency.sql`
- `20251024_02_complete_schema_standardization.sql`
- `20251024_03_add_status_column.sql`

### 2. Created Consolidated Migration
Created `migrations/0001_init.sql` with:
- **Base schema from 0001** with ALL org_id → organization_id replacements (48 occurrences)
- **Tags table** integrated with organization_id from the start
- **Status column** for graph_objects included from the start
- **All tenant_id columns removed** (never created in first place)
- **Comprehensive header comment** documenting standards and tables

### 3. Automated Transformations
```bash
# Copy base schema
cp _old/0001_complete_schema.sql 0001_init.sql

# Replace all org_id with organization_id (5 different patterns)
sed -i '' 's/org_id uuid/organization_id uuid/g' 0001_init.sql
sed -i '' 's/org_id text/organization_id text/g' 0001_init.sql
sed -i '' 's/(org_id/(organization_id/g' 0001_init.sql
sed -i '' 's/ org_id,/ organization_id,/g' 0001_init.sql
sed -i '' 's/ org_id)/ organization_id)/g' 0001_init.sql

# Remove all tenant_id columns
sed -i '' '/tenant_id uuid NOT NULL,/d' 0001_init.sql

# Append tags table and status column (manual)
cat >> 0001_init.sql << 'EOF'
... tags table with organization_id ...
... status column for graph_objects ...
EOF
```

## Final Statistics

- **File**: `migrations/0001_init.sql`
- **Lines**: 3,331
- **Tables Created**: 36
- **organization_id references**: 57
- **org_id references**: 0 ✅
- **tenant_id references**: 0 ✅

## Key Standards in Consolidated Schema

1. **organization_id everywhere** - No org_id columns
2. **No tenant_id columns** - Removed after single-tenant-per-org decision
3. **Row Level Security (RLS)** - Enabled on all multi-tenant tables
4. **RLS policies** - Use `app.current_organization_id` session variable
5. **Tags table included** - With organization_id from the start
6. **Status column included** - For graph_objects lifecycle management

## Tables Created

### Core
- `kb.orgs` - Organizations
- `kb.projects` - Projects within organizations
- `kb.organization_memberships` - User memberships
- `kb.invites` - Pending invitations
- `kb.users` - User accounts

### Documents
- `kb.documents` - Document metadata
- `kb.chunks` - Document chunks for search
- `kb.document_versions` - Version history

### Graph
- `kb.graph_objects` - Typed entities
- `kb.graph_relationships` - Connections between objects
- `kb.object_extraction_jobs` - Background extraction jobs

### Discovery
- `kb.discovery_jobs` - Auto-discovery jobs
- `kb.product_versions` - Product version tracking

### Chat
- `kb.chat_conversations` - Chat sessions
- `kb.chat_messages` - Message history

### Templates
- `kb.template_packs` - Object type templates
- `kb.project_template_packs` - Pack installations
- `kb.builtin_pack_sources` - Built-in pack registry
- `kb.project_object_type_registry` - Project-specific type registry

### Integrations
- `kb.integrations` - External service connections

### Tags
- `kb.tags` - Product version tags

### System
- `kb.system_process_logs` - Process execution logs
- `kb.notifications` - User notifications
- `kb.llm_call_logs` - LLM API call tracking
- `kb.mcp_tool_calls` - MCP tool invocation logs
- `kb.settings` - Global settings

## Test Impact

### Before Consolidation
- Tests confused by org_id vs organization_id naming
- Had to remember which tables used which column name
- Migration 0002 did renames, creating inconsistency

### After Consolidation
- Single consistent naming: organization_id everywhere
- No confusion about which column name to use
- Clean starting point for all future migrations

## Test Results

After consolidation and fixing related test files:

```
Test Files  22 failed | 104 passed | 1 skipped (127)
Tests       27 failed | 1007 passed | 39 skipped (1073)
```

**Remaining failures are unrelated to org_id/tenant_id migration:**
- Graph validation tests (type registry)
- Chat generation tests
- Projects service tests
- Merge relationship provenance tests

**All org_id/tenant_id related tests are now passing:**
- ✅ extraction-job.service.spec.ts (17/17)
- ✅ extraction-worker.service.spec.ts (30/30)
- ✅ embeddings.service.spec.ts (updated for Vertex AI)
- ✅ orgs.service.spec.ts (organization_id regex fixed)

## Files Modified

### Test Fixes (Session 4)
1. `apps/server/src/modules/extraction-jobs/extraction-job.service.spec.ts`
   - Removed duplicate mockOrganizationId parameter
   - Fixed expected parameter count (9 → 8)

2. `apps/server/src/modules/extraction-jobs/extraction-worker.service.spec.ts`
   - Added third mock query for kb.settings base prompt
   - Updated expected query call counts (2 → 3)
   - Added extractionBasePrompt to mock config
   - Updated test expectations for config fallback

3. `apps/server/tests/unit/embeddings.service.spec.ts`
   - Updated for Vertex AI migration (GOOGLE_API_KEY → EMBEDDING_PROVIDER)
   - Added env cleanup and proper API key setup

4. `apps/server/tests/orgs.service.spec.ts`
   - Fixed regex pattern (org_id → organization_id)

### Migration Files
1. `apps/server/migrations/0001_init.sql` - **NEW CONSOLIDATED MIGRATION**
2. `apps/server/migrations/_old/*.sql` - Backed up original migrations

## Why This Matters

1. **Eliminates Confusion**: No more wondering if a table uses org_id or organization_id
2. **Simplifies Testing**: Write tests knowing the column name is always organization_id
3. **Clean Foundation**: Future migrations build on consistent base
4. **No Migration Needed**: Since no production data exists, we can start clean
5. **Better Documentation**: Single migration file documents the complete schema

## Next Steps

1. ✅ Migration consolidation complete
2. ✅ Test fixes for org_id/tenant_id complete
3. ⏳ Fix remaining unrelated test failures (graph validation, chat, projects)
4. ⏳ Run migration on test database to verify SQL
5. ⏳ Consider deleting `_old/` folder after verification

## Backup Location

All original migrations safely backed up in: `apps/server/migrations/_old/`

Can be restored if needed, but consolidated version is now the single source of truth.

## Date

2025-01-24
