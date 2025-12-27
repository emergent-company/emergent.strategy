# 18. Authorization Model (Roles & Scopes)

Status: Draft (v0.1 – initial role model)  
Target Version: >= 0.3.0 (first enforcement)  
Related Specs: `02-requirements.md`, `03-architecture.md` (AuthN/AuthZ), `17-server-e2e-testing.md` (E2E coverage)  
AuthN Provider: Zitadel (OIDC)

---

## 1. Goals

Provide a clear, incremental authorization (AuthZ) design that:

1. Supports hierarchical multi‑tenancy (Organization → Projects).
2. Introduces an initial minimal role set:
   - Organization: `org_admin` (can manage org + projects)
   - Project: `project_admin`, `project_user`
3. Ensures project membership grants **visibility** of its parent organization (name/id, list of sibling projects) without escalation to organization management capabilities.
4. Enables invitation workflows at both org and project scope.
5. Establishes a forward‑compatible mapping layer (roles → scopes → permissions) for future fine‑grained feature gating (e.g. allow Chat usage but deny Document ingestion).
6. Integrates with (or replaces) the currently disabled `ScopesGuard` with a combined Role+Scope guard once stable.

Non‑Goals (v0.1):

- Billing, seat limits, project quotas.
- Row‑level content ACLs beyond existing org/project isolation.
- UI-based custom role editor.

## 2. Conceptual Model

| Concept               | Description                                                                                                                                               |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Organization          | Top-level tenant boundary. Contains Projects and Org Memberships.                                                                                         |
| Project               | Sub-tenant / workspace under an Organization. Contains Documents, Chat Conversations, etc.                                                                |
| Role                  | A named bundle of scopes (current roles are hard-coded).                                                                                                  |
| Scope                 | Atomic permission (feature/action capability). Will be embedded in JWT custom claims or resolved server-side.                                             |
| Membership            | Association of a User to an Organization or Project with a Role.                                                                                          |
| Effective Permissions | Union of: (a) Direct Org role scopes, (b) Direct Project role scopes (for that project), (c) Implicit minimal org visibility from any project membership. |

### 2.1 Hierarchy & Visibility

```
Organization (org_admins[], members inferred)
  └── Project A (project_admins[], project_users[])
  └── Project B (...)
```

Project membership ⇒ implicit **Org Visibility** (read‑only): can list org metadata + list/read projects they are a member of; cannot mutate org or unrelated projects.

## 3. Initial Roles & Semantics (v0.1)

### 3.1 Role Definitions

| Role          | Level   | Summary                                                                                                                                                                                                                                                                      |
| ------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| org_admin     | Org     | Full control over organization metadata & all contained projects (create/update/delete project, manage org invites, upgrade/downgrade roles, delete org).                                                                                                                    |
| project_admin | Project | Full control over a single project (settings, documents, ingestion, chat, invite/remove project members). No organization-wide modifications.                                                                                                                                |
| project_user  | Project | Standard usage within a project (read/search documents, use chat, create personal conversations, upload documents if allowed by future scope mapping). Cannot manage project settings, membership, or delete documents unless explicitly granted by future scope expansions. |

### 3.2 Future Roles (Not Implemented Yet)

Examples (for planning / mapping): `org_viewer`, `org_billing`, `project_viewer`, `project_analyst`, `project_ingest`, `project_chat_only`.

### 3.3 Automatic Role Assignment

| Action              | Resulting Membership                                                                                                                                        | Notes                                                                                                                                |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Create Organization | Creator inserted as `org_admin` in `organization_memberships`                                                                                               | Idempotent: if user already has an org_admin membership (should not prior to creation) no duplicate row; role escalation not needed. |
| Create Project      | Creator becomes `project_admin` for the new project. If they are an `org_admin`, they still also get an explicit `project_admin` row (for uniform queries). | Ensures every project has at least one admin.                                                                                        |

Escalation Rule: Creating a project does NOT auto‑grant `org_admin` if the creator only has project-level roles in other projects; they must already possess sufficient rights (authorization check) to invoke project creation (currently only `org_admin`).

Deletion Safeguard: API must refuse to delete an org if it would orphan active projects without any `project_admin` (should not happen—project admins are per project). A project delete is permitted as long as audit logs can record which admin initiated it.

## 4. Scope Layer (Forward Compatible)

