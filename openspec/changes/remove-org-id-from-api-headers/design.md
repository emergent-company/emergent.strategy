# Design: Remove Organization ID from API Headers

## Context

The current API architecture requires clients to send both `x-org-id` and `x-project-id` headers for tenant scoping. This dual-header approach was originally implemented to support both organization-level and project-level operations. However, in practice:

1. Projects always belong to exactly one organization (database foreign key constraint)
2. Most operations are project-scoped, with organization derived implicitly
3. Sending both headers creates validation complexity and data integrity risks
4. The Row-Level Security (RLS) system can derive organization from project server-side

### Current Architecture

```
Client Request
├── x-org-id: "org-123"          ← User-provided (can be wrong!)
├── x-project-id: "project-456"  ← User-provided
└── Authorization: Bearer <token>

Controller
├── Reads both headers
├── Passes both to service layer
└── Service calls DatabaseService.runWithTenantContext(orgId, projectId, fn)

DatabaseService
├── Sets app.current_organization_id = orgId
├── Sets app.current_project_id = projectId
└── Executes query with RLS context

Database (RLS Policies)
└── Filters rows where organization_id = current_setting('app.current_organization_id')
    AND project_id = current_setting('app.current_project_id')
```

**Problem**: Client can send mismatched pairs (e.g., project A with org B), requiring validation or risking inconsistent state.

### Proposed Architecture

```
Client Request
├── x-project-id: "project-456"  ← Single source of truth
└── Authorization: Bearer <token>

Controller
├── Reads only project ID
└── Passes only project ID to service layer

Service Layer
└── Calls DatabaseService.runWithTenantContext(projectId, fn)

DatabaseService
├── Derives orgId from projectId via lookup/cache
├── Sets app.current_organization_id = <derived orgId>
├── Sets app.current_project_id = projectId
└── Executes query with RLS context

Database (RLS Policies)
└── Filters rows where project_id = current_setting('app.current_project_id')
    (org constraint automatically satisfied via FK)
```

**Benefit**: Server-side derivation ensures consistency; impossible for client to send mismatched data.

## Goals

- **Primary**: Eliminate client-provided organization ID from API headers
- **Primary**: Derive organization ID server-side from project ID
- **Primary**: Maintain RLS security guarantees
- **Secondary**: Simplify API surface and reduce validation logic
- **Secondary**: Improve API developer experience

## Non-Goals

- Removing organization concept from UI (still needed for org switching)
- Changing database schema (projects.organization_id stays)
- Supporting organization-only scoping (all operations are project-scoped)
- Supporting multi-project operations in single request

## Decisions

### Decision 1: Derive org ID in DatabaseService, not controllers

**Rationale**: Centralize the derivation logic to avoid duplication across 10+ controllers.

**Implementation**:
```typescript
// DatabaseService
private projectOrgCache = new Map<string, string>(); // Simple in-memory cache

async getOrgIdFromProjectId(projectId: string): Promise<string> {
  // Check cache
  if (this.projectOrgCache.has(projectId)) {
    return this.projectOrgCache.get(projectId)!;
  }
  
  // Query database
  const result = await this.query(
    'SELECT organization_id FROM kb.projects WHERE id = $1',
    [projectId]
  );
  
  if (result.rows.length === 0) {
    throw new Error(`Project ${projectId} not found`);
  }
  
  const orgId = result.rows[0].organization_id;
  this.projectOrgCache.set(projectId, orgId);
  return orgId;
}

async runWithTenantContext<T>(
  projectId: string | null | undefined,
  fn: () => Promise<T>
): Promise<T> {
  const normalizedProject = projectId ?? null;
  const normalizedOrg = projectId 
    ? await this.getOrgIdFromProjectId(projectId)
    : null;
  
  // Rest of existing logic...
}
```

**Alternatives considered**:
- Derive in each controller: Too much duplication
- Derive in middleware: Too early (before auth/validation)
- Database function for RLS: Adds query overhead; prefer app-level cache

