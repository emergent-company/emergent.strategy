## 1. Config and dependencies

- [ ] 1.1 Add `github.com/zitadel/oidc/v3` to `go.mod` / `go.sum`
- [ ] 1.2 Remove GitHub OAuth env vars from `config/config.go` (`GithubClientID`, `GithubClientSecret`, `SessionSecret`)
- [ ] 1.3 Add Zitadel env vars to `config/config.go`: `ZitadelIssuer`, `ZitadelClientJWT`, `ZitadelClientJWTPath`, `ZitadelIntrospectCacheTTL` (default 5m), `DisableZitadelIntrospection`, `ZitadelDebugToken`
- [ ] 1.4 Add `DBMode` field to `config/config.go` (`STRATEGY_DB_MODE`, default `standalone`)

## 2. Database migrations

- [ ] 2.1 Write `005_users.sql` — `strategy.users(id, zitadel_user_id UNIQUE, email, created_at, updated_at, deleted_at)`
- [ ] 2.2 Write `006_orgs.sql` — `strategy.orgs(id, name, created_at, updated_at, deleted_at)`
- [ ] 2.3 Write `007_org_memberships.sql` — `strategy.org_memberships(id, org_id FK, user_id FK, role, created_at)` with `UNIQUE(org_id, user_id)`
- [ ] 2.4 Write `008_org_invitations.sql` — `strategy.org_invitations(id, org_id FK, invited_email, role, invited_by FK, created_at, accepted_at)` with `UNIQUE(org_id, invited_email)`
- [ ] 2.5 Write `009_auth_cache.sql` — `strategy.auth_introspection_cache(token_hash PK, user_sub, email, scopes, active, expires_at, cached_at)`
- [ ] 2.6 Write `010_add_org_id_to_workspaces.sql` — make `github_owner` nullable (DROP NOT NULL); add nullable `org_id` to `workspaces`; backfill existing rows with default org id; add FK `NOT VALID`
- [ ] 2.7 Write `011_created_by_fk.sql` — add `NOT VALID` FK constraints on `workspaces.created_by`, `strategy_instances.created_by`, `strategy_mutations.created_by` → `strategy.users.id`
- [ ] 2.8 Verify all migrations run cleanly: `PGPORT=5433 task migrate`

## 3. Auth package — introspection client

- [ ] 3.1 Create `internal/auth/zitadel.go` — `ZitadelClient` struct with introspection endpoint, JWT-profile resource server init (`zitadel/oidc/v3/pkg/client/rs`), circuit breaker (30s cooldown), request coalescing (`sync.Map` of in-flight requests)
- [ ] 3.2 Create `internal/auth/cache.go` — `IntrospectionCache` backed by `strategy.auth_introspection_cache`; `Get(tokenHash)`, `Set(tokenHash, result, ttl)` methods using bun
- [ ] 3.3 Create `internal/auth/debug.go` — debug token bypass; active only when `!cfg.IsProd() && cfg.ZitadelDebugToken != ""`
- [ ] 3.4 Create `internal/auth/introspect.go` — `Introspect(ctx, token) (IntrospectionResult, error)` orchestrating: debug check → cache check → live call → cache write

## 4. Error code sentinels

- [ ] 4.1 Add user error sentinels to `pkg/apperror/` (range `120xxx`): `ErrUserNotFound` (120001)
- [ ] 4.2 Add org error sentinels (range `121xxx`): `ErrOrgNotFound` (121001), `ErrOrgNameConflict` (121002), `ErrLastAdminProtected` (121003), `ErrOrgAccessDenied` (121004)
- [ ] 4.3 Add membership error sentinels (range `122xxx`): `ErrAlreadyMember` (122001), `ErrInvitationAlreadyExists` (122002)

## 5. Domain services

- [ ] 5.1 Create `domain/user/service.go` — `UserService` with `*bun.DB` and `schema string` (set to `"strategy"` in standalone, `"core"` in shared). Methods: `EnsureUser(ctx, sub, email)` (upsert on `zitadel_user_id`; accept pending invitations transactionally; trigger org bootstrap in standalone when no orgs exist), `GetBySub(ctx, sub)`, `GetByID(ctx, id)`
- [ ] 5.2 Create `domain/org/service.go` — `OrgService` with `*bun.DB` and `schema string` (set to `"strategy"` in standalone, `"kb"` in shared; write operations return `ErrReadOnly` in shared mode). Methods: `Create`, `List(userID)`, `AddMember` (existing user → upsert membership; no user → upsert invitation), `RemoveMember` (last-admin guard), `ListMembers` (members + pending invitations), `IsAdmin(ctx, userID, orgID)`, `RoleOf(ctx, userID, orgID)`
- [ ] 5.3 `OrgService.bootstrap(ctx, userID)` — creates default org and adds user as `org_admin`; uses `pg_advisory_xact_lock` to prevent concurrent bootstrap race