Although the initial enforcement can be strictly role → permission, we formalize core future scopes now so endpoint decorators and OpenAPI documentation remain stable:

| Scope              | Planned Use                                                            |
| ------------------ | ---------------------------------------------------------------------- |
| org:read           | View org metadata.                                                     |
| org:write          | Edit org name/settings.                                                |
| org:project:create | Create new project under org.                                          |
| org:project:delete | Delete/disable project.                                                |
| org:invite         | Invite org members.                                                    |
| project:read       | Read project metadata.                                                 |
| project:write      | Update project settings (name, description, retention).                |
| project:invite     | Invite project members.                                                |
| docs:read          | List/search documents & chunks.                                        |
| docs:write         | Ingest/upload/update documents.                                        |
| docs:delete        | Delete documents.                                                      |
| chat:use           | Start conversations & send messages.                                   |
| chat:admin         | Delete / moderate conversations.                                       |
| settings:write     | Platform or advanced feature settings (per project) — optional future. |

### 4.1 Initial Role → Scope Mapping (Authoritative Table v0.1)

| Role          | org:read   | org:write | org:project:create | org:project:delete | org:invite | project:read | project:write | project:invite | docs:read | docs:write             | docs:delete | chat:use | chat:admin       |
| ------------- | ---------- | --------- | ------------------ | ------------------ | ---------- | ------------ | ------------- | -------------- | --------- | ---------------------- | ----------- | -------- | ---------------- |
| org_admin     | ✅         | ✅        | ✅                 | ✅                 | ✅         | ✅ (all)     | ✅ (all)      | ✅ (all)       | ✅        | ✅                     | ✅          | ✅       | ✅               |
| project_admin | (implicit) | ❌        | ❌                 | ❌                 | ❌         | ✅ (own)     | ✅ (own)      | ✅ (own)       | ✅        | ✅                     | ✅          | ✅       | ✅ (own project) |
| project_user  | (implicit) | ❌        | ❌                 | ❌                 | ❌         | ✅ (own)     | ❌            | ❌             | ✅        | (future config: maybe) | ❌          | ✅       | ❌               |

Implicit org visibility for project roles corresponds only to `org:read` for the owning org + `project:read` for their projects.

## 5. Data Model

### 5.1 Tables

```sql
-- Users table assumed already present (id UUID PK, email, ...)

CREATE TABLE organizations (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE projects (
  id UUID PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Organization Memberships
CREATE TABLE organization_memberships (
  user_id UUID NOT NULL,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('org_admin')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, organization_id)
);

-- Project Memberships
CREATE TABLE project_memberships (
  user_id UUID NOT NULL,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('project_admin','project_user')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, project_id)
);

-- Future: role_catalog (role -> scope bitset) for dynamic expansion.
```

### 5.2 Derived Views / Indices

```sql
CREATE INDEX idx_project_memberships_user ON project_memberships(user_id);
CREATE INDEX idx_org_memberships_user ON organization_memberships(user_id);
CREATE INDEX idx_projects_org ON projects(organization_id);
```

### 5.3 Implicit Org Visibility

We DO NOT create an explicit org membership row for project-only users. Instead, access resolver: if user lacks `organization_memberships` row but has ≥1 `project_memberships` for that `organization_id`, treat them as having implicit visibility only (no write scopes). This prevents data duplication and simplifies revocation (remove last project membership ⇒ lose org visibility automatically).

### 5.4 Automatic Insert Logic (Pseudo)

```sql
-- On organization create (service layer):
INSERT INTO organizations(id, name) VALUES ($1, $2);
INSERT INTO organization_memberships(user_id, organization_id, role)
VALUES ($creator, $1, 'org_admin');

-- On project create (service layer):
INSERT INTO projects(id, organization_id, name) VALUES ($1, $org, $name);
INSERT INTO project_memberships(user_id, project_id, role)
VALUES ($creator, $1, 'project_admin');
```

Both inserts should be inside the same transaction as the parent entity creation.

## 6. Invitation Workflow

### 6.1 Common Flow

1. Initiator (must have invite capability: `org_admin` for org-level invites; `project_admin` for project-level) calls API.
2. Server creates `invites` row containing: `id`, `email`, `organization_id`, `project_id?`, `target_role`, `expires_at`, `created_by_user_id`, `status`.
3. Server generates signed token (JWT or HMAC) encoding invite id & integrity claims.
4. Email link → `/auth/callback?invite=<token>`.
5. Accept endpoint verifies email ownership (match authenticated user email) and not expired.
6. On acceptance:
   - If project invite: create `project_memberships` with specified role. (No org membership unless role requires it.)
   - If org invite: create `organization_memberships` with role.
   - Idempotent if membership already exists (update role only if escalation allowed).
