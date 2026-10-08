## 0. Baseline

- [x] 0.1 Run `cd apps/strategy-server && go test ./...` and record the baseline (expected: all packages pass; `task dev-deps` must be running for DB-backed tests)
- [x] 0.2 Run `task lint` and record baseline findings

---

## 1. Tenant Isolation Fixes (severable — land first)

> Fixes a vulnerability that exists today on any deployed instance, independent
> of the token work. Do not bundle this behind the rest of the change.

- [x] 1.1 Write a failing test `TestAllInstanceToolsCheckAccess` that enumerates registered tools declaring a required `instance_id` parameter and asserts each performs an access check (drive via a non-member principal calling each tool and asserting forbidden)
- [x] 1.2 Add `assertInstanceAccess` to the unchecked strategy read tools in `internal/mcpserver/server.go`: `health_check` (:407), `get_strategy_context` (:562), `get_product_vision` (:577), `get_personas` (:592), `get_competitive_position` (:607), `get_roadmap` (:622)
- [x] 1.3 Add `assertInstanceAccess` to the unchecked feature/artifact tools: `list_features` (:641), `get_feature` (:658), `list_artifacts` (:674), `list_relationships` (:690), `list_mutations` (:706)
- [x] 1.4 Add `assertInstanceAccess` to `search_strategy` (:750) — before any call to the semantic backend
- [x] 1.5 Sweep remaining unchecked handlers in `server.go` until 1.1 passes for that file
- [x] 1.6 Add `assertInstanceAccess` to all 5 tools in `register_version_tools.go`
- [x] 1.7 Add `assertInstanceAccess` to all 7 tools in `register_workpackage_tools.go`
- [x] 1.8 Add `assertInstanceAccess` to all 11 tools in `register_pack_tools.go`
- [x] 1.9 Add `assertInstanceAccess` to all 10 tools in `register_phase2c_tools.go`
- [x] 1.10 Complete the partial coverage in `register_sync_tools.go` (10 tools, 3 checks)
- [x] 1.11 Complete the partial coverage in `register_ripple_tools.go` (11 tools, 8 checks)
- [x] 1.12 Normalise the forbidden error shape so a nonexistent and an inaccessible instance are indistinguishable
- [x] 1.13 Confirm 1.1 passes; run full suite and compare to baseline

---

## 2. Fail-Closed Access Helpers

- [x] 2.1 Add `Principal` and `InstanceGrant` types to `internal/web/context.go`; add `ContextWithPrincipal` and `PrincipalFromContext`
- [x] 2.2 Keep `UserFromContext` working by returning `Principal.User`, so existing call sites are unaffected
- [x] 2.3 Define `DevPrincipal` — the existing `DevUser` with `ReadOnly: false` and a wildcard grant
- [x] 2.4 Update the dev pass-through in `internal/web/middleware.go:66-72` to inject `DevPrincipal`
- [x] 2.5 Invert `assertWorkspaceAccess` (`internal/mcpserver/access.go:37-43`) to deny on nil org service and on missing principal; log the missing-principal case as a server defect. Note: only reached by tools that resolve an instance — tools taking no `instance_id` (e.g. `set_tool_filter`) never call it, so introspection and tool-listing stay usable without a principal
- [x] 2.6 Invert `assertInstanceAccess` (`access.go:62-70`) the same way
- [x] 2.7 Write tests for both inversions: nil service denies, missing principal denies, dev principal allows, member allows, non-member denies
- [x] 2.8 Run full suite; fix every path that relied on fail-open (expect breakage here — this is the step that surfaces it)

---

## 3. Access Token Storage

- [x] 3.1 Create migration `internal/database/migrations/043_access_tokens.sql` with `access_tokens`: `id`, `org_id`, `user_id`, `name`, `token_prefix` (8 chars, indexed), `token_hash`, `expires_at NOT NULL`, `last_used_at`, `revoked_at`, `created_at`
- [x] 3.2 Add `access_token_grants` in the same migration: `id`, `token_id` (FK cascade delete), `instance_id` (FK cascade delete), `permission CHECK (permission IN ('read','write'))`, unique on `(token_id, instance_id)`
- [x] 3.3 Add index on `access_tokens(token_prefix) WHERE revoked_at IS NULL`
- [x] 3.4 Write the goose Down migration dropping both tables
- [x] 3.5 Add `AccessToken` and `AccessTokenGrant` structs to `internal/domain/models.go`
- [x] 3.6 Verify migration applies and rolls back cleanly against a scratch DB