### Decision 2: Use simple in-memory cache for project→org mappings

**Rationale**: 
- Project→org relationship rarely changes
- Cache hit rate will be very high (same projects accessed repeatedly)
- Cache invalidation not critical (restart clears cache, which is acceptable)
- Avoids external dependency (Redis, etc.)

**Cache Characteristics**:
- **Global**: Cache is shared across ALL users and requests on the same server instance
- **Keyed by project ID**: `Map<projectId, orgId>` stores universal facts about projects
- **User-agnostic**: When User A queries Project X, User B benefits from the cached result
- **Session-independent**: User switching projects triggers different cache lookups (one per project)

**Example Flow**:
```typescript
// Server cache (shared globally)
projectOrgCache = Map { }

// User Alice requests Project A
getOrgIdFromProjectId("proj-a") → Cache miss → Query DB → returns "org-1"
// Cache: { "proj-a": "org-1" }

// User Bob requests Project B
getOrgIdFromProjectId("proj-b") → Cache miss → Query DB → returns "org-2"  
// Cache: { "proj-a": "org-1", "proj-b": "org-2" }

// User Alice switches to Project B (frontend changes x-project-id header)
getOrgIdFromProjectId("proj-b") → Cache HIT → returns "org-2" (no DB query!)

// User Carol requests Project A
getOrgIdFromProjectId("proj-a") → Cache HIT → returns "org-1" (no DB query!)
```

**Trade-offs**:
- **Pro**: Zero latency for cache hits
- **Pro**: No external dependencies
- **Pro**: Automatic cleanup on restart
- **Pro**: All users benefit from each other's cache warming
- **Con**: Cache not shared across multiple server instances (acceptable - small overhead per instance)
- **Con**: No TTL or size limit (acceptable - projects table is small, typically <1000 projects)

**Future optimization**: If cache grows large, add LRU eviction. If multi-instance consistency needed, add Redis.

### Decision 3: Keep org ID in RLS session variables

**Rationale**: Existing RLS policies may check both `app.current_organization_id` and `app.current_project_id`. Keeping both variables minimizes RLS policy changes.

**Implementation**: DatabaseService still sets both session variables, but derives org server-side.

**Alternatives considered**:
- Remove org from RLS entirely: Would require auditing/updating all RLS policies
- Use DB function in RLS to derive org: Adds overhead to every query

### Decision 4: Breaking API change (no backward compatibility)

**Rationale**: 
- This appears to be an internal API (no external consumers identified)
- Backward compatibility adds complexity (need to support both patterns)
- Clean break is simpler and prevents misuse of old pattern

**Migration strategy**: Coordinate frontend/backend deployments.

**Alternatives considered**:
- Optional org-id with validation: Adds complexity, doesn't prevent misuse
- Deprecation period: Unnecessary for internal API

## Implementation Strategy

### Phase 1: Foundation (Low Risk)
1. Add `getOrgIdFromProjectId()` helper to DatabaseService
2. Add unit tests for derivation logic
3. Keep existing `runWithTenantContext(orgId, projectId)` signature temporarily

### Phase 2: Internal Refactor (Medium Risk)
1. Add new method `runWithTenantContext(projectId)` that calls old method internally
2. Gradually migrate service layer to use new signature
3. Run tests continuously to catch issues early

### Phase 3: API Surface Change (High Risk)
1. Update all controllers to stop reading `x-org-id`
2. Remove old `runWithTenantContext(orgId, projectId)` signature
3. Update frontend to stop sending `x-org-id`
4. Deploy backend and frontend together

### Phase 4: Cleanup (Low Risk)
1. Remove deprecation warnings
2. Update documentation
3. Archive change proposal

## Risks and Mitigations

### Risk 1: Performance degradation from org lookups

**Impact**: Medium  
**Probability**: Low