7. Mark invite `status=accepted`, store `accepted_at`.

### 6.2 Escalation Rules

- Project invite cannot grant `org_admin`.
- Org admin can later promote a `project_admin` to org_admin via explicit operation (future endpoint) – not part of invite acceptance implicit logic.

### 6.3 Revocation

- `DELETE /invites/:id` (pending only) by same capability used to create it.
- Acceptance invalidates token (single-use) or sets `revoked_at` if explicit revoke occurs post-issue.

## 7. Enforcement Architecture

> **Note**: As of 2025-11-18, the `X-Org-ID` header has been removed. Organization ID is now automatically derived from Project ID on the backend. See [Migration Guide](../migrations/remove-org-id-header-migration.md).

Layered approach:

1. **AuthN Guard** – Verifies JWT (Zitadel). Extracts `sub` (user id / external mapping), email.
2. **Context Resolver** – Derives `projectId` from header (`X-Project-ID`) or request params. Organization ID is automatically derived from Project ID server-side via database lookup.
3. **Membership Loader** – Loads (and caches) memberships for (`user_id`, `orgId`, `projectId?`). Provides structure:
   ```ts
   interface RequestAuthContext {
     userId: string;
     orgId?: string; // Derived from projectId server-side
     projectId?: string;
     orgRole?: 'org_admin';
     projectRole?: 'project_admin' | 'project_user';
     implicitOrgRead: boolean; // true if derived via project membership
     scopes: Set<string>; // aggregated scopes (role expansion)
   }
   ```
4. **Role→Scope Expansion** – Deterministic mapping (in-memory constant initially). Adds `org:read` if `implicitOrgRead`.
5. **Authorization Guard** – Decorator on controller endpoints specifying required scopes (and optionally required role level). Example:
   ```ts
   @RequireScopes('docs:write')
   @ProjectScoped() // ensures projectId provided
   ```
6. **Domain-Level Checks** – Resource ownership / row-level policies (existing RLS rules) remain as final enforcement line.

### 7.1 Guard Behavior (v0.1 Transition)

- Until reactivation, `ScopesGuard` is permissive (see `03-architecture.md`). We will introduce a feature flag `SCOPES_DISABLED=1` to re-enable gradually.
  - If flag off (enforcement active): evaluate scopes; else bypass but still populate context for logging.

### 7.2 Logging & Audit

Log structured JSON lines on denial including: `userId`, `orgId`, `projectId`, `requiredScopes[]`, `grantedScopes[]`, `orgRole`, `projectRole`, `reason`.

## 8. Permission Matrix (Detailed)

| Feature Area | Action                   | Required Level (Role or Scope)                | Notes                                                                            |
| ------------ | ------------------------ | --------------------------------------------- | -------------------------------------------------------------------------------- |
| Organization | View org metadata        | `org:read` OR implicit                        | Derived by any membership relationship.                                          |
| Organization | Update org metadata      | `org:write` (org_admin)                       |                                                                                  |
| Organization | Create project           | `org:project:create` (org_admin)              |                                                                                  |
| Organization | Delete project           | `org:project:delete` (org_admin)              | Hard delete / archive gating future.                                             |
| Organization | Invite org member        | `org:invite` (org_admin)                      |                                                                                  |
| Project      | View project metadata    | `project:read`                                | Included in any project role.                                                    |
| Project      | Update project settings  | `project:write` (project_admin or org_admin)  |                                                                                  |
| Project      | Invite project member    | `project:invite` (project_admin or org_admin) |                                                                                  |
| Documents    | List/search              | `docs:read`                                   | project scope context required.                                                  |
| Documents    | Upload / ingest          | `docs:write`                                  | Initially grant to project_admin (and optionally project_user later via config). |
| Documents    | Delete                   | `docs:delete`                                 | Restrict to project_admin / org_admin.                                           |
| Chat         | Use chat                 | `chat:use`                                    | All roles inside project.                                                        |
| Chat         | Moderate / delete others | `chat:admin`                                  | project_admin or org_admin.                                                      |

