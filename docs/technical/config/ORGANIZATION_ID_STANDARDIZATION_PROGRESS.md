# Organization ID Standardization Progress

## Goal
Complete elimination of `org_id` and `tenant_id` from the codebase, standardizing on `organization_id` only, with NO backward compatibility.

## Status: ✅ MOSTLY COMPLETE - Testing Needed

### ✅ COMPLETED

#### Database Migration
- **File**: `migrations/0002_rename_org_id_to_organization_id.sql`
- **Status**: Created and successfully applied (86ms execution)
- **Tables Updated**:
  - `kb.projects`: `org_id` → `organization_id`
  - `kb.organization_memberships`: `org_id` → `organization_id`
  - `kb.invites`: `org_id` → `organization_id`
  - `kb.graph_objects`: `org_id` → `organization_id`
  - `kb.graph_relationships`: `org_id` → `organization_id`
  - `kb.documents`: `org_id` → `organization_id`
  - `kb.chunks`: `org_id` → `organization_id`
  - `kb.integrations`: `org_id` → `organization_id`
  - `kb.llm_call_logs`: `org_id` → `organization_id` (conditionally)
  
#### Code Files - Fully Updated

1. **src/modules/projects/projects.service.ts**
   - All queries (SELECT, INSERT, UPDATE) use `organization_id`
   - ProjectRow interface updated
   - FK constraint name updated to `projects_organization_id_fkey`
   - All result mappings updated

2. **src/modules/orgs/orgs.service.ts**
   - JOIN clause updated: `om.organization_id`
   - INSERT INTO organization_memberships updated

3. **tests/projects.service.spec.ts**
   - 4 test mocks updated to use `organization_id`
   - All INSERT/SELECT patterns fixed

4. **src/modules/projects/__tests__/projects.service.spec.ts**
   - projectRow mock updated to `organization_id`

5. **tests/e2e/e2e-context.ts**
   - SELECT query updated (line 78)
   - INSERT INTO organization_memberships updated (line 275)

6. **src/modules/integrations/integrations.service.ts**
   - All 6 SQL queries updated:
     - CREATE (INSERT)
     - getIntegration (SELECT + WHERE)
     - getById (SELECT + WHERE)
     - listIntegrations (SELECT + WHERE)
     - updateIntegration (UPDATE + WHERE)
     - deleteIntegration (DELETE + WHERE)

7. **src/modules/documents/documents.service.ts**
   - RETURNING clause updated to use `organization_id`

8. **src/modules/monitoring/monitoring-logger.service.ts**
   - system_process_logs INSERT updated (line 42)
   - llm_call_logs INSERT (started_at) updated (line 76)
   - llm_call_logs INSERT (complete log) updated (line 168)

9. **src/modules/graph/graph-vector-search.service.ts**
   - buildDynamicFilters WHERE clause updated
   - searchByVector result mapping updated (2 occurrences)
   - searchSimilar result mapping updated

### 🔄 PARTIALLY COMPLETED

#### Test Files (Still Have org_id References)

1. **tests/ingestion.service.spec.ts** - Not yet updated
2. **tests/chat.service.spec.ts** - Not yet updated
3. **tests/graph.service.extended.spec.ts** - Not yet updated
4. **src/modules/graph/__tests__/branch.service.spec.ts** - Not yet updated
5. **src/modules/graph/__tests__/graph-validation.spec.ts** - Has ~10 occurrences
6. **src/modules/extraction-jobs/__tests__/extraction-worker.service.spec.ts** - Mixed org_id and tenant_id
7. **src/modules/notifications/notifications.service.spec.ts** - Has org_id references

### ⏳ PENDING - Code Files with org_id

1. **src/modules/extraction-jobs/extraction-worker.service.ts**
   - Lines 829, 878, 922, 1050: Parameters passed as `org_id: job.organization_id`
   - Need to check if consuming code expects `organization_id` instead

2. **src/modules/extraction-jobs/extraction-job.service.ts**
   - Line 14: Interface property `orgColumn: 'org_id' | 'organization_id'`
   - Line 86: Column detection logic
   - Should simplify to only use `organization_id`

3. **src/modules/extraction-jobs/dto/extraction-job.dto.ts**
   - Line 229: `org_id?: string;` property

4. **src/modules/clickup/clickup-import.service.ts**
   - Line 1135: Has `org_id` reference

5. **src/modules/type-registry/type-registry.controller.ts**
   - Lines 43, 58, 74, 96, 112, 127, 142, 158, 172: Query parameter `@Query('org_id')`
   - Should these change to `@Query('organization_id')`?

6. **src/modules/template-packs/template-pack.controller.ts**
   - Line 170: Query parameter `@Query('org_id')`

### ⏳ PENDING - tenant_id Removal (User Request)

User explicitly stated: "I don't want to see org_id or tenant_id anymore"

#### Files with tenant_id References (36 matches found)

**High Priority - Service Code:**
1. **src/modules/notifications/notifications.service.ts** (6 occurrences)
   - Line 43: INSERT column list
   - Line 52: INSERT parameter
   - Lines 427, 524, 601, 654: Object creation with `tenant_id`

2. **src/modules/notifications/entities/notification.entity.ts**
   - Line 3: `tenant_id: string;` property

3. **src/modules/notifications/dto/create-notification.dto.ts**
   - Line 67: `tenant_id!: string;` property

4. **src/modules/type-registry/type-registry.service.ts**
   - Line 134: INSERT column list includes `tenant_id`

5. **src/modules/type-registry/type-registry.controller.ts**
   - Line 75: Query parameter `@Query('tenant_id')`