---

## 4. Access Token Service

- [x] 4.1 Create `domain/accesstoken/service.go`
- [x] 4.2 Implement `Generate()` — crypto/rand token, `est_` prefix, 22 base62 chars; return plaintext and public prefix
- [x] 4.3 Implement Argon2id hashing and constant-time verification with documented parameters
- [x] 4.4 Implement `Mint(ctx, params)` — validate expiry present and within max, validate each requested grant against the minter's own access, persist, return plaintext once
- [x] 4.5 Implement `Resolve(ctx, plaintext)` — select candidates by prefix, verify hash, reject expired/revoked, load grants, re-verify the owner still has org membership for each granted instance
- [x] 4.6 Implement a 60s in-memory resolution cache keyed by token hash; document that TTL as the revocation latency
- [x] 4.7 Implement `Revoke(ctx, tokenID)` — set `revoked_at`, purge the cache entry, write an audit entry
- [x] 4.8 Implement `List(ctx, orgID)` — never return hash or plaintext
- [x] 4.9 Implement async `last_used_at` update that does not block the request path
- [x] 4.10 Write tests: mint/resolve round-trip, wrong token rejected, expired rejected, revoked rejected, prefix collision handled, cache hit/miss, revoke purges cache, owner-lost-membership denies, mint beyond minter's authority rejected

---

## 5. Middleware Integration

- [x] 5.1 In `AuthMiddleware` (`internal/web/middleware.go:54`), branch on the `est_` prefix before Zitadel introspection
- [x] 5.2 On the token path, resolve via the token service and build a Principal with grants and `ReadOnly` derived from them; return 401 on any resolution failure
- [x] 5.3 On the Zitadel path, wrap the existing `*User` in a Principal with no grants
- [x] 5.4 Record the token id in the audit context for token-authenticated requests
- [x] 5.5 Implement grant-aware resolution in `assertInstanceAccess`: grants present → instance must be granted, permission governs, org membership not consulted; grants absent → existing org path
- [x] 5.6 Add `assertInstanceWrite` for handlers needing an explicit write assertion
- [x] 5.7 Write middleware tests: token authenticates, invalid token 401s, Zitadel path unchanged, grant overrides org_admin to read-only

---

## 6. Write Gate

- [x] 6.1 Create `internal/mcpserver/write_gate.go` with `ToolAccess map[string]string` taking `"read"`, `"session"`, or `"write"`
- [x] 6.2 Classify all 158 registered tools by what they mutate, not by name prefix; default unlisted to write. `set_tool_filter`, `list_tool_categories` and `get_agent_for_task` are `session` — they mutate only the caller's own view. 41 tools have mutating-verb prefixes but take no `instance_id`; each needs deciding individually on whether it touches persisted tenant data
- [x] 6.3 Write `TestEveryToolIsClassified` asserting every registered tool name appears in the map
- [x] 6.4 Implement the `server.ToolHandlerMiddleware` — read the Principal from context (available because `streamable_http.go:346` propagates `r.Context()`), deny when the principal is read-only and the tool is not classified read
- [x] 6.5 Register it via `server.WithToolHandlerMiddleware` in `NewMCPServer` (`internal/mcpserver/server.go:132`)
- [x] 6.6 Return a structured MCP error result naming the required permission — never a raw Go error
- [x] 6.7 Write tests: read-only + write tool denied, read-only + read tool allowed, read-only + session tool allowed, unclassified denied, full-access unaffected, denial occurs before handler execution
- [x] 6.8 Write a test asserting a write tool in an inactive category is still denied, proving the gate does not depend on the tool filter

---

## 7. Token Management Surface