## 9. API Design Conventions

### 9.1 Headers

| Header          | Purpose                                                                                                            |
| --------------- | ------------------------------------------------------------------------------------------------------------------ |
| `Authorization` | Bearer token (Zitadel JWT).                                                                                        |
| `X-Project-ID`  | Active project context (UUID) for project-scoped endpoints. Organization ID is automatically derived from project. |

> **Deprecated**: `X-Org-ID` header is no longer used or required (removed 2025-11-18).

### 9.2 OpenAPI Metadata

Each protected operation includes (examples):

```yaml
paths:
  /projects:
    post:
      x-required-scopes: [org:project:create]
      x-tenant-scope: organization
  /documents:
    post:
      x-required-scopes: [docs:write]
      x-tenant-scope: project
```

Add `x-required-role` only when role level semantics differ from pure scope mapping (rare for v0.1).

## 10. JWT / Claims Strategy

Two phases:

1. **Server-Side Membership Resolution (v0.1)** – JWT contains only `sub`, `email`. Roles/scopes resolved on each request (with short-lived caching layer, e.g. in-memory LRU keyed by `(userId, orgId, projectId)` for 30s).
2. **Embedded Claims Optimization (v1.x)** – Custom claim `tenant_roles` summarizing memberships:
   ```json
   {
     "tenant_roles": {
       "orgs": { "<orgId>": { "role": "org_admin" } },
       "projects": {
         "<projectId>": { "role": "project_admin", "orgId": "<orgId>" }
       }
     }
   }
   ```
   Server still validates against DB version (ETag or `updated_at` watermark) if present; fallback to DB if mismatch.

Authoritative Source Principle: The server NEVER trusts scope claims provided by the client (even if future JWTs embed them). Effective scopes are always recomputed (or at minimum validated) server‑side from the role→scope mapping to prevent privilege escalation via token tampering or outdated cached claims.

## 11. Caching & Performance

| Layer                   | Strategy                                | TTL     |
| ----------------------- | --------------------------------------- | ------- |
| Membership query        | Single batched join (org + project)     | 30s LRU |
| Role→Scope expansion    | Static in-process constant              | N/A     |
| Invite token validation | HMAC/JWT signature; DB fetch for status | N/A     |

Cache invalidation: clear LRU entries on membership mutation endpoints (CRUD invites, accept, role change).

## 12. Error Semantics

| HTTP | Code              | Meaning                                                                               |
| ---- | ----------------- | ------------------------------------------------------------------------------------- |
| 401  | `unauthorized`    | Missing/invalid token.                                                                |
| 403  | `forbidden`       | Authenticated but lacks required scope/role OR context mismatch (project not in org). |
| 404  | `not_found`       | Resource not visible to caller (avoid leaking existence).                             |
| 409  | `invite_conflict` | Invite already accepted / conflicting role update.                                    |

Error envelope (standardize):

```json
{
  "error": "forbidden",
  "message": "Missing scope docs:write",
  "required": ["docs:write"],
  "granted": ["docs:read", "chat:use"]
}
```

## 13. Testing Strategy

Add / extend E2E suites (see `17-server-e2e-testing.md`):

- `security.roles-matrix.e2e.spec.ts` – Matrix of key endpoints vs roles (generate programmatically from mapping constant, skip future scopes).
- `invites.lifecycle.e2e.spec.ts` – create → accept → idempotent re-accept → revoke.
- `org.visibility.e2e.spec.ts` – project_user can read org, cannot modify.
- `project.membership-boundary.e2e.spec.ts` – project_user of Project A cannot access Project B.
- `documents.authorization.e2e.spec.ts` – docs write blocked for project_user if not mapped.
- `chat.authorization.e2e.spec.ts` – moderation actions restricted.

Unit tests:

- Permission service: role→scope expansion, implicit org read logic.
- Guard: required scopes satisfied / missing; project/org context mismatch.

### 13.1 Detailed E2E Scenario Plan

#### File: `security.roles-matrix.e2e.spec.ts`

