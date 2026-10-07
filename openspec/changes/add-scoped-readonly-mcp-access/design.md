# Design: Scoped Read-Only MCP Access Tokens

## Context

The goal is narrow and concrete: hand an external user a string they paste into
an MCP client config, which grants read-only access to exactly one strategy
instance on a cloud-hosted strategy-server, and which we can revoke.

The current system cannot express any part of that. See `proposal.md` for the
evidence. This document records the design decisions and the reasoning behind
them, particularly where a cheaper option was rejected.

## Goals / Non-Goals

**Goals**

- A long-lived, revocable credential usable by an unattended MCP client.
- Authorisation scoped to a single instance, not an org.
- A read-only mode that is enforced at a chokepoint rather than per-handler.
- Fail-closed behaviour: new tools are denied until explicitly classified.
- Close the existing cross-tenant read gap.

**Non-Goals**

- Field- or artifact-level permissions. Instance granularity only.
- Replacing Zitadel for interactive human users.
- A self-service token UI. MCP tools and CLI are sufficient for the first cut.
- Rate limiting or quota. Noted as a follow-up; a read-only token still permits
  unbounded reads.

## Key Decision 1: Opaque tokens, not JWTs

**Decision.** Mint opaque random tokens of the form `est_<22-char-base62>`,
store an Argon2id hash, and resolve them against the database on each request.

**Why not JWTs.** A self-contained JWT carrying grants avoids a DB lookup, but
revocation then requires a blocklist — which is a DB lookup, so the saving
evaporates while the complexity remains. Worse, a leaked long-lived JWT stays
valid until expiry with no way to pull it back. For a credential we hand to
external parties, immediate revocation is the whole point.

**Why Argon2id, not SHA-256.** These are long-lived, high-value secrets. A
database leak should not yield usable credentials. The per-request cost is
mitigated by the lookup design below.

**Lookup design.** Argon2id is deliberately slow, so we cannot hash-and-compare
across all rows. The token carries an 8-character public prefix stored in
plaintext and indexed; lookup selects candidate rows by prefix, then runs one
Argon2id verification. Prefix collisions are possible and handled by iterating
candidates, but at 62^8 the expected candidate count is 1.

**Caching.** Resolution results are cached in memory for 60 seconds keyed by
token hash, bounding Argon2id cost under load. The TTL is the revocation
latency, which we accept and document. We reuse neither the
`auth_introspection_cache` table nor its stale-serving fallback — see Decision 5.

## Key Decision 2: `ToolHandlerMiddleware` as the write gate

**Decision.** Enforce read/write at a single mcp-go tool-handler middleware
rather than adding a role check to each of 158 handlers.

**Verified feasible.** Two facts were checked against the vendored dependency
rather than assumed:

- `WithToolHandlerMiddleware` exists in mcp-go v0.54.1 at `server/server.go:297`,
  wrapping the `tools/call` chain (not `tools/list`).
- The streamable HTTP transport passes `r.Context()` through at
  `streamable_http.go:346`, so context values set by Echo middleware — including
  our principal — are visible inside the tool handler.

This matters because the alternative is 158 edit sites with no mechanism to stop
the 159th from forgetting.

**Why not the existing tool filter.** `tool_filter.go:10-16` states plainly that
it shapes `tools/list` and nothing else, every tool remains invocable via
`tools/call`, and `autoActivate` *activates* a category when a hidden tool is
called. It is a context-window optimisation. Using it as an authorisation
boundary would be security theatre, and the package author already wrote that
down.

**Classification registry.** A `ToolAccess` map declares each tool `read` or
`write`. The default for an unlisted tool is **write**, so a newly added tool is
denied to read-only principals until someone classifies it. A test asserts every
registered tool appears in the map, so the failure mode is a failing test at
build time rather than a silent privilege grant in production.

The read/write axis is independent of the existing category axis. A tool's
category says what it is about; its access class says whether it mutates. They
are not derivable from each other — `CategoryAuthoring` contains only writes,
but `CategoryFeatures` mixes `get_feature` with `create_feature`.

## Key Decision 3: `Principal` replaces `*User` in context

**Decision.** Introduce a `Principal` carrying identity plus capability:

```go
type Principal struct {
    User      *User           // identity (token principals carry the owner)
    TokenID   *uuid.UUID      // nil for interactive OIDC sessions
    Grants    []InstanceGrant // empty = fall back to org membership
    ReadOnly  bool            // true for read-scoped tokens
}

type InstanceGrant struct {
    InstanceID uuid.UUID
    Permission string // "read" | "write"
}
```

**Why.** Handlers currently ask "who is this?" and infer authority from org
membership. With two credential types and two authority models, that inference
no longer holds. Making capability explicit means the authorisation question is
answered by the type rather than reconstructed at each call site.

`UserFromContext` is retained, returning `Principal.User`, so the ~40 existing
call sites keep working unchanged.

**Resolution order** in `assertInstanceAccess`:

1. No principal → **deny** (changed from allow — see Decision 5).
2. Principal has grants → the instance must appear in them; the grant's
   permission governs. Org membership is *not* consulted — a token is a
   narrowing, never a widening, and an org admin's read-only token must not
   escalate via their membership.
3. No grants (interactive OIDC) → existing org-membership path.

## Key Decision 4: Grants narrow, never widen

A token's grants are a strict subset of its owner's authority, evaluated at use
time. Two consequences:

- Revoking the owner's org membership must invalidate their tokens' effective
  access. Resolution therefore re-checks that the owner still has membership in
  the org owning the granted instance. This is one extra query, within the 60s
  cache.
- A token cannot grant access the minting user did not have. `mint_access_token`
  validates each requested grant against the minter's own access at mint time,
  *and* resolution re-validates at use time. Mint-time alone is insufficient
  because authority can be revoked afterwards.

## Key Decision 5: Fail-closed, and no stale-cache fallback for tokens

**Current behaviour** (`access.go:36-43`) returns `nil` — allow — when the org
service is nil or no user is in context. The comments describe these as dev-mode
conditions, which is true today but is a fragile thing to depend on: any future
path that reaches a handler without populating context silently gets full access.

**Change.** Both conditions deny. Dev mode is preserved by injecting an explicit
dev principal with `ReadOnly: false` and a wildcard grant, so dev mode is a
*present* principal with wide authority rather than an *absent* one. The
difference matters: absence is ambiguous, and the ambiguity currently resolves
to allow.

**Stale cache.** The Zitadel introspector serves a stale cached result when the
IdP is unreachable (`introspection.go:103-106`, `:115-118`), trading revocation
latency for availability. That trade is defensible for interactive sessions. It
is not extended to access tokens: the token path's source of truth is our own
database, so there is no third party to be unavailable, and a revoked external
token must stop working.

## Key Decision 6: Production guards

Three startup conditions abort the boot when `ENVIRONMENT=production`:

1. `AUTH_ENABLED=false` — currently the default, and combined with
   `EnsureDevMembershipForAllOrgs` (`domain/org/service.go:461`) it grants the
   hardcoded dev user `org_admin` on every org in the database.
2. `ZITADEL_DEBUG_TOKEN` set — a full auth bypass (`introspection.go:85-92`)
   whose "non-production only" status is a comment, not a check.
3. `AUTH_ENABLED=true` with Zitadel unconfigured.

Failing to boot is the correct response. All three are conditions under which
the server would otherwise serve an unauthenticated, full-admin, all-tenant MCP
endpoint, and a warning log would not be read in time.

## Risks / Trade-offs

| Risk | Mitigation |
|---|---|
| Fail-closed inversion breaks working dev/test paths | Explicit dev principal; full suite is the gate; land early in sequence to surface breakage |
| Adding checks to ~117 handlers is mechanical and error-prone | Coverage test enumerates registered tools and fails on any unchecked `instance_id` tool |
| 60s cache delays revocation | Documented; `revoke_access_token` purges the cache entry directly, making revocation effectively immediate on a single instance |
| Multi-replica cache divergence | In-memory cache is per-replica; purge-on-revoke only clears the local one. Accepted at current scale (single replica); a shared cache or pub/sub invalidation is the fix if we scale out |
| Argon2id cost under load | Prefix-indexed lookup = one verification per request; cache absorbs repeats |
| Token leaked by the external user | Expiry required at mint; revocation available; `last_used_at` surfaces unexpected use |
| A read-only token still permits unbounded reads | Out of scope; rate limiting noted as follow-up |

## Migration Plan

Sequenced so each step is independently safe:

1. **Tenant isolation fixes (task 6) first.** Severable, fixes a live
   vulnerability, no dependency on the token subsystem.
2. **Fail-closed inversion (task 2).** Lands with the dev principal in the same
   change so dev mode never breaks.
3. **Token subsystem (tasks 1, 3, 4).** Additive; no behaviour change until a
   token is minted.
4. **Write gate (task 5).** Inert until a read-only principal exists.
5. **Production guards and deployment (tasks 7, 8).**

Rollback: the migration's Down drops both tables. Steps 1 and 2 are not
rollback-safe in the sense that reverting reopens the vulnerability; they should
be fixed forward.

## Open Questions

- **Default token TTL.** Proposal assumes 90 days, max 1 year, expiry mandatory.
  Needs confirmation.
- **Token prefix.** `est_` (Emergent STrategy). Cosmetic but public.
- **Multi-instance tokens.** The schema supports N grants per token; the mint
  tool exposes it. Should the first release restrict to exactly one grant to
  keep the mental model simple?
- **Audit source.** Should token-authenticated calls record a distinct
  `audit.SourceMCPToken` rather than reusing `SourceMCP` (`middleware.go:122`)?
  Leaning yes — otherwise external access is indistinguishable from internal in
  the audit log.