- [x] 7.1 Create `internal/mcpserver/register_token_tools.go`
- [x] 7.2 Implement `mint_access_token` — requires `org_admin`; returns plaintext once with an explicit "store this now" note
- [x] 7.3 Implement `list_access_tokens` — requires `org_admin`; no hashes
- [x] 7.4 Implement `revoke_access_token` — requires `org_admin`
- [x] 7.5 Deny all three when the caller is itself authenticated by an access token
- [x] 7.6 Add the tools to `ToolCategories` under `CategoryAdmin` and to `ToolAccess` as writes
- [x] 7.7 Add a `strategy-server token mint|list|revoke` CLI path for bootstrapping the first token
- [x] 7.8 Write tests including the non-admin and token-authenticated denial cases

---

## 8. Production Guards

- [x] 8.1 Use the existing `Env` field (`ENV`, default `development`) — do NOT add a second `ENVIRONMENT` variable; two competing indicators would let `ENV=production ENVIRONMENT=development` silently disable every guard
- [x] 8.2 Add a startup validation that aborts when `ENV=production` and `AUTH_ENABLED=false`
- [x] 8.3 Abort when `ENV=production` and `ZITADEL_DEBUG_TOKEN` is set
- [x] 8.4 Abort when `ENV=production` and `AUTH_ENABLED=true` and Zitadel is unconfigured
- [x] 8.5 Gate the `DebugToken` bypass in `internal/auth/introspection.go:85-92` on `ENV=development`
- [x] 8.6 Guard `seedDevIdentity`/`EnsureDevMembershipForAllOrgs` (`cmd_serve.go:345`) so it cannot run outside development
- [x] 8.7 Write tests for each abort condition and confirm dev defaults still boot

---

## 9. Deployment

**Moved to the `deploy-strategy-server` change.**

These tasks turned out not to be "write a workflow file". strategy-server has
no deployment anywhere — `deploy.yaml` ships `apps/epf-cli`, and
`strategy-server.yaml` is CI only. Completing them means provisioning a Cloud
Run service, a managed Postgres, a runtime service account, secrets, and a
production Zitadel tenant. That is infrastructure work this change revealed,
not work this change should carry, and it has open questions (which GCP
project, which domain, shared vs standalone DB) that need answering before any
of it can start.

- [x] 9.1 Deployment work extracted to `deploy-strategy-server` (§1–§3, §6 there)
- [x] 9.2 Production guards implemented and unit-tested here (§8); asserting them against a real deploy is `deploy-strategy-server` §4
- [x] 9.3 Dockerfile exposes 8090 — confirmed. Matching it to a Cloud Run `--port` is `deploy-strategy-server` §2.3, since no Cloud Run config exists yet to match against
- [x] 9.4 MCP client documentation for token holders moved to `deploy-strategy-server` §6.1 — it must document a real URL
- [x] 9.5 Staging guard verification moved to `deploy-strategy-server` §4

---

## 10. End-to-End Verification

Tasks 10.1–10.4 and 10.6 require a live server and a real MCP client over a
network boundary. Each has equivalent automated coverage already merged — the
CLI mint/list/revoke cycle was exercised end-to-end against a real database,
and the grant/deny matrix is covered by `register_token_tools_test.go`,
`access_grants_test.go`, and `write_gate_test.go`. That coverage is not what
these tasks ask for, so they are **not** ticked here; they are carried by
`deploy-strategy-server` §5, which also ticks them back here when done.

- [ ] 10.1 Mint a read-only token scoped to one instance against a live server — blocked on `deploy-strategy-server`
- [ ] 10.2 Connect a real MCP client with that token; confirm `tools/list` responds — blocked on `deploy-strategy-server`
- [ ] 10.3 Confirm reads succeed on the granted instance — blocked on `deploy-strategy-server`
- [ ] 10.4 Confirm reads fail on a non-granted instance — blocked on `deploy-strategy-server`
- [x] 10.5 Confirm a write tool is denied, including one whose category is inactive
- [ ] 10.6 Revoke the token and confirm the next call fails — blocked on `deploy-strategy-server`
- [x] 10.7 Run `go test ./...` and compare to the 0.1 baseline — no regressions
- [x] 10.8 Run `task lint` and compare to the 0.2 baseline
- [x] 10.9 Run `openspec validate add-scoped-readonly-mcp-access --strict`
