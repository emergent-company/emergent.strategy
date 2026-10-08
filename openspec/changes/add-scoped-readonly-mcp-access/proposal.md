# Change: Scoped Read-Only MCP Access Tokens

## Why

We want to give an external user a read-only MCP connection to a cloud-hosted
strategy-server, scoped to exactly one strategy instance. None of the four things
that requires exists today.

**1. There is no long-lived token.** The only inbound auth mechanism is Zitadel
OIDC bearer-token introspection (`internal/auth/introspection.go:83`). A grep of
all 42 migrations for `api_key|personal_access_token` returns nothing. An external
MCP client would need an interactive Zitadel login and would hold a token with
that IdP's expiry — not viable for an unattended connection.

**2. Read-only does not exist in any form.** `org_memberships.role` allows
`org_admin | org_viewer` (`007_org_memberships.sql`), but the role value is
discarded at the point it matters. `assertWorkspaceAccess` reads membership and
throws the role away:

```go
// internal/mcpserver/access.go:50
isMember, _, err := svc.Org.IsMember(ctx, orgID, u.ID)
```

Every role comparison in `internal/mcpserver/` is a `callerRole != "org_admin"`
check in `register_org_tools.go` (lines 77, 117, 176, 209), all guarding *org
administration*. The shared write path `stageArtifact` (`server.go:2194`) parses
`instance_id` and calls `svc.Stage` with no access check and no role check. An
`org_viewer` can call `create_feature`, `commit_batch`, and `delete_instance`
today.

**3. Scoping is org-level.** The grant model is `user → org_memberships → org →
workspace → instance`. "One specific instance" is not expressible.

**4. Tenant isolation is incomplete, independent of this goal.** There are 158
`mcp.NewTool(` registrations and 41 `assertInstanceAccess`/`assertWorkspaceAccess`
call sites. Confirmed by reading handlers: `get_product_vision` (`server.go:577`),
`get_personas` (`:592`), `get_roadmap` (`:622`), `list_features` (`:641`),
`search_strategy` (`:750`) and others take `instance_id` straight from tool
arguments and return data with no membership check. Any authenticated user holding
any instance UUID can read another tenant's strategy. Four whole files
(`register_version_tools.go`, `register_workpackage_tools.go`,
`register_pack_tools.go`, `register_phase2c_tools.go` — 33 tools) have zero
access checks.

Two further hazards make a naive deployment worse than it looks:

- **`AUTH_ENABLED` defaults to `false`** (`config/config.go:72`). In that mode
  every request is injected as a hardcoded `DevUser` (`middleware.go:66-72`),
  while `seedDevIdentity` (`cmd_serve.go:345`) calls
  `EnsureDevMembershipForAllOrgs`, making that user `org_admin` of *every org in
  the database* (`domain/org/service.go:461`). Deploying as-configured yields an
  unauthenticated, full-admin, all-tenant MCP endpoint.
- **The tool filter is not a security boundary.** Its own package doc says so
  (`tool_filter.go:10-16`): the filter shapes `tools/list` only, and every tool
  stays invocable via `tools/call`. `autoActivate` means calling a hidden tool
  *activates* its category. Delivering "read-only" via `set_tool_filter` would be
  the appearance of restriction with none of the substance.

## What Changes

- **Access token subsystem** — new `access_tokens` table storing Argon2id hashes
  (never plaintext), with prefix lookup, expiry, revocation, and `last_used_at`.
  Tokens are minted once and displayed once.
- **Instance-scoped grants** — new `access_token_grants` table binding a token to
  one instance with a permission of `read` or `write`. This makes "one specific
  instance, read-only" expressible for the first time.
- **Token auth path in `AuthMiddleware`** — a bearer token with the `est_` prefix
  is resolved against `access_tokens` instead of Zitadel; the resulting principal
  carries its grants in request context.
- **`Principal` abstraction** — replaces the bare `*web.User` in context with a
  type carrying identity *and* capability, so handlers ask "may this caller write
  to this instance?" rather than "who is this?".
