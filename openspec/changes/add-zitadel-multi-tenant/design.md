# Design: Zitadel Auth and Multi-Tenant User/Org Model

## Context

strategy-server needs production-grade authentication and tenant isolation. The
emergent-memory server (`apps/server-go`) has already solved this problem using
Zitadel OIDC introspection with a PostgreSQL introspection cache. We port the same
approach rather than reinvent it.

Three deployment targets must work from a single binary:
1. **Hosted** — shared Postgres DB with emergent-memory; shared Zitadel instance.
2. **Self-hosted** — dedicated Postgres DB; any OIDC-compliant provider.
3. **Local dev** — no auth, no Zitadel, single implicit org.

## Goals / Non-Goals

**Goals:**
- Real production authentication using Zitadel (or any OIDC provider) in ≤ 2 new env vars for the common case.
- Users who exist in emergent-memory automatically work in strategy-server (hosted mode).
- Tenant isolation: a caller can only see orgs/workspaces/instances they are a member of.
- Local dev stays zero-config (`AUTH_ENABLED=false`).

**Non-Goals:**
- Implementing a full OIDC Authorization Server (strategy-server is a resource server only).
- Role-based access control within an instance (future work — Phase 2).
- GitHub OAuth (superseded).
- SSO login UI — clients obtain tokens from Zitadel directly; strategy-server only validates them.

## Decisions

### Decision: Remote introspection, not local JWT verification

Local JWKS verification avoids a network round-trip but requires fetching and caching
the provider's JWKS endpoint, handling key rotation, and verifying all claims (exp,
aud, iss) correctly. The emergent-memory server uses remote introspection and that
code is already proven in production. Remote introspection is simpler, always up-to-date
on revocations, and well-supported by `github.com/zitadel/oidc/v3/pkg/client/rs`.

We adopt the same approach: a service account (JWT-profile auth) calls the introspection
endpoint; results are cached in Postgres for `ZITADEL_INTROSPECT_CACHE_TTL` (default
5m) to avoid per-request round-trips.

**Alternative considered:** Local JWKS. Rejected: more code, JWKS rotation handling,
and no meaningful latency win given the Postgres cache.

### Decision: `STRATEGY_DB_MODE` flag to select schema source

In hosted mode the user/org identity is owned by emergent-memory's `core.*`/`kb.*`
tables. In standalone mode strategy-server owns its own `strategy.*` tables. Rather than
auto-detecting at runtime (fragile), the operator sets `STRATEGY_DB_MODE=shared|standalone`.
When unset, the default is `standalone`.

In `shared` mode:
- Migrations `005_users` and `006_orgs`/`007_org_memberships` are skipped at startup.
- `UserService` and `OrgService` query `core.user_profiles` and
  `kb.orgs`/`kb.organization_memberships` directly via `*bun.DB`.
- `strategy_instances.org_id` references `kb.orgs.id`.

In `standalone` mode:
- All migrations run; services query from `strategy.*`.
- `strategy_instances.org_id` references `strategy.orgs.id`.