## 6. Auth middleware — wire real validation

- [ ] 6.1 Update `web.User` struct: remove `GithubLogin`; add `Sub string`, `Email string`
- [ ] 6.2 Update `AuthMiddleware` — implement real path: extract Bearer token → `auth.Introspect` → `userSvc.EnsureUser` → `ContextWithUser`
- [ ] 6.3 Update `DevUser` declaration — give it a `Sub: "dev"` and `Email: "dev@localhost"`
- [ ] 6.4 Update all callers of `UserFromContext` that read `GithubLogin` (search codebase; update to use `Sub`)

## 7. Access control — scope existing queries

- [ ] 7.1 Update `domain/workspace/service.go` `List` — add `INNER JOIN strategy.org_memberships` filter on caller `user_id`
- [ ] 7.2 Update `domain/workspace/service.go` `Get` — assert `workspace.org_id` is in caller's accessible orgs; return 403 if not
- [ ] 7.3 Update `domain/workspace/service.go` `Create` — require `org_id`; assert caller is `org_admin` (not `org_viewer`)
- [ ] 7.4 Update `domain/instance/service.go` — all operations assert workspace belongs to caller's org
- [ ] 7.5 Update `domain/mutation/service.go` — write operations assert caller is `org_admin`; read operations allow `org_viewer`
- [ ] 7.6 Add `org_id` parameter to `create_workspace` MCP tool; enforce `org_admin` role check before insert

## 8. New MCP tools — org management

- [ ] 8.1 Register `create_org(name string) → {org_id}` tool
- [ ] 8.2 Register `list_orgs() → [{id, name, role, member_count}]` tool
- [ ] 8.3 Register `invite_member(org_id, email, role) → {membership_id}` tool
- [ ] 8.4 Register `remove_member(org_id, user_id) → {}` tool
- [ ] 8.5 Register `list_members(org_id) → [{user_id, email, role, joined_at}]` tool

## 9. Server wiring

- [ ] 9.1 In `cmd_serve.go` `runServer()`: construct `ZitadelClient` from config; construct `IntrospectionCache`; select `UserRepo` and `OrgRepo` implementations based on `cfg.DBMode`
- [ ] 9.2 Pass `ZitadelClient` into `AuthMiddleware`
- [ ] 9.3 Pass `UserService` and `OrgService` into `AuthMiddleware` and MCP server

## 10. Tests

- [ ] 10.1 Unit test: `IntrospectionCache.Get` returns miss on expired row
- [ ] 10.2 Unit test: `ZitadelClient` circuit breaker — after first failure, subsequent calls skip introspection for 30s
- [ ] 10.3 Unit test: `OrgService.RemoveMember` returns `last_admin_protected` when removing the final admin
- [ ] 10.4 Unit test: `OrgService.AddMember` updates role on conflict
- [ ] 10.5 Integration test: `TestMCP_AuthRealToken` — set `ZITADEL_DEBUG_TOKEN=test-token`, send request with that token, assert `UserFromContext` returns a user with `Sub="debug-user"`
- [ ] 10.6 Integration test: `TestMCP_ListWorkspacesScoped` — two users, two orgs, two workspaces; assert each user only sees their own workspace
- [ ] 10.7 Integration test: `TestMCP_CreateOrg_Bootstrap` — fresh DB, first auth creates default org automatically
- [ ] 10.8 Integration test: `TestMCP_OrgMembership_EndToEnd` — create org, invite member (existing user), list members, remove member, assert last-admin guard
- [ ] 10.9 Integration test: `TestMCP_PreInvitation_AcceptedOnFirstLogin` — invite by email before user exists → user authenticates for first time → assert membership row created and invitation stamped
- [ ] 10.10 Integration test: `TestMCP_OrgViewer_CanRead_CannotWrite` — user with `org_viewer` role can call `list_workspaces`, receives 403 on `create_workspace`
- [ ] 10.11 Run full test suite: `PGPORT=5433 task test` — all tests green

## 11. Documentation

- [ ] 11.1 Update `.env.example` in `apps/strategy-server/`: remove GitHub OAuth vars, add Zitadel vars with comments explaining shared vs standalone mode
- [ ] 11.2 Add `STRATEGY_DB_MODE` to `.env.example` with explanation of `shared` vs `standalone`