Generate table of (endpoint, required scopes) vs roles. For each role context (org_admin, project_admin, project_user) execute representative operations:
| Endpoint | Method | Context Headers | Expected org_admin | Expected project_admin | Expected project_user |
|----------|--------|-----------------|--------------------|------------------------|-----------------------|
| /orgs (create) | POST | (none) | 201 | 403 | 403 |
| /projects (create) | POST | X-Project-ID | 201 | 403 | 403 |
| /projects/:id (update) | PATCH | X-Project-ID | 200 | 200 | 403 |
| /projects/:id/invite | POST | X-Project-ID | 201 | 201 | 403 |
| /documents | GET | X-Project-ID | 200 | 200 | 200 |
| /documents | POST | X-Project-ID | 201 | 201 | 403 (v0.1 rule) |
| /documents/:id | DELETE | X-Project-ID | 204 | 204 | 403 |
| /chat/conversations | POST | X-Project-ID | 201 | 201 | 201 |
| /chat/conversations/:id/moderate | POST | X-Project-ID | 200 | 200 | 403 |

> **Note**: `X-Org-ID` header removed 2025-11-18. Organization ID is derived from Project ID automatically.

Implementation notes:

1. Seed one org + two projects; grant roles to three test users (one per role set).
2. Use helper to impersonate each user (JWT mint or fallback token) and iterate endpoints.
3. Fail fast: collect failures and print diff of expected vs actual.

#### File: `invites.lifecycle.e2e.spec.ts`

Scenarios:

1. Org admin creates org-level invite (role org_admin) → 201.
2. Email link acceptance (simulate by calling accept endpoint with token) → membership row created.
3. Re-accept same token → 200 idempotent (no duplicate row).
4. Create project invite (role project_user) by project_admin → accept → project_membership row.
5. Revoke pending invite → status becomes revoked; acceptance after revoke → 410/403 (decide final code; spec uses 403 or specialized 409; choose 403 with `forbidden`).
6. Expired invite token (manually adjust expires_at) → 410/403.

#### File: `org.visibility.e2e.spec.ts`

1. User with only project_user membership queries `/orgs/:id` → 200 (limited fields).
2. Same user attempts PATCH `/orgs/:id` → 403.
3. Same user lists sibling project they DO have membership in → 200; project they lack membership in → 404 (not leak).

#### File: `project.membership-boundary.e2e.spec.ts`

1. User project_user in Project A attempts to read document in Project B → 404.
2. User project_admin in Project A attempts to invite member to Project B → 403.

#### File: `documents.authorization.e2e.spec.ts`

1. project_user attempts POST /documents (ingest) → 403.
2. project_admin POST /documents → 201; org_admin POST /documents → 201.
3. project_user GET /documents → 200 with only docs from their project.
4. project_admin DELETE /documents/:id → 204; project_user DELETE same id → 403.

#### File: `chat.authorization.e2e.spec.ts`

1. All roles create conversation → 201.
2. project_user tries moderation endpoint (rename/delete another user’s conversation) → 403.
3. project_admin moderates conversation → 200.
4. org_admin moderates any project conversation (with proper headers) → 200.

#### File: `auto.assignment.e2e.spec.ts`

1. User creates new organization → verify `organization_memberships` row (org_admin) exists.
2. Same user creates new project in that org → verify `project_memberships` row (project_admin).
3. org_admin creates project for another existing org_admin (same user) → still creates project_admin membership (assert presence).
4. Attempt project creation by project_admin (non org_admin) → 403.

### 13.2 Unit Test Matrix

Permission service unit tests enumerating each role’s expanded scopes; ensure absence/presence matches table in §4.1. Guard tests simulate missing scope vs SCOPES_DISABLED bypass.

## 14. Migration Plan

| Step | Action                                                           | Notes                                             |
| ---- | ---------------------------------------------------------------- | ------------------------------------------------- |
| 1    | Introduce tables + membership loader w/o enforcement             | Populate data via seeds.                          |
| 2    | Implement role→scope constant + logging only (dry run).          | Compare required vs granted in logs.              |
| 3    | Add feature flag `SCOPES_DISABLED`; default on (permissive).     | Safe deploy.                                      |
| 4    | Enable enforcement in staging (flag off) + run E2E matrix.       | Fix gaps.                                         |
| 5    | Enable enforcement in production.                                | Monitor deny rate & logs.                         |
| 6    | Add additional roles/scopes (docs:write separation, chat:admin). | Backward compatible: old roles auto-map superset. |

Backward compatibility: existing tokens unaffected; absence of scope claims triggers server-side resolution.

## 15. Observability & Metrics

Emit counters (Prometheus):