Implementation: **no repository interfaces.** The constitution prohibits repository
abstraction layers (§4: "Domain packages query the database directly via `*bun.DB` — no
repository abstraction layer"). Instead, `UserService` and `OrgService` accept a
`dbMode string` at construction time and use it to select the correct schema-qualified
table names in their SQL queries. In `runServer()`, `cfg.DBMode` is read once and passed
to service constructors — no interface dispatch, no separate implementations.

```go
type UserService struct {
    db     *bun.DB
    schema string // "strategy" (standalone) or "core" (shared)
}

func NewUserService(db *bun.DB, dbMode string) *UserService {
    schema := "strategy"
    if dbMode == "shared" {
        schema = "core"
    }
    return &UserService{db: db, schema: schema}
}
```

**Alternative considered:** Repository interfaces with `StandaloneUserRepo` /
`SharedUserRepo` implementations. Rejected: violates the constitution's explicit
prohibition on repository abstraction layers. The constitution is clear: indirection
without evidence of need is complexity debt.

**Alternative considered:** Always maintain strategy-side mirror tables and sync from
emergent-memory via DB triggers or a CDC stream. Rejected: adds operational complexity
(trigger management, sync lag) for no gain — in shared mode we already have a single DB
connection and can read the source tables directly.

### Decision: `strategy.auth_introspection_cache` — own cache table, not shared

Even in shared mode, strategy-server uses its own cache table in the `strategy` schema
rather than reading emergent-memory's `kb.auth_introspection_cache`. Reason: cache TTL
configuration may differ; sharing a cache table creates a cross-service write dependency.
The cache is cheap (one row per active token) and writing it is idempotent.

Schema:
```sql
CREATE TABLE strategy.auth_introspection_cache (
    token_hash  text PRIMARY KEY,           -- SHA-512 of bearer token
    user_sub    text NOT NULL,
    email       text NOT NULL,
    scopes      text NOT NULL DEFAULT '',
    active      boolean NOT NULL,
    expires_at  timestamptz NOT NULL,
    cached_at   timestamptz NOT NULL DEFAULT now()
);
```

### Decision: EnsureUser is called on every authenticated request (with cache)

Rather than a one-time registration flow, `EnsureUser(sub, email)` runs after every
successful introspection. It is a single `INSERT ... ON CONFLICT (zitadel_user_id)
DO UPDATE SET email = EXCLUDED.email, updated_at = now()` — cheap and keeps email
addresses current. In shared mode, this is a no-op (we read the user from
`core.user_profiles` without writing it).

### Decision: Org bootstrap for standalone mode

On a fresh standalone deployment, there are no orgs and no members. The first
authenticated user gets an auto-created default org (`"Default Organisation"`) and is
set as `org_admin`. This avoids a chicken-and-egg problem where the org management MCP
tools require auth, but you need an org to do anything useful.

For self-hosted deployments with a team, the org_admin then uses `invite_member` to add
colleagues.

**Alternative considered:** Require the operator to create the org via a CLI command
before first use. Rejected: too much friction for the common single-admin self-hosted
case.

### Decision: `web.User` struct shape

```go
type User struct {
    ID    uuid.UUID  // strategy.users.id (standalone) or core.user_profiles.id (shared)
    Sub   string     // Zitadel subject ID (stable, never changes)
    Email string     // from introspection result
}
```

`GithubLogin` is removed. Nothing in the current codebase reads it for business logic
(it was a placeholder). The `Sub` field is the stable external identity key; `ID` is
the internal DB primary key used for FKs.

## Schema Overview

### Standalone mode — new tables in `strategy` schema

```
strategy.users
  id uuid PK
  zitadel_user_id text UNIQUE NOT NULL   ← Zitadel subject (works with any OIDC sub)
  email text NOT NULL
  created_at timestamptz
  updated_at timestamptz
  deleted_at timestamptz                  ← soft-delete; re-auth reactivates

strategy.orgs
  id uuid PK
  name text NOT NULL
  created_at timestamptz
  updated_at timestamptz
  deleted_at timestamptz

strategy.org_memberships
  id uuid PK
  org_id uuid FK → strategy.orgs.id
  user_id uuid FK → strategy.users.id
  role text NOT NULL                      ← 'org_admin' | 'org_viewer'
  created_at timestamptz
  UNIQUE(org_id, user_id)

strategy.auth_introspection_cache
  token_hash text PK                      ← SHA-512
  user_sub text NOT NULL
  email text NOT NULL
  scopes text NOT NULL DEFAULT ''
  active boolean NOT NULL
  expires_at timestamptz NOT NULL
  cached_at timestamptz NOT NULL
```

### Changes to existing tables

```
workspaces
  + org_id uuid FK → strategy.orgs.id   ← nullable; required for new workspaces
    (in shared mode, references kb.orgs.id)
  + created_by → FK → strategy.users.id (was unlinked UUID)
```

## Auth Request Flow

```
Request arrives
  └─ AuthMiddleware
       ├─ AUTH_ENABLED=false → inject DevUser, continue
       └─ AUTH_ENABLED=true
            ├─ Extract Bearer token from Authorization header
            ├─ Check strategy.auth_introspection_cache (SHA-512 hash)
            │    └─ HIT (not expired) → resolve User, continue
            └─ MISS → call Zitadel introspection endpoint
                  ├─ active=true → cache result → EnsureUser → resolve User, continue
                  └─ active=false → 401 Unauthorized
```

## Risks / Trade-offs

| Risk | Mitigation |
|------|-----------|
| Zitadel introspection endpoint down | Circuit breaker (30s cooldown); serve from cache during outage |
| Shared mode DB schema changes in emergent-memory break strategy-server | Keep `SharedUserRepo` / `SharedOrgRepo` thin read-only adapters; integration test with real schema |
| Org bootstrap race (two users hit a fresh instance simultaneously) | `INSERT INTO strategy.orgs ... ON CONFLICT DO NOTHING` + distributed lock via `pg_advisory_xact_lock` |
| `created_by` FK backfill fails for orphaned rows | Migration uses `ON CONFLICT DO NOTHING`; orphaned rows get `created_by = NULL` (column stays nullable) |

## Migration Plan

1. Migrations `005`–`009` run at server startup (goose `up`).
2. Migration `009` adds `org_id` to `workspaces` as nullable — no existing rows break.
3. `created_by` columns on `workspaces`, `strategy_instances`, `strategy_mutations` gain
   FK constraints via `ADD CONSTRAINT ... FOREIGN KEY ... NOT VALID` (validates only new
   rows; existing orphaned UUIDs are left as-is).
4. Rollback: goose `down` reverts migrations in reverse order. `009 down` drops the
   `org_id` column; `005–008 down` drop the new tables.

### Decision: `github_owner` on workspaces — keep as nullable, not removed

The current `workspaces` table has `github_owner TEXT NOT NULL` as a unique business key
and upsert target. The workspace creation MCP tool requires it. Rather than removing it
in this change (which would break the `create_workspace` import flow and `cmd_import.go`),
`github_owner` is made **nullable** in migration `010`. New workspaces created via
`create_workspace(name, org_id)` do not require a `github_owner`. The import command
(`create_workspace_from_github`) continues to accept it.

The `UNIQUE INDEX ON workspaces (github_owner) WHERE deleted_at IS NULL` is retained so
that GitHub-backed workspaces remain deduplicated. Non-GitHub workspaces have
`github_owner = NULL` (and the partial index does not enforce uniqueness on NULLs in
Postgres).

This is a deliberate deferral: fully decoupling workspaces from GitHub is a separate
change. This change only adds the `org_id` path.

### Decision: Error code ranges for new domains

Following the constitution (§6), new numeric error code ranges are assigned:

| Range | Domain |
|-------|--------|
| `120xxx` | User identity (`120001` = user not found, `120002` = user already exists) |
| `121xxx` | Organisation (`121001` = org not found, `121002` = org name conflict, `121003` = last admin protected, `121004` = access denied) |
| `122xxx` | Membership / invitation (`122001` = already a member, `122002` = invitation already exists) |

## Resolved Decisions

### `org_viewer` role ships at launch

Both `org_admin` and `org_viewer` roles are supported from day one. `org_admin` can
manage members, create workspaces, and perform all write operations within the org.
`org_viewer` has read-only access: can call `list_workspaces`, `list_instances`, and
read tools, but cannot create, modify, or delete resources.

### Pre-invitation — invitee does not need to exist yet

`invite_member(org_id, email, role)` supports pre-invitation. If no `strategy.users`
row exists for that email, a pending invitation row is inserted into a new
`strategy.org_invitations` table instead of `strategy.org_memberships`.

Additional table required:

```sql
strategy.org_invitations
  id uuid PK
  org_id uuid FK → strategy.orgs.id
  invited_email text NOT NULL
  role text NOT NULL
  invited_by uuid FK → strategy.users.id
  created_at timestamptz NOT NULL
  accepted_at timestamptz              -- NULL until the invitee first authenticates
  UNIQUE(org_id, invited_email)
```

When a user authenticates for the first time (`EnsureUser`), the server checks
`strategy.org_invitations WHERE invited_email = email AND accepted_at IS NULL`. Any
matching rows are converted: membership rows are inserted into
`strategy.org_memberships` and `accepted_at` is stamped on the invitation row.
Invitation acceptance is transactional and idempotent.

This means an org admin can invite a colleague before they have signed up. The
colleague joins their org automatically on first login — no extra step required.

**Impact on migrations:** Add migration `008b_org_invitations.sql` (or renumber as
`008` and push the auth cache to `009`). Add `invite_member` success scenario for
both the existing-user path and the pre-invitation path.