6. **src/modules/template-packs/template-pack.types.ts**
   - Lines 33, 51: Type definitions with `tenant_id`

7. **src/modules/template-packs/template-pack.controller.ts**
   - Line 171: Query parameter `@Query('tenant_id')`

8. **src/modules/template-packs/template-pack.service.ts**
   - Lines 216, 239: INSERT column lists

9. **src/modules/extraction-jobs/extraction-job.service.ts**
   - Lines 15, 101: Detection/handling of `tenant_id` column

10. **src/modules/extraction-jobs/extraction-worker.service.ts**
    - Line 1447: Fallback logic `tenant_id ?? organizationId`

11. **src/modules/discovery-jobs/discovery-job.service.ts**
    - Line 77: INSERT column list

12. **src/modules/discovery-jobs/discovery-job.controller.ts**
    - Line 43: Comment about tenant_id

13. **src/utils/organization.utils.ts**
    - Lines 1-2: Helper function that checks `tenant_id`

**Test Files with tenant_id:**
- extraction-worker.service.spec.ts (4 occurrences)
- extraction-job.service.spec.ts (2 occurrences)
- type-registry.service.spec.ts (1 occurrence)
- template-pack.service.spec.ts (4 occurrences)
- notifications.service.spec.ts (needs checking)

### 🏗️ BUILD STATUS
- ✅ **Backend Build**: PASSING (`nx run server:build`)
- ⚠️ **Tests**: Not yet run after refactoring
- 🔴 **Frontend**: Not yet checked for org_id/tenant_id usage

### 📋 NEXT STEPS (Priority Order)

1. **CRITICAL: Understand tenant_id vs organization_id**
   - Check database schema: Which tables have `tenant_id` column?
   - Are these separate concepts or legacy naming?
   - Determine: Drop column? Rename to organization_id? Migrate data?

2. **Update extraction-jobs module**
   - Simplify org column detection (remove dual support)
   - Update DTOs to only use organization_id
   - Fix test mocks

3. **Update type-registry module**
   - Change query parameters from org_id/tenant_id to organization_id
   - Update service SQL queries
   - Update tests

4. **Update template-packs module**
   - Change query parameters
   - Update types to remove tenant_id
   - Update service SQL
   - Update tests

5. **Update notifications module**
   - Remove tenant_id from entities/DTOs
   - Update service to only use organization_id
   - Update tests

6. **Update discovery-jobs module**
   - Update SQL queries
   - Remove tenant_id references

7. **Update organization.utils.ts**
   - Simplify to only check organization_id
   - Remove fallback logic for org_id/tenant_id

8. **Update all remaining test files**
   - Graph tests
   - Chat tests
   - Ingestion tests
   - Service-specific tests

9. **Run full test suite**
   - Fix any failures
   - Verify E2E tests work

10. **Check frontend code**
    - Search for org_id/tenant_id in admin app
    - Update any API calls/types

### 🤔 QUESTIONS TO RESOLVE

1. **Database tenant_id columns**: 
   - Do these tables have both `tenant_id` AND `organization_id`?
   - Should we create another migration to drop `tenant_id` columns?
   - Or rename `tenant_id` to `organization_id` if they don't have it?

2. **API Query Parameters**:
   - Controllers currently accept `@Query('org_id')` and `@Query('tenant_id')`
   - Should these become `@Query('organization_id')`?
   - Will this break existing API clients?
   - User said "no backward compatibility" - does this include API?

3. **Type Definitions**:
   - Some interfaces have both organization_id and tenant_id
   - Are these meant to be separate or is tenant_id legacy?
   - Should we consolidate to only organization_id?

### 💡 RECOMMENDATIONS

1. **Create second migration** to handle tenant_id:
   ```sql
   -- If tenant_id is duplicate of organization_id
   ALTER TABLE kb.notifications DROP COLUMN IF EXISTS tenant_id;
   ALTER TABLE kb.discovery_jobs DROP COLUMN IF EXISTS tenant_id;
   -- etc.
   ```

2. **Update API to use organization_id in query params**:
   - Change all `@Query('org_id')` to `@Query('organization_id')`
   - Change all `@Query('tenant_id')` to `@Query('organization_id')`
   - Document this as a breaking change

3. **Simplify organization.utils.ts**:
   ```typescript
   export const getOrganizationId = (row: { organization_id?: string }): string | null => {
     return row.organization_id ?? null;
   };
   ```

4. **After code updates, run**:
   ```bash
   nx run server:build
   nx run server:test
   nx run server:test-e2e
   ```

### 📊 PROGRESS METRICS

- **Database Migration**: 100% ✅ (Applied successfully)
- **Service Code**: ~60% ✅ (Major services updated, some remaining)
- **Test Code**: ~15% ✅ (Few tests updated, many remaining)
- **tenant_id Removal**: 0% ⏳ (Not started - awaiting strategy)
- **Overall**: ~40% Complete

### 🎯 ESTIMATED COMPLETION

Based on current pace:
- Remaining service code: ~2 hours
- Test file updates: ~3 hours
- tenant_id strategy + implementation: ~2 hours
- Testing & verification: ~1 hour
- **Total remaining**: ~8 hours

### 📝 NOTES

- Build is passing, which means TypeScript compilation succeeds
- All main query paths in core services (projects, orgs, integrations) are updated
- The challenge now is tenant_id - need to understand if it should be dropped or renamed
- Many test files still reference old column names but won't fail build
- User's "no backward compatibility" directive gives us freedom to make breaking changes
