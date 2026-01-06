# Improvement Suggestion: Request-Scoped Permission Caching

**Status:** Proposed  
**Priority:** High  
**Category:** Performance  
**Proposed:** 2026-01-02  
**Proposed by:** AI Agent  
**Assigned to:** Unassigned

---

## Summary

Add request-scoped caching for `PermissionService.compute()` to avoid redundant database queries when multiple guards/services access permissions within the same HTTP request.

---

## Current State

- `PermissionService.compute(userId)` executes **2 database queries per call**:
  1. `orgMembershipRepository.find({ userId })`
  2. `projectMembershipRepository.find({ userId })`
- `ScopesGuard.canActivate()` calls `compute()` for every protected endpoint
- When multiple endpoints are hit in parallel (page load), each request runs these queries independently
- No caching exists at any level - every call hits the database

**Evidence from logs** (within ~100ms window):

```
Computing permissions for user ef39c520-3d72-4b6d-8d5b-c18a48c1b443
Computing permissions for user ef39c520-3d72-4b6d-8d5b-c18a48c1b443
Computing permissions for user ef39c520-3d72-4b6d-8d5b-c18a48c1b443
... (6+ times)
```

---

## Proposed Improvement

### Option A: Request-Scoped Caching (Recommended)

Attach computed permissions to the request object after first computation:

```typescript
// In ScopesGuard.canActivate()
async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<any>();
    const user = req.user;

    // Check if already computed for this request
    if (!req.effectivePermissions) {
        req.effectivePermissions = await this.perms.compute(user.id);
    }

    const computed = req.effectivePermissions;
    // ... rest of guard logic
}
```

**Benefits:**

- Zero database calls for subsequent permission checks within same request
- No memory overhead beyond request lifecycle
- No cache invalidation concerns
- Simple implementation

### Option B: Short-TTL In-Memory Cache

Add a Map-based cache in PermissionService with 30-60 second TTL:

```typescript
private permissionCache = new Map<string, { data: EffectivePermissions; expiresAt: number }>();
private readonly PERMISSION_CACHE_TTL_MS = 30_000;

async compute(userId: string): Promise<EffectivePermissions> {
    const cached = this.permissionCache.get(userId);
    if (cached && Date.now() < cached.expiresAt) {
        return cached.data;
    }
    // ... compute and cache
}
```

**Benefits:**

- Works across requests (parallel API calls benefit)
- Reduces database load significantly

**Drawbacks:**

- Requires cache invalidation on role changes
- Memory overhead for active users
- Slightly stale permissions possible (30s window)

---

## Benefits

- **User Benefits:** Faster page loads (reduced latency)
- **Developer Benefits:** Simpler debugging (fewer log entries)
- **System Benefits:**
  - 2x fewer database queries per request
  - Reduced connection pool pressure
  - Better scalability under load
- **Business Benefits:** Infrastructure cost reduction

---

## Implementation Approach

1. Implement Option A first (request-scoped) - lowest risk
2. Measure impact on typical page load (expect 50%+ reduction in permission queries)
3. If cross-request caching needed, add Option B with proper invalidation

**Affected Components:**

- `apps/server/src/modules/auth/scopes.guard.ts`
- `apps/server/src/modules/auth/permission.service.ts`

**Estimated Effort:** Small (Option A: ~1 hour, Option B: ~4 hours)

---

## Risks & Considerations

- **Breaking Changes:** No
- **Performance Impact:** Positive (significant query reduction)
- **Security Impact:** Neutral (permissions still computed from database)
- **Dependencies:** None
- **Migration Required:** No

---

## Success Metrics

- Metric 1: "Computing permissions" log entries reduced by 80%+ per page load
- Metric 2: Database query count per request reduced by 50%+
- Metric 3: P95 response time improved for authenticated endpoints

---

## Testing Strategy

- [ ] Unit tests for cache hit/miss scenarios
- [ ] Integration tests verifying permissions still enforced correctly
- [ ] Load test comparing before/after query counts

---

## Related Items

- Addresses excessive auth logging issue (this investigation)
- Related to userinfo caching (implemented in this session)

---

## References

- `apps/server/src/modules/auth/permission.service.ts` (current implementation)
- `apps/server/src/modules/auth/scopes.guard.ts` (guard that calls compute())

---

**Last Updated:** 2026-01-02 by AI Agent
