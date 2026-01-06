# Improvement Suggestion: Frontend API Call Batching

**Status:** Proposed  
**Priority:** Low  
**Category:** Performance / Architecture  
**Proposed:** 2026-01-02  
**Proposed by:** AI Agent  
**Assigned to:** Unassigned

---

## Summary

Reduce parallel API calls on page load by implementing request batching or a combined initialization endpoint to minimize authentication overhead.

---

## Current State

- Frontend makes **multiple parallel API calls** on page load:
  - `GET /user/profile`
  - `GET /notifications`
  - `GET /projects`
  - `GET /orgs`
  - `GET /documents` (if on documents page)
  - etc.
- Each request independently triggers:
  1. JWT validation
  2. Zitadel userinfo fetch (if email missing)
  3. User profile upsert
  4. Permission computation
- Result: 6+ requests × 4+ operations = 24+ backend operations per page load

**Evidence from logs** (within ~100ms):

```
[AUTH] Verifying JWT token...
[AUTH] Email missing from JWT, fetching userinfo...
[AUTH] Got userinfo from Zitadel...
Computing permissions for user...
... (repeated 6+ times)
```

---

## Proposed Improvement

### Option A: Combined Initialization Endpoint (Recommended)

Create a single `/api/init` or `/api/bootstrap` endpoint that returns all data needed for initial page render:

```typescript
// Backend: InitController
@Get('init')
async getInitData(@Req() req: Request) {
    const user = req.user;

    const [profile, orgs, projects, notifications] = await Promise.all([
        this.userService.getProfile(user.id),
        this.orgsService.listForUser(user.id),
        this.projectsService.listForUser(user.id),
        this.notificationsService.getUnread(user.id),
    ]);

    return { profile, orgs, projects, notifications };
}
```

```typescript
// Frontend: Single call on app mount
const { data } = await api.get('/init');
setUser(data.profile);
setOrgs(data.orgs);
setProjects(data.projects);
setNotifications(data.notifications);
```

**Benefits:**

- Single auth validation per page load
- Parallel data fetching on backend (more efficient)
- Reduced network round trips
- Simpler loading states

### Option B: GraphQL

Migrate to GraphQL for flexible data fetching:

```graphql
query InitialLoad {
  me {
    id
    email
    displayName
  }
  myOrgs {
    id
    name
  }
  myProjects {
    id
    name
  }
  unreadNotifications {
    id
    title
  }
}
```

**Benefits:**

- Single request, flexible payload
- Client specifies exactly what data needed
- Built-in caching (Apollo, urql)

**Drawbacks:**

- Significant architectural change
- Learning curve
- Different caching model

### Option C: Request Deduplication

Use a request deduplication layer (e.g., SWR, React Query) to coalesce identical requests:

```typescript
// Already somewhat handled by React Query, but could be improved
const { data: orgs } = useQuery(['orgs'], fetchOrgs, { staleTime: 30000 });
```

**Benefits:**

- Minimal code changes
- Works with existing endpoints

**Drawbacks:**

- Doesn't reduce initial burst
- Each endpoint still validates separately

---

## Benefits

- **User Benefits:** Faster page loads (50%+ reduction in initial load time)
- **Developer Benefits:** Simpler loading state management
- **System Benefits:**
  - 80%+ reduction in auth operations per page load
  - Better backend resource utilization
  - Reduced network overhead
- **Business Benefits:** Improved user experience metrics

---

## Implementation Approach

### Phase 1: Combined Init Endpoint

1. Create `InitController` with `/api/init` endpoint
2. Return user profile, orgs, projects, notifications in single response
3. Update frontend to call `/api/init` on app mount
4. Remove individual calls from initial render

### Phase 2: Page-Specific Batching

1. Create page-specific batch endpoints (e.g., `/api/documents-page-init`)
2. Return all data needed for that page
3. Use code splitting to load batch data with page

**Affected Components:**

- New: `apps/server/src/modules/init/init.controller.ts`
- Modified: `apps/admin/src/App.tsx` (or equivalent entry point)
- Modified: Individual page components (remove redundant fetches)

**Estimated Effort:** Medium (~1-2 days)

---

## Alternatives Considered

### Alternative 1: HTTP/2 Multiplexing Only

- Description: Rely on HTTP/2 connection reuse
- Pros: No code changes
- Cons: Each request still triggers full auth chain
- Why not chosen: Doesn't address auth overhead issue

### Alternative 2: Server-Sent Events for Initial Data

- Description: Push initial data via SSE on connection
- Pros: Real-time updates built-in
- Cons: More complex implementation
- Why not chosen: Overkill for initial load optimization

---

## Risks & Considerations

- **Breaking Changes:** No (additive endpoint)
- **Performance Impact:** Positive (significant reduction in operations)
- **Security Impact:** Requires review (combined endpoint needs same auth as individual)
- **Dependencies:** None
- **Migration Required:** Gradual (can coexist with existing endpoints)

**Note:** Individual endpoints should remain for granular data refresh after initial load.

---

## Success Metrics

- Metric 1: Initial page load API calls reduced from 6+ to 1-2
- Metric 2: Time to interactive (TTI) improved by 30%+
- Metric 3: Backend operations per page load reduced by 80%+

---

## Testing Strategy

- [ ] Unit tests for combined endpoint
- [ ] Integration tests verifying all data returned correctly
- [ ] E2E tests for initial page load flow
- [ ] Performance tests comparing before/after load times

---

## Related Items

- Depends on backend caching improvements (#001, #002) for maximum benefit
- Could be enhanced by React Query/SWR adoption

---

## References

- Frontend entry point: `apps/admin/src/App.tsx`
- Example batching pattern: Facebook's DataLoader
- GraphQL alternative: Apollo Server/Client

---

**Last Updated:** 2026-01-02 by AI Agent