**Mitigation**:
- In-memory cache provides O(1) lookup for cache hits
- Expected cache hit rate: >99% (projects accessed repeatedly)
- Fallback: Add Redis cache if needed
- Monitoring: Track cache hit rate and derivation latency

### Risk 2: RLS policies break with project-only context

**Impact**: High  
**Probability**: Low

**Mitigation**:
- Continue setting both session variables (derive org server-side)
- Audit all RLS policies before deployment
- Comprehensive RLS testing in staging
- Rollback plan: Revert deployment if RLS issues detected

### Risk 3: Existing code reads org directly from headers

**Impact**: Medium  
**Probability**: Medium

**Mitigation**:
- Comprehensive search for `x-org-id` usage: `rg "x-org-id" --type ts`
- Update all locations found
- Integration tests verify header-based org access is gone

### Risk 4: Cache grows unbounded

**Impact**: Low  
**Probability**: Low

**Mitigation**:
- Projects table is small (typical installation: <100 projects)
- Cache size negligible (<10KB for 1000 projects)
- Future: Add LRU eviction if needed

### Risk 5: Multi-instance cache inconsistency

**Impact**: Low  
**Probability**: High (in multi-instance deployments)

**Analysis**: 
- Cache miss just means one extra query
- Project→org relationship rarely changes
- Inconsistency window is small (until next query)
- **Acceptable**: No user-facing impact

**Future mitigation**: Redis cache if consistency becomes issue

## Migration Plan

### Pre-Deployment
1. ✅ Create and validate OpenSpec proposal
2. ✅ Implement `getOrgIdFromProjectId()` and tests
3. ✅ Update all backend services and controllers
4. ✅ Update frontend header building
5. ✅ Update all tests
6. ✅ Run full test suite (unit + E2E)

### Deployment
1. Deploy backend with new changes
2. Deploy frontend with new changes (immediately after backend)
3. Monitor error logs for 30 minutes
4. Run smoke tests: CRUD operations across all modules

### Rollback Plan
If issues detected:
1. Revert frontend deployment (restore `x-org-id` in headers)
2. Revert backend deployment (restore dual-parameter API)
3. Investigate root cause
4. Fix and re-deploy

### Post-Deployment Verification
1. Check error logs for "Project not found" errors (indicates derivation failure)
2. Verify RLS is correctly filtering data (spot-check different projects)
3. Monitor API response times (ensure no performance regression)
4. Verify cache hit rate through metrics/logs

## Open Questions

1. **Q: Should we add cache TTL or size limits?**  
   **A**: Not initially. Projects table is small. Add if needed.

2. **Q: Should we support organization-only scoping (no project)?**  
   **A**: No. All operations are project-scoped in current design.

3. **Q: What if a project is deleted?**  
   **A**: Cache entry becomes stale. Next request with that project ID will get "not found" error, which is correct behavior.

4. **Q: Should we validate project belongs to user's accessible orgs?**  
   **A**: Yes, but this is already handled by authentication/authorization logic. Orthogonal to this change.

5. **Q: What happens when a user switches projects in the frontend?**  
   **A**: Cache is keyed by project ID (not user or session). When frontend sends `x-project-id: project-b` instead of `x-project-id: project-a`, the server performs a different cache lookup. Each project gets its own cache entry. User switching projects is just switching which cache key is used - the cache handles this naturally.

## Success Metrics

- **Code Quality**: Controllers reduced from ~20 lines to ~10 lines (header parsing)
- **API Simplicity**: Required headers reduced from 3 to 2
- **Performance**: <1ms overhead for org derivation (cache hit)
- **Reliability**: Zero incidents related to mismatched org/project pairs
- **Developer Experience**: Positive feedback from team on simplified API

## References

- Similar pattern used in Stripe API (derive customer from subscription)
- Related to recent RLS context bugfix (disappearing documents)
- Follows principle: "Make impossible states impossible"