- `authz_denied_total{scope="docs:write"}`
- `authz_invite_created_total{level="project"}`
- `authz_invite_accepted_total{level="org"}`
- `authz_membership_cache_hit_total` / `_miss_total`

Structured logs enable correlating denial spikes with deployments.

## 16. Security Considerations

| Risk                                                    | Mitigation                                                                                                |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Horizontal privilege escalation via crafted project IDs | Server derives organization ID from project ID via database lookup. Client cannot manipulate org context. |
| Stale cached membership after revocation                | Explicit cache invalidation on mutation; short TTL.                                                       |
| Stale cached org→project mapping                        | Cache is invalidated when projects are moved/deleted. Call `clearOrgIdCache()` explicitly.                |
| Invite token leakage                                    | Short expiry (e.g. 7 days) + single-use mark accepted.                                                    |
| Scope oversubscription in future dynamic roles          | Maintain allowlist for known scopes; reject unknown.                                                      |
| Orphan project user after org deletion                  | ON DELETE CASCADE ensures membership rows removed.                                                        |

## 17. Open Questions

1. Do we require a separate `org_viewer` sooner (read-only explicit org membership)? – Defer until needed by UI.
2. Should project_user initially be allowed to upload documents? – Start conservative (`docs:write` only for project_admin) and add config toggle if product feedback indicates need.
3. Embed limited memberships in JWT now vs later? – Defer until performance profiling indicates DB lookup is a bottleneck.

## 18. Appendices

### 18.1 Role→Scope Mapping Constant (TypeScript Sketch)

```ts
export const ROLE_SCOPE_MAP: Record<string, string[]> = {
  org_admin: [
    'org:read',
    'org:write',
    'org:project:create',
    'org:project:delete',
    'org:invite',
    'project:read',
    'project:write',
    'project:invite',
    'docs:read',
    'docs:write',
    'docs:delete',
    'chat:use',
    'chat:admin',
  ],
  project_admin: [
    'org:read', // implicit
    'project:read',
    'project:write',
    'project:invite',
    'docs:read',
    'docs:write',
    'docs:delete',
    'chat:use',
    'chat:admin',
  ],
  project_user: [
    'org:read', // implicit
    'project:read',
    'docs:read',
    'chat:use',
  ],
};
```

### 18.2 Authorization Guard Pseudocode

```ts
function authorize(ctx: RequestAuthContext, required: string[]): void {
  if (process.env.SCOPES_DISABLED === '1') return; // temporary bypass
  for (const scope of required) {
    if (!ctx.scopes.has(scope)) {
      throw new ForbiddenError({ scope, granted: Array.from(ctx.scopes) });
    }
  }
}
```

---

## 19. Superadmin Role

The superadmin role provides system-wide administrative access for platform operators, enabling cross-tenant support, debugging, and management capabilities.

### 19.1 Purpose & Scope

Superadmins are trusted platform operators who need visibility and access across all organizations and projects for:

- **Support operations**: Investigating user-reported issues across any tenant
- **Platform administration**: Managing system-wide settings and monitoring
- **Impersonation**: Viewing the system as any user for debugging (View-As feature)
- **Email monitoring**: Reviewing sent emails and debugging delivery issues

**Key distinction from org_admin**: While `org_admin` has full control within a single organization, `superadmin` has read access across ALL organizations and projects in the system.

### 19.2 Role Definition

| Role       | Level  | Summary                                                                                                                                                                                           |
| ---------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| superadmin | System | Cross-tenant read access to all organizations, projects, users, and email jobs. Can impersonate any user via View-As. Cannot modify tenant data directly (must use View-As for write operations). |

### 19.3 Data Model

```sql
CREATE TABLE core.superadmins (
  user_id UUID NOT NULL REFERENCES core.user_profiles(id) PRIMARY KEY,
  granted_by UUID REFERENCES core.user_profiles(id),  -- NULL if via CLI
  granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ,  -- NULL if active
  revoked_by UUID REFERENCES core.user_profiles(id),
  notes TEXT  -- Audit trail notes
);

-- Activity tracking (added to user_profiles)
ALTER TABLE core.user_profiles ADD COLUMN last_activity_at TIMESTAMPTZ;
```

A user is an active superadmin if they have a row in `core.superadmins` where `revoked_at IS NULL`.

### 19.4 Grant/Revoke Workflow

Superadmin grants are managed via CLI only (not via API) to ensure proper operational controls:

