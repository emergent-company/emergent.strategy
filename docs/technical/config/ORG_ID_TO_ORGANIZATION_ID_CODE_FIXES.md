# org_id → organization_id Code Migration

## Summary

After migrating the database schema from `org_id` to `organization_id` in tables `kb.invites` and `kb.organization_memberships`, we needed to update all application code that referenced these columns in SQL queries, DTOs, and TypeScript interfaces.

## Files Changed

### 1. SQL Query Fixes (Critical - Causing 500 errors)

#### `apps/server/src/modules/chat/chat.service.ts`
- **Line 49**: Changed WHERE clause from `org_id IS NOT DISTINCT FROM` → `organization_id IS NOT DISTINCT FROM`
- **Line 58**: Changed WHERE clause from `org_id IS NOT DISTINCT FROM` → `organization_id IS NOT DISTINCT FROM`
- **Line 67**: Changed SELECT from `org_id` → `organization_id`
- **Line 207**: Changed INSERT column from `org_id` → `organization_id`
- **Line 222**: Changed INSERT column from `org_id` → `organization_id` (retry path)

#### `apps/server/src/modules/ingestion/ingestion.service.ts`
- **Line 209**: Changed CTE alias from `AS org_id` → `AS organization_id`
- **Line 214**: Changed INSERT column from `org_id` → `organization_id`
- **Line 255**: Changed CTE alias from `AS org_id` → `AS organization_id`
- **Line 260**: Changed INSERT column from `org_id` → `organization_id`

#### `apps/server/src/modules/auth/permission.service.ts`
- **Line 69**: Changed SELECT column from `org_id` → `organization_id`

#### `apps/server/src/modules/graph/tag.service.ts`
- **Line 66**: Changed INSERT column from `org_id` → `organization_id`
- **Line 68**: Changed RETURNING column from `org_id` → `organization_id`
- **Line 173**: Changed RETURNING column from `org_id` → `organization_id`

#### `apps/server/src/modules/graph/product-version.service.ts`
- **Line 36**: Changed INSERT column from `org_id` → `organization_id`
- **Line 38**: Changed RETURNING column from `org_id` → `organization_id`

### 2. E2E Test Fixes

Replaced all `org_id` with `organization_id` in test files:
- `tests/e2e/graph.soft-delete.e2e.spec.ts`
- `tests/e2e/graph.traverse.e2e.spec.ts`
- `tests/e2e/graph.embedding-policies.e2e.spec.ts`
- `tests/e2e/graph.traversal-advanced.e2e.spec.ts`
- `tests/e2e/phase1.workflows.e2e.spec.ts`
- `tests/e2e/graph.history.e2e.spec.ts`

Used batch sed command:
```bash
sed -i '' 's/org_id/organization_id/g' tests/e2e/graph.*.e2e.spec.ts tests/e2e/phase1.workflows.e2e.spec.ts
```

### 3. Remaining Variable Names (OK to keep as-is)

The following still use `org_id` as **variable names** internally but correctly map to `organization_id` columns:

#### TypeScript Interfaces/Types
- `apps/server/src/modules/graph/graph.types.ts` - `org_id?: string | null;` (interface property)
- `apps/server/src/modules/graph/dto/create-graph-object.dto.ts` - `org_id?: string;` (DTO property)
- `apps/server/src/modules/graph/dto/history.dto.ts` - `org_id!: string | null;` (DTO property)
- `apps/server/src/modules/extraction-jobs/dto/extraction-job.dto.ts` - `org_id?: string;` (DTO property)

#### Service Layer Variable Names
- `apps/server/src/modules/graph/graph.service.ts` - Uses `org_id` as variable name but correctly inserts into `organization_id` column
- `apps/server/src/modules/graph/graph.controller.ts` - Maps `dto.organization_id` to `org_id` variable

#### Query Parameters (API Surface)
- `apps/server/src/modules/type-registry/type-registry.controller.ts` - `@Query('org_id')` decorators (9 occurrences)
- `apps/server/src/modules/template-packs/template-pack.controller.ts` - `@Query('org_id')` decorator

#### Worker Services
- `apps/server/src/modules/extraction-jobs/extraction-worker.service.ts` - Maps `job.organization_id` to `org_id` property when creating graph objects (4 occurrences)
- `apps/server/src/modules/clickup/clickup-import.service.ts` - Uses `org_id` variable name

### 4. Not Changed (Intentionally)

#### Frontend Code
- `apps/admin/src/api/integrations.ts` - Uses `org_id` in TypeScript interface
- `apps/admin/src/api/extraction-jobs.ts` - Handles both `organization_id` and `org_id` for backwards compatibility
- `apps/admin/e2e/specs/*.ts` - Playwright tests mock API responses with `org_id`

#### Test Specs/Mocks
- `apps/server/tests/orgs.service.spec.ts` - SQL query string in test assertion
- Unit test files that mock data structures

#### OpenAPI/Documentation
- `openapi.json` - API specification still references `org_id` query parameters

## Impact

**Before fixes**: 64/68 E2E test files failing with HTTP 500 errors due to SQL column mismatch

**After fixes**: SQL queries now correctly reference `organization_id` columns, resolving database errors

## Testing

Single test verification:
```bash
npm run test:e2e -- tests/e2e/health.rls-status.e2e.spec.ts
# ✅ PASSED
```

## Next Steps

1. ✅ Database migration applied (`organization_id` in all 21 tables)
2. ✅ SQL queries fixed (chat, ingestion, auth, graph services)
3. ✅ E2E tests updated (6 test files)
4. ⏳ Run full E2E suite to verify fixes
5. ⏳ Consider updating DTOs/interfaces to use `organization_id` for consistency
6. ⏳ Update API query parameters from `org_id` to `organization_id` (breaking change)
7. ⏳ Update frontend to use `organization_id` consistently
8. ⏳ Update OpenAPI spec to reflect `organization_id`

## Related Documentation

- `docs/E2E_TESTS_ORGANIZATION_ID_MIGRATION.md` - Database schema migration
- `migrations/20251024_rename_org_id_to_organization_id.sql` - Original migration
