# Change: Add Zitadel Auth and Multi-Tenant User/Org Model

## Why

strategy-server has an auth scaffold that currently hard-401s in production. The
existing spec targets GitHub OAuth — but the right identity provider is Zitadel,
which is already running for emergent-memory. Using the same Zitadel instance means
users who have access to emergent-memory automatically have access to strategy-server
with the same credentials and no second sign-up.

In addition, the current data model has no concept of users, organisations, or
membership — `list_workspaces` returns everything, `created_by` is an unlinked UUID,
and tenant isolation does not exist. This must be fixed before any real production
deployment.

## What Changes

### Authentication — replace GitHub OAuth with Zitadel OIDC introspection

- Drop the GitHub OAuth env vars (`EPF_OAUTH_CLIENT_ID`, `EPF_OAUTH_CLIENT_SECRET`,
  `EPF_SESSION_SECRET`) from config.
- Add Zitadel env vars: `ZITADEL_ISSUER`, `ZITADEL_CLIENT_JWT` (or
  `ZITADEL_CLIENT_JWT_PATH`), `ZITADEL_INTROSPECT_CACHE_TTL`,
  `DISABLE_ZITADEL_INTROSPECTION`, `ZITADEL_DEBUG_TOKEN`.
- Add `github.com/zitadel/oidc/v3` to `go.mod`.
- Implement `internal/auth/` package with:
  - Zitadel introspection client (remote introspection endpoint, JWT-profile service
    account auth, circuit breaker, request coalescing).
  - PostgreSQL introspection cache (`strategy.auth_introspection_cache`) with TTL.
  - `ZITADEL_DEBUG_TOKEN` bypass for integration tests (non-prod only).
- Replace the `TODO(Phase 2)` stub in `AuthMiddleware` with real token validation.
- Update `web.User` struct: replace `GithubLogin string` with `Sub string` (Zitadel
  subject ID) and add `Email string`.

### Users — persist identity on first auth

- New migration: `strategy.users(id, zitadel_user_id, email, created_at, updated_at,
  deleted_at)`.
- `EnsureUser(ctx, sub, email)` — upsert on first successful introspection; soft-delete
  reactivation on re-auth of a previously deleted user.
- `web.User.ID` becomes a FK to `strategy.users.id` (previously an unlinked UUID).
- `created_by` columns on `workspaces`, `strategy_instances`, `strategy_mutations` gain
  FK constraints to `strategy.users.id`.

### Orgs — top-level tenant containers

- New migration: `strategy.orgs(id, name, created_at, updated_at, deleted_at)`.
- New migration: `strategy.org_memberships(id, org_id, user_id, role, created_at)` with
  `UNIQUE(org_id, user_id)`.
- New migration: `strategy.org_invitations(id, org_id, invited_email, role, invited_by,
  created_at, accepted_at)` with `UNIQUE(org_id, invited_email)`.
- Roles: `org_admin` (create workspaces, manage members, all writes) and `org_viewer`
  (read-only access to workspaces and instances).
- `workspaces` table gains `org_id FK → strategy.orgs.id` (nullable for migration
  compatibility; required for new workspaces).
- `list_workspaces` MCP tool filters by `org_memberships.user_id = caller`.

### MCP tools — new org and membership management tools

- `create_org(name)` — creates an org, adds caller as `org_admin`.
- `list_orgs()` — lists orgs the caller is a member of.
- `invite_member(org_id, email, role)` — if the email belongs to an existing user,
  inserts (or updates) a membership row immediately. If the user does not yet exist,
  inserts a pending invitation row; when that user first authenticates, the invitation
  is automatically accepted and a membership row is created.
- `remove_member(org_id, user_id)` — removes membership; prevents removing the last
  `org_admin`.
- `list_members(org_id)` — lists org members with roles, plus pending invitations.

### Deployment modes

Three modes, determined by env var `STRATEGY_DB_MODE`:

| Mode | Value | Description |
|------|-------|-------------|
| Shared | `shared` | Connects to the emergent-memory Postgres DB. Reads `core.user_profiles` and `kb.orgs`/`kb.organization_memberships` directly from the shared schema. Does not maintain its own users/org tables — identity and org membership are owned by emergent-memory. |
| Standalone | `standalone` | Own Postgres DB. Manages its own `strategy.users`, `strategy.orgs`, `strategy.org_memberships`. Supports any OIDC provider (not just Zitadel). |
| Dev | (implicit: `AUTH_ENABLED=false`) | DevUser pass-through. Single implicit org. No Zitadel config required. |

In `shared` mode:
- `strategy.users` and `strategy.orgs` migrations are skipped; the server reads
  `core.user_profiles` (keyed by `zitadel_user_id`) and `kb.orgs` /
  `kb.organization_memberships` from the shared DB.
- `strategy_instances` gains an `org_id` FK that points to `kb.orgs.id` (not
  `strategy.orgs.id`).
- A user authenticated via Zitadel is automatically trusted if they exist in
  `core.user_profiles` — no separate onboarding step.

In `standalone` mode:
- All tables live in the `strategy` schema on the dedicated DB.
- First authenticated user to hit a fresh instance is auto-promoted to `org_admin` of
  the auto-created default org (single-admin bootstrap).

### Tenant isolation — all existing queries scoped

- `list_workspaces` — add `INNER JOIN strategy.org_memberships` filter.
- `list_instances` — filter by workspace, which is already scoped to the caller's org.
- `list_mutations`, `get_artifact`, `commit_batch` — assert workspace belongs to caller's
  accessible orgs before executing.
- Existing `created_by` UUID columns backfilled to `strategy.users.id` via a migration
  that matches on the DevUser UUID (`00000000-0000-0000-0000-000000000001`).

## Impact

- **Affected specs:** `strategy-auth` (replace GitHub OAuth), `strategy-core` (users,
  orgs, memberships, tenant isolation)
- **Affected code:**
  - `config/config.go` — swap GitHub OAuth vars for Zitadel vars; add
    `STRATEGY_DB_MODE`
  - `internal/web/middleware.go` — implement real auth path; update `User` struct
  - `internal/auth/` — new package (introspection client, cache, debug token)
  - `internal/database/migrations/` — new migrations: `005_users.sql`,
    `006_orgs.sql`, `007_org_memberships.sql`, `008_org_invitations.sql`,
    `009_auth_cache.sql`, `010_add_org_id_to_workspaces.sql`, `011_created_by_fk.sql`
  - `domain/user/` — new domain service (`EnsureUser`, `GetByID`, `GetBySub`)
  - `domain/org/` — new domain service (`Create`, `List`, `AddMember`,
    `RemoveMember`, `ListMembers`)
  - `internal/mcpserver/` — 5 new org tools; update `list_workspaces`,
    `list_instances` filters
- **No changes to `apps/epf-cli/`** (frozen)
- **No breaking changes to existing MCP tool signatures** — only filtered results
- **BREAKING** (internal): `web.User.GithubLogin` removed; `web.User.Sub` added.
  Callers of `UserFromContext` that read `GithubLogin` must be updated.