- **Write gate as `ToolHandlerMiddleware`** — a single chokepoint. mcp-go v0.54.1
  exposes `WithToolHandlerMiddleware` (`server/server.go:297`) and the streamable
  HTTP transport propagates `r.Context()` (`streamable_http.go:346`), so the
  Echo-set principal is visible to every `tools/call`. The gate classifies each
  tool read/write from a single registry and denies writes to read-only
  principals. Critically this is **deny-by-default**: a tool absent from the
  registry is treated as a write.
- **Close the read-side isolation gap** — `assertInstanceAccess` added to the
  ~117 handlers currently missing it, enforced thereafter by a test that fails
  when a new `instance_id` tool ships without a check.
- **Fail-closed access helpers** — `access.go:37-43` currently returns `nil`
  (allow) on nil-service or nil-user. Inverted to deny, with dev mode handled by
  an explicit principal rather than an absent one.
- **`ZITADEL_DEBUG_TOKEN` environment-gated** — refuse to honour it, and refuse
  to boot, when the server is in production mode.
- **Production safety check at startup** — refuse to boot with
  `AUTH_ENABLED=false` when `ENV=production`.
- **Token management surface** — MCP tools and CLI for mint/list/revoke,
  themselves requiring `org_admin`.
- **Cloud deployment** — Cloud Run workflow for strategy-server (none exists;
  `deploy.yaml` deploys epf-cli).

Explicitly out of scope: per-artifact or field-level permissions; a public token
self-service UI; replacing Zitadel for interactive users; rate limiting (noted as
a follow-up).

## Impact

- Affected specs: `strategy-auth` (token type, grants, fail-closed, prod guards),
  `strategy-mcp` (write gate, tenant isolation on reads)
- Affected code:
  - `internal/database/migrations/043_access_tokens.sql` — new tables
  - `internal/domain/models.go` — `AccessToken`, `AccessTokenGrant`, `Principal`
  - `domain/accesstoken/` — new package: mint, hash, verify, revoke, resolve
  - `internal/web/middleware.go` — token branch in `AuthMiddleware`; principal in context
  - `internal/web/context.go` — `PrincipalFromContext`, `ContextWithPrincipal`
  - `internal/mcpserver/access.go` — fail-closed; `assertInstanceWrite`
  - `internal/mcpserver/write_gate.go` — new: tool classification + middleware
  - `internal/mcpserver/server.go` — register middleware; add missing checks
  - `internal/mcpserver/register_{version,workpackage,pack,phase2c}_tools.go` — add checks
  - `internal/mcpserver/register_token_tools.go` — new: mint/list/revoke
  - `internal/auth/introspection.go` — gate `DebugToken` on environment
  - `config/config.go` — `Environment`; production validation
  - `cmd_serve.go` — startup safety check; wire token service
  - `.github/workflows/strategy-server-deploy.yaml` — new

**Breaking changes.** Two, both deliberate:

1. `assertWorkspaceAccess` inverting to fail-closed will deny calls that
   previously succeeded wherever the org service is nil or no user is in context.
   Dev mode is preserved by injecting an explicit full-capability dev principal.
2. Adding `assertInstanceAccess` to ~117 handlers will deny cross-tenant reads
   that currently succeed. That is the point, but any existing integration
   relying on the gap will break.

**Security note.** Gap 4 (cross-tenant reads) is exploitable today, on any
deployed instance, regardless of whether this change ships. Task section 6 is
severable and should be landed first if this proposal stalls.

## Follow-on: `deploy-strategy-server`

Implementing the production guards in §8 required knowing what production
looks like, and surfaced that **strategy-server has no deployment anywhere** —
`deploy.yaml` ships `apps/epf-cli`, `strategy-server.yaml` is CI only.

The deployment work originally scoped as §9, and the live end-to-end
verification in §10.1–10.4 and §10.6, are therefore carried by the
`deploy-strategy-server` change. They are infrastructure, not application
behaviour, and they have open questions (GCP project, domain, shared vs
standalone Postgres, production Zitadel tenant) that outlive this change.

The consequence worth stating plainly: the feature this proposal delivers —
a read-only MCP connection for an external party — is merged and tested but
**not yet reachable by anyone outside a developer laptop**. It becomes usable
when `deploy-strategy-server` lands.
