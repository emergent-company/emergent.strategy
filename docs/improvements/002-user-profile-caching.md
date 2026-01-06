# Improvement Suggestion: User Profile Lookup Caching

**Status:** Proposed  
**Priority:** Medium  
**Category:** Performance  
**Proposed:** 2026-01-02  
**Proposed by:** AI Agent  
**Assigned to:** Unassigned

---

## Summary

Add caching for user profile lookups in `AuthService.ensureUserProfile()` to avoid redundant database operations when validating the same user across multiple parallel requests.

---

## Current State

- `AuthService.ensureUserProfile()` performs **2 database operations per call**:
  1. `userProfileService.upsertBase(zitadelUserId, ...)` - INSERT/UPDATE
  2. `userProfileService.get(zitadelUserId)` - SELECT
- Called for every JWT validation via `mapClaims()`
- Parallel API requests from same user trigger redundant upserts
- No caching - every token validation hits database twice

**Evidence from logs:**

```
[AUTH] Mapped claims - email: test@emergent-company.ai, sub: 349410150341148675
[AUTH] Mapped claims - email: test@emergent-company.ai, sub: 349410150341148675
... (repeated for each parallel request)
```

---

## Proposed Improvement

### Option A: Skip Upsert for Known Users (Recommended)

Add short-TTL cache to track recently-seen users, skip upsert if seen recently:

```typescript
private knownUsersCache = new Map<string, { profileId: string; expiresAt: number }>();
private readonly KNOWN_USER_CACHE_TTL_MS = 300_000; // 5 minutes

private async ensureUserProfile(zitadelUserId: string, email?: string, scopes?: string[]): Promise<AuthUser | null> {
    const cached = this.knownUsersCache.get(zitadelUserId);
    if (cached && Date.now() < cached.expiresAt) {
        return {
            id: cached.profileId,
            sub: zitadelUserId,
            email,
            scopes,
        };
    }

    // Full upsert + lookup for new/expired users
    await this.userProfileService.upsertBase(zitadelUserId, { email });
    const profile = await this.userProfileService.get(zitadelUserId);

    // Cache the mapping
    this.knownUsersCache.set(zitadelUserId, {
        profileId: profile.id,
        expiresAt: Date.now() + this.KNOWN_USER_CACHE_TTL_MS,
    });

    return { id: profile.id, sub: zitadelUserId, email, scopes };
}
```

**Benefits:**

- Eliminates upsert for returning users (99% of requests)
- Single SELECT only when cache miss
- Profile data still synced every 5 minutes

### Option B: Conditional Upsert

Only upsert when profile data has changed:

```typescript
// Compare cached email/name with incoming, skip upsert if unchanged
if (cached && cached.email === email && cached.displayName === displayName) {
  return cached.authUser;
}
```

---

## Benefits

- **User Benefits:** Faster authentication (reduced latency)
- **Developer Benefits:** Cleaner logs, easier debugging
- **System Benefits:**
  - 50-90% fewer database operations per request
  - Reduced write pressure on user_profiles table
  - Better connection pool utilization
- **Business Benefits:** Database cost reduction

---

## Implementation Approach

1. Add in-memory cache Map to AuthService
2. Check cache before calling userProfileService
3. Update cache after successful profile lookup
4. Add cache size limit (LRU eviction) to prevent memory growth

**Affected Components:**

- `apps/server/src/modules/auth/auth.service.ts`

**Estimated Effort:** Small (~2-3 hours)

---

## Alternatives Considered

### Alternative 1: Redis Cache

- Description: Use Redis for distributed caching
- Pros: Works across multiple server instances
- Cons: Adds infrastructure dependency, network latency
- Why not chosen: Overkill for single-instance deployments, adds complexity

### Alternative 2: Database-Level Caching

- Description: Let PostgreSQL handle caching via buffer pool
- Pros: No code changes needed
- Cons: Still incurs query parsing, planning overhead
- Why not chosen: Application-level cache more effective for this pattern

---

## Risks & Considerations

- **Breaking Changes:** No
- **Performance Impact:** Positive (significant reduction in DB operations)
- **Security Impact:** Neutral (auth still validates JWT, just skips profile sync)
- **Dependencies:** None
- **Migration Required:** No

**Note:** If email/profile data changes in Zitadel, it may take up to 5 minutes to sync. This is acceptable for most use cases.

---

## Success Metrics

- Metric 1: `userProfileService.upsertBase()` calls reduced by 80%+
- Metric 2: Database write operations per authenticated request reduced
- Metric 3: Auth validation latency P95 improved by 20%+

---

## Testing Strategy

- [ ] Unit tests for cache hit/miss scenarios
- [ ] Unit tests for cache expiration
- [ ] Integration tests verifying profile sync still works
- [ ] Load test comparing before/after DB operation counts

---

## Related Items

- Related to userinfo caching (implemented)
- Related to permission caching (improvement #001)

---

## References

- `apps/server/src/modules/auth/auth.service.ts` (ensureUserProfile method)
- `apps/server/src/modules/user-profile/user-profile.service.ts`

---

**Last Updated:** 2026-01-02 by AI Agent
