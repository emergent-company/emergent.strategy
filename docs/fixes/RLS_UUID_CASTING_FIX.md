# RLS Policy UUID Casting Fix - Migration 0008

**Date**: 2025-10-18  
**Migration**: `0008_fix_rls_uuid_casting.sql`  
**Issue**: RLS policies with UUID casting fail when `current_setting()` returns empty string

## Problem

The original RLS policies in migration `0001_dynamic_type_system_phase1.sql` used this pattern:

```sql
CREATE POLICY example_select_policy ON kb.table_name FOR SELECT USING (
    organization_id = current_setting('app.current_organization_id', true)::uuid
    AND project_id = current_setting('app.current_project_id', true)::uuid
);
```

This fails with error `"invalid input syntax for type uuid: ''"` when:
- System-level operations run without tenant context
- Database service uses empty string `''` for missing context
- Background workers (extraction jobs) run with system context

## Solution

Updated all affected RLS policies to this pattern:

```sql
CREATE POLICY example_select_policy ON kb.table_name FOR SELECT USING (
    (COALESCE(current_setting('app.current_organization_id', true),'') = '' 
     AND COALESCE(current_setting('app.current_project_id', true),'') = '')
    OR
    (organization_id::text = current_setting('app.current_organization_id', true) 
     AND project_id::text = current_setting('app.current_project_id', true))
);
```

This allows:
1. **Empty context** (system operations): Both settings are empty strings
2. **Tenant-scoped** (user operations): Settings match the row's org_id and project_id

## Affected Tables

Migration `0008_fix_rls_uuid_casting.sql` fixes these tables:

1. **kb.object_extraction_jobs**
   - Policies: select, insert, update, delete
   - Impact: Background extraction worker can now dequeue and update jobs

2. **kb.project_template_packs**
   - Policies: select, insert, update, delete
   - Impact: System can load extraction prompts without user context

3. **kb.project_object_type_registry**
   - Policies: select, insert, update, delete
   - Impact: Type registry endpoint works correctly

4. **kb.object_type_suggestions**
   - Policies: select, insert, update, delete
   - Impact: AI type discovery system can create suggestions

## Testing

Before migration (broken):
```bash
# Type registry endpoint returns 500
curl http://localhost:5175/api/type-registry/projects/342b78f5-2904-4e1a-ae41-9c2d481a3a46
# Error: invalid input syntax for type uuid: ""

# Extraction jobs fail to dequeue
# Error: invalid input syntax for type uuid: ""
```

After migration (working):
```bash
# Type registry endpoint returns data
curl http://localhost:5175/api/type-registry/projects/342b78f5-2904-4e1a-ae41-9c2d481a3a46
# Returns: { types: [...] }

# Extraction jobs process successfully
# Worker dequeues jobs and processes documents
```

## Fresh Database Installation

**YES, migration is required for fresh databases!**

The original migration `0001_dynamic_type_system_phase1.sql` creates the broken policies. Without migration `0008`, fresh databases will have the same UUID casting issues.

## Migration Order

1. `0001_dynamic_type_system_phase1.sql` - Creates tables with broken RLS policies
2. `0002_extraction_jobs.sql` - Adds extraction job fields
3. `0003_integrations_system.sql` - Adds integrations
4. `0004_integration_source_tracking.sql` - Adds source tracking
5. `0005_auto_extraction_and_notifications.sql` - Adds auto extraction
6. `0006_extraction_status_constraint.sql` - Fixes status enum
7. `0007_object_extraction_job_debug.sql` - Adds debug fields
8. **`0008_fix_rls_uuid_casting.sql`** - **Fixes RLS policies** ← NEW

## Related Code

- **Database Service**: `apps/server/src/common/database/database.service.ts`
  - Sets tenant context to empty strings for system operations
  - Method: `runWithTenantContext(orgId, projectId, callback)`

- **Extraction Worker**: `apps/server/src/modules/extraction-jobs/extraction-worker.service.ts`
  - Runs background jobs without user context
  - Uses `SYSTEM_USER_ID` constant for system operations

- **Type Registry**: `apps/server/src/modules/type-registry/type-registry.service.ts`
  - Queries type registry with tenant context
  - Method: `getProjectTypes(projectId)`

## Security Notes

The new pattern maintains security:
- **Empty context**: Only allowed when BOTH org and project are empty (system mode)
- **Tenant context**: Row must match BOTH org_id AND project_id
- **No cross-tenant access**: User can't see other tenant's data by setting only one context

## Discovery Timeline

1. **Phase 1**: Discovered issue in `object_extraction_jobs` - extraction worker failing
2. **Phase 2**: Fixed extraction jobs, discovered same issue in `project_template_packs`
3. **Phase 3**: Fixed template packs, discovered same issue in `project_object_type_registry`
4. **Phase 4**: Audited all RLS policies, found `object_type_suggestions` also affected
5. **Phase 5**: Created comprehensive migration fixing all four tables

## Rollback

If needed, restore original policies:

```sql
-- Restore UUID casting pattern (NOT RECOMMENDED)
CREATE POLICY example_select_policy ON kb.table_name FOR SELECT USING (
    organization_id = current_setting('app.current_organization_id', true)::uuid
    AND project_id = current_setting('app.current_project_id', true)::uuid
);
```

But this will break:
- Extraction worker background jobs
- Type registry queries
- Any system-level operations

## Future Considerations

1. **Pattern for new tables**: Use the fixed pattern for all new RLS policies
2. **Audit remaining tables**: Check if other tables have the same issue
3. **Documentation**: Update RLS policy creation guidelines
4. **Code review**: Flag UUID casting in RLS policies during review
