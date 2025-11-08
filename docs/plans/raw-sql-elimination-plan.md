# Raw SQL Elimination Plan - Complete TypeORM Migration

**Date**: November 8, 2025  
**Purpose**: Eliminate all raw SQL queries and complete TypeORM migration for type safety

---

## Current State

**Raw SQL Usage**:
- **522 raw SQL queries** across the codebase
- **56 files** contain `pool.query()`, `db.query()`, or `client.query()`
- **0% type safety** on these queries
- **Runtime errors** when tables/columns don't exist

**TypeORM Progress**:
- ✅ 25 entities created
- ✅ 5 migrations applied
- ✅ 1 service fully migrated (UserProfileService)
- ⏳ 55 services still using raw SQL

---

## Files with Raw SQL (Prioritized by Impact)

### Critical (Blocking Users) - Priority 1

1. **permission.service.ts** (6 queries)
   - Used on EVERY authenticated request
   - Queries: organization_memberships, project_memberships
   - Impact: 500 errors on permission checks

2. **notifications.service.ts** (15+ queries)
   - User notifications and counts
   - Impact: Notification UI fails

3. **orgs.service.ts** (10+ queries)
   - Organization CRUD
   - Impact: Can't create/list orgs

4. **projects.service.ts** (12+ queries)
   - Project CRUD
   - Impact: Can't create/list projects

5. **auth/postgres-cache.service.ts** (3 queries)
   - Token caching
   - Impact: Performance (still works via fallback)

### High Usage - Priority 2

6. **graph.service.ts** (50+ queries)
   - Graph object CRUD
   - Complex queries with CTEs

7. **extraction-job.service.ts** (30+ queries)
   - Job queue management
   - Background workers

8. **documents.service.ts** (15+ queries)
   - Document management
   - Already has TypeORM repos injected

9. **chunks.service.ts** (12+ queries)
   - Chunk management
   - Already has TypeORM repos injected

10. **chat.service.ts** (20+ queries)
    - Chat conversations and messages

### Medium Usage - Priority 3

11. **invites.service.ts** (8 queries)
12. **template-pack.service.ts** (15 queries)
13. **type-registry.service.ts** (10 queries)
14. **search.service.ts** (12 queries)
15. **ingestion.service.ts** (8 queries)
16. **integrations.service.ts** (6 queries)
17. **branch.service.ts** (10 queries)
18. **product-version.service.ts** (12 queries)
19. **tag.service.ts** (8 queries)
20. **embedding-jobs.service.ts** (15 queries)

### Low Usage / Optional - Priority 4

21-56. Various workers, tests, utilities, seeds

---

## Migration Strategy

### Phase 1: Fix Critical Path (Week 1)

**Goal**: Eliminate 500 errors on core user flows

**Services to migrate**:
1. ✅ UserProfileService - DONE
2. PermissionService - Fix permission checks
3. NotificationsService - Fix notification UI
4. OrgsService - Fix org management
5. ProjectsService - Fix project management

**Expected outcome**:
- User login works ✅
- Permission checks work ✅
- Org/project management works ✅
- Notifications work ✅
- Frontend functional ✅

### Phase 2: High-Usage Services (Week 2-3)

**Services to migrate**:
6. GraphService - Most complex, needs careful migration
7. ExtractionJobService - Job queue
8. DocumentsService - Document CRUD
9. ChunksService - Chunk CRUD
10. ChatService - Chat functionality

### Phase 3: Remaining Services (Week 4-5)

**All remaining 46 services**

### Phase 4: Cleanup (Week 6)

1. Remove DatabaseService completely
2. Remove old migration scripts
3. Remove validation scripts (use TypeORM)
4. Update all documentation
5. Final testing

---

## Example Migrations

### PermissionService (Simple)

**BEFORE** (Raw SQL):
```typescript
const orgRows = await this.db.query(
  'SELECT organization_id, role FROM kb.organization_memberships WHERE user_id = $1',
  [userId]
);
```

**AFTER** (TypeORM):
```typescript
const orgMemberships = await this.orgMembershipRepository.find({
  where: { userId },
  select: ['organizationId', 'role'],
});
```

### GraphService (Complex)

**BEFORE** (Raw SQL with CTE):
```typescript
const result = await this.db.query(`
  WITH RECURSIVE lineage AS (
    SELECT id, canonical_id, version FROM kb.graph_objects WHERE id = $1
    UNION ALL
    SELECT o.id, o.canonical_id, o.version
    FROM kb.graph_objects o
    JOIN lineage l ON o.supersedes_id = l.id
  )
  SELECT * FROM lineage ORDER BY version DESC
`, [objectId]);
```

**AFTER** (TypeORM QueryBuilder):
```typescript
const result = await this.graphObjectRepository
  .createQueryBuilder('obj')
  .where('obj.id = :objectId', { objectId })
  // Note: Recursive CTEs may need raw query builder
  // But still type-safe with query builder helpers
```

---

## Tracking Progress

### Files Migrated (1/56)

- ✅ user-profile.service.ts - Complete

### Files Remaining (55/56)

See list above - prioritized by impact

### Metrics

- Raw SQL queries: 522 → Target: 0
- Type safety: 0.2% → Target: 100%
- Services migrated: 1/56 → Target: 56/56

---

## Testing Strategy

**Per Service**:
1. Create TypeORM version alongside raw SQL
2. Run both in parallel (shadow mode)
3. Compare results
4. Switch to TypeORM only
5. Remove raw SQL
6. Test thoroughly

**Integration Tests**:
- Run full test suite after each service
- Verify no regressions
- Check performance

---

## Benefits When Complete

✅ **100% Type Safety** - All database access type-checked at compile time
✅ **No SQL Injection** - Parameterized queries by default
✅ **Compile-Time Errors** - Wrong table/column names caught in IDE
✅ **Better Autocomplete** - IDEs suggest entity properties
✅ **Easier Refactoring** - Rename column in entity, TypeScript shows all usages
✅ **Simpler Code** - Less boilerplate, more readable
✅ **Automatic Migrations** - Generate from entity changes
✅ **Better Testing** - Easy to mock repositories

---

## Estimated Effort

| Phase | Services | Raw Queries | Developer Days |
|-------|----------|-------------|----------------|
| Phase 1 | 5 critical | ~50 | 5 days |
| Phase 2 | 5 high-usage | ~150 | 10 days |
| Phase 3 | 46 remaining | ~322 | 20 days |
| Phase 4 | Cleanup | - | 3 days |
| **Total** | **56 services** | **522 queries** | **38 days** |

**With 2 developers**: ~3-4 weeks

---

## Current Blockers

**Missing Entities** (still causing 500 errors):
- Many tables referenced in queries don't have entities yet
- Need to create ~10 more entities for most-used tables
- Then generate migrations to create them

**Next Immediate Actions**:
1. Create remaining critical entities (notifications, audit_log, etc.)
2. Generate and run migrations
3. Migrate critical services (permission, orgs, projects)
4. Test frontend works without 500 errors

