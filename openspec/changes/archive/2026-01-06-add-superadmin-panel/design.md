# Design: Superadmin Panel

## Context

The Spec Server currently implements a hierarchical multi-tenancy model with org-scoped and project-scoped roles. Platform operators have no system-wide view to:

- See all users across organizations
- Access any project for support/debugging
- View email delivery history
- Diagnose user-reported issues from the user's perspective

This design introduces a "superadmin" system role that operates above the org/project hierarchy, along with supporting infrastructure for activity tracking and view-as impersonation.

### Stakeholders

- Platform operators (superadmins)
- End users (affected by activity tracking, impersonation)
- Security team (audit requirements)

### Constraints

- Must integrate with existing Zitadel authentication
- Must preserve existing org/project authorization model
- Must maintain clear audit trail for compliance
- Must not require changes to Zitadel configuration

## Goals / Non-Goals

### Goals

- Enable system-wide administrative access for platform operators
- Provide user activity visibility (last seen timestamps)
- Allow safe "view-as" impersonation for support scenarios
- Surface email delivery history with preview capability
- Maintain complete audit trail of superadmin actions

### Non-Goals

- Self-service superadmin grants (must be CLI/DB direct)
- "Act-as" impersonation where actions are attributed to impersonated user
- User impersonation for Zitadel authentication (only app-level context)
- Real-time user session monitoring or live feed
- Billing/subscription management

## Decisions

### D1: Superadmin Storage Model

**Decision**: Use a separate `core.superadmins` table rather than a flag on `user_profiles`.

**Rationale**:

- Provides audit trail (who granted, when, optionally revoked_at)
- Separates concerns from user profile data
- Easier to query for compliance/reporting
- Supports future extensions (e.g., scoped superadmin, expiry dates)

**Schema**:

```sql
CREATE TABLE core.superadmins (
  user_id UUID PRIMARY KEY REFERENCES core.user_profiles(id),
  granted_by UUID REFERENCES core.user_profiles(id),
  granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ NULL,
  revoked_by UUID REFERENCES core.user_profiles(id) NULL,
  notes TEXT NULL
);
```

**Alternatives Considered**:

- Flag on `user_profiles.is_superadmin`: Simpler but no audit trail, harder to reason about role separation
- Zitadel custom claims: Requires Zitadel config changes, harder to manage/audit

### D2: View-As Impersonation Mechanism

**Decision**: Header-based context switching with dual context tracking.

**Mechanism**:

1. Superadmin sends `X-View-As-User-ID: <uuid>` header
2. Backend resolves both:
   - `req.superadminUser` (actual authenticated user)
   - `req.viewAsUser` (impersonated user context)
3. Authorization checks use `viewAsUser` context
4. Audit logs record both users: `actor: superadminUser, viewAs: viewAsUser`
5. Mutations are allowed but logged as superadmin action

**API Example**:

```http
GET /api/documents
Authorization: Bearer <superadmin-token>
X-View-As-User-ID: 550e8400-e29b-41d4-a716-446655440000
```

**Response includes context**:

```json
{
  "documents": [...],
  "_viewAs": {
    "userId": "550e8400-e29b-41d4-a716-446655440000",
    "userName": "John Doe",
    "actingAs": "superadmin"
  }
}
```

**Alternatives Considered**:

- Session-based impersonation: More complex, harder to audit, persists across requests
- Token minting for impersonated user: Security risk, loses audit trail
- Read-only view-as: Too limiting for support scenarios (need to test actions)

### D3: Activity Tracking Implementation

**Decision**: Middleware-based tracking with debounced updates.

**Implementation**:

1. Add `last_activity_at TIMESTAMPTZ` to `core.user_profiles`
2. Create `ActivityTrackingMiddleware` that:
   - Fires on authenticated requests
   - Debounces updates (max 1 write per user per 60 seconds)
   - Uses in-memory cache keyed by user ID with TTL
   - Async update (non-blocking to request)

**Debounce Logic**:

```typescript
// In-memory: Map<userId, lastUpdateTime>
const activityCache = new Map<string, number>();
const DEBOUNCE_MS = 60_000; // 1 minute

async function trackActivity(userId: string) {
  const now = Date.now();
  const lastUpdate = activityCache.get(userId) || 0;
  if (now - lastUpdate > DEBOUNCE_MS) {
    activityCache.set(userId, now);
    // Fire async update (don't await in request path)
    this.userRepository.update(userId, { lastActivityAt: new Date() });
  }
}
```

**Alternatives Considered**:

- Event-based async queue: Over-engineered for this use case
- Zitadel last login sync: Only captures login events, not activity
- Real-time tracking via WebSocket: Too complex, not needed

### D4: Email Preview Rendering

**Decision**: On-demand rendering from stored template + data.

**Implementation**:

- Email jobs already store `templateName` and `templateData`
- Preview endpoint renders template on-demand using same template engine
- No need to store rendered HTML (saves storage, always up-to-date with template)

**Endpoint**:

```
GET /superadmin/email-jobs/:id/preview
Response: Content-Type: text/html
```

**Alternatives Considered**:

- Store rendered HTML in `email_jobs.rendered_html`: Storage overhead, stale if template changes
- Frontend-only rendering: Would need to expose templates and rendering logic to client

### D5: Authorization Guard Order

**Decision**: SuperadminGuard checks first, then falls back to existing guards.

**Guard Order**:

1. `JwtAuthGuard` - Validates JWT, populates `req.user`
2. `SuperadminGuard` - If user is superadmin, sets `req.isSuperadmin = true`
3. `ScopesGuard` - Checks scopes, but allows all if `req.isSuperadmin` (or uses superadmin scope set)

**Superadmin Scope Set**:
Superadmins implicitly have all scopes:

```typescript
const SUPERADMIN_SCOPES = ['*']; // Or enumerate all scopes
```

## Risks / Trade-offs

| Risk                                       | Mitigation                                             |
| ------------------------------------------ | ------------------------------------------------------ |
| Superadmin abuse / unauthorized access     | Audit trail, no self-grant API, periodic access review |
| Activity tracking performance impact       | Debouncing, async writes, monitoring DB write load     |
| View-as confusion (who did what?)          | Clear logging with both actors, UI banner              |
| Email preview XSS via stored template data | Render in sandboxed iframe, sanitize HTML output       |
| Stale activity cache on multi-instance     | Accept slight inaccuracy (60s granularity acceptable)  |

## Migration Plan

### Phase 1: Database Schema

1. Create `core.superadmins` table
2. Add `last_activity_at` to `user_profiles`
3. Seed initial superadmin via migration or CLI script

### Phase 2: Backend Implementation

1. `SuperadminGuard` and decorator
2. Activity tracking middleware
3. View-as context resolver middleware
4. Superadmin API endpoints (users, orgs, projects, email-jobs)

### Phase 3: Frontend Implementation

1. Superadmin dashboard layout
2. User management table
3. Org/project browser
4. Email history with preview modal
5. View-as banner and exit control

### Rollback

- Superadmin table can be dropped without affecting other functionality
- Activity column is additive (no breaking changes)
- Feature flag `SUPERADMIN_ENABLED=0` to disable routes

## Open Questions

1. **Should superadmin grants expire?** - Could add `expires_at` column for temporary grants. Defer until needed.

2. **Should we notify users when being viewed-as?** - Privacy consideration. Recommend: No notification, but include in privacy policy.

3. **Should activity tracking include endpoint/action details?** - Could add `last_activity_endpoint` column. Defer as over-engineering for MVP.

4. **Multi-instance activity cache sync?** - Accept 60s granularity without Redis. If needed later, add shared cache.