```bash
# List active superadmins
npx ts-node src/cli/superadmin.cli.ts --list

# Grant superadmin by email
npx ts-node src/cli/superadmin.cli.ts --grant --email admin@example.com --notes "Platform operator"

# Grant by user ID
npx ts-node src/cli/superadmin.cli.ts --grant --user-id <uuid>

# Revoke superadmin
npx ts-node src/cli/superadmin.cli.ts --revoke --email admin@example.com --notes "No longer needed"

# Dry run (preview without changes)
npx ts-node src/cli/superadmin.cli.ts --grant --email admin@example.com --dry-run
```

All grants and revocations are recorded with timestamps and optional notes for audit purposes.

### 19.5 Superadmin Capabilities (Scopes)

| Scope               | Description                                       |
| ------------------- | ------------------------------------------------- |
| superadmin:read     | Check superadmin status (`GET /superadmin/me`)    |
| superadmin:users    | List all users across system                      |
| superadmin:orgs     | List all organizations                            |
| superadmin:projects | List all projects                                 |
| superadmin:emails   | View email job history and previews               |
| superadmin:view-as  | Impersonate any user via X-View-As-User-ID header |

### 19.6 API Endpoints

All endpoints require Bearer token authentication and active superadmin status.

| Endpoint                                  | Method | Description                                    |
| ----------------------------------------- | ------ | ---------------------------------------------- |
| `/superadmin/me`                          | GET    | Check if current user is superadmin            |
| `/superadmin/users`                       | GET    | List users with pagination, search, org filter |
| `/superadmin/organizations`               | GET    | List orgs with member/project counts           |
| `/superadmin/projects`                    | GET    | List projects with document counts             |
| `/superadmin/email-jobs`                  | GET    | List email jobs with status/date filters       |
| `/superadmin/email-jobs/:id/preview`      | GET    | Render email template as HTML                  |
| `/superadmin/email-jobs/:id/preview-json` | GET    | Get email preview with metadata                |

### 19.7 View-As Impersonation

Superadmins can impersonate any user by setting the `X-View-As-User-ID` header with the target user's UUID. When active:

1. **Request processing**: The `ViewAsMiddleware` validates the header and loads the target user
2. **Context switching**: Subsequent authorization checks use the target user's permissions
3. **Audit logging**: Both the superadmin ID and impersonated user ID are recorded in audit logs
4. **Response metadata**: Responses include `_viewAs` metadata indicating impersonation is active

```
Request:
  Authorization: Bearer <superadmin-token>
  X-View-As-User-ID: <target-user-uuid>

Response includes:
  _viewAs: {
    superadminId: "<superadmin-uuid>",
    viewingAs: "<target-user-uuid>"
  }
```

### 19.8 Activity Tracking

The `ActivityTrackingMiddleware` updates `last_activity_at` on authenticated requests:

- Debounced updates (60-second TTL) to reduce database writes
- Tracks superadmin's own activity, not impersonated user activity
- Used in superadmin panel to show user last-seen information

### 19.9 Enforcement Architecture

```ts
// SuperadminGuard - checks superadmin status
@Injectable()
export class SuperadminGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const userId = request.user?.id;
    if (!userId) return false;
    return this.superadminService.isSuperadmin(userId);
  }
}

// Usage with decorator
@Superadmin()
@UseGuards(AuthGuard, SuperadminGuard)
@Get('users')
async listUsers() { ... }
```

### 19.10 Security Considerations

| Risk                                              | Mitigation                                                   |
| ------------------------------------------------- | ------------------------------------------------------------ |
| Privilege escalation via forged X-View-As-User-ID | Header only processed if caller is verified superadmin       |
| Stale superadmin status after revocation          | 60-second cache TTL; cache cleared on revoke                 |
| Audit gap during impersonation                    | Both superadmin ID and target ID logged on all actions       |
| Unauthorized CLI access                           | CLI requires database access; deploy in secured environments |
| View-As used for unauthorized modifications       | All View-As actions logged with superadmin identity          |

### 19.11 Frontend Integration

The admin UI provides:

- **Superadmin menu item**: Only visible when `GET /superadmin/me` returns `isSuperadmin: true`
- **ViewAsBanner component**: Persistent banner showing impersonation status with "Exit" button
- **ViewAsContext**: React context managing impersonation state and API header injection

---

End of Spec.
