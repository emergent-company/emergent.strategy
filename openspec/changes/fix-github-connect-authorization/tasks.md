# Tasks

Tests come first in every section: write the failing test, then the change.
Cross-tenant tests use two organisations and a user who belongs to only one.

## 1. Shared authorization package

- [ ] 1.1 Create `internal/authz` with the helpers of `internal/mcpserver/access.go`
      (workspace access, instance access, instance write, org admin, user org ids)
      behind small interfaces for the org and workspace lookups.
- [ ] 1.2 `internal/mcpserver` keeps wrappers with the same names and results; the
      existing access tests (`access_failclosed_test.go`, `access_workspace_test.go`,
      `access_coverage_test.go`) pass unchanged.
- [ ] 1.3 A web adapter reads the principal from the request context and returns
      the same not-found answer for "no access" and "does not exist"; it fails
      closed when the principal or the org service is missing. Dev mode
      (`DevPrincipal`) keeps working.
- [ ] 1.4 `domain/org`: `EnsureMember(ctx, orgID, userID, role)` inserts and does
      nothing on conflict. `AddMember` is unchanged.

## 2. Import writes only into the caller's own tenancy

- [ ] 2.1 Handler tests (two organisations A and B, a user in A only):
      workspace of B is refused; a foreign `workspace_id` gives not-found;
      a viewer of A is refused; an admin of A succeeds.
- [ ] 2.2 `workspace_id` must belong to an organisation in which the caller is
      `org_admin`.
- [ ] 2.3 Inline creation: always a new organisation named by the user, the caller
      its `org_admin`; a taken name returns a conflict and adds no membership.
      Remove `GetOrCreate` and the `GetWorkspaceByOwner` fallback from this path.
- [ ] 2.4 `__existing__` resolves the existing instance's workspace and goes
      through 2.2; `__new__` goes through 2.3. They are no longer both mapped to
      the create branch.
- [ ] 2.5 An instance already linked to the repository: re-import only with write
      access; `MoveInstance` only when the caller administers the source and the
      target organisation; otherwise a conflict that names nothing.
- [ ] 2.6 No membership is written with a role other than `org_admin` /
      `org_viewer`; the connect flow no longer calls `AddMember`.
- [ ] 2.7 Regression test for the takeover: a user names an existing organisation
      as the new workspace; afterwards they are not a member of it and cannot
      reach its instances through the MCP access checks.

## 3. The connect page shows only the caller's tenancy

- [ ] 3.1 The dropdown lists the workspaces of organisations the caller
      administers, and keeps the `e2e-` exclusion.
- [ ] 3.2 `annotateConnectedInstances` fills instance, organisation, workspace and
      sync fields only for instances the caller can access; for the rest it sets
      `connected_elsewhere` and nothing else. The templ shows that marker.
- [ ] 3.3 Test: the rendered page for a user of A contains no id, name,
      organisation or workspace of B (assert on the HTML).

## 4. Revoked token and scan correctness

- [ ] 4.1 `sync.TokenRevokedError`, produced from a 401 in `ListUserRepos` (both
      passes) and mapped in `internal/github/adapter.go`.
- [ ] 4.2 Pass-2 errors other than 401 mark the result partial and are logged with
      the organisation names, instead of being dropped.
- [ ] 4.3 The repos handler clears the stored token (`ClearGithubToken`), removes
      the cache entry and renders the authorize state. Test with a fake client that
      returns 401.
- [ ] 4.4 Scan cache key: user id plus a hash of the token. Test: two users with
      tokens sharing a 16-character prefix do not share an entry.

## 5. MCP tools

- [ ] 5.1 `list_github_installations` returns the installations the caller's token
      sees (`ListUserInstallations`); no stored token gives
      `needs_github_connection`, not the server-wide list.
- [ ] 5.2 `scan_github_repos(owner)` requires the owner among those installations;
      otherwise the same "not installed" answer as for an unknown owner.
- [ ] 5.3 `import_from_github` calls the instance-write check.
- [ ] 5.4 Tests with `newMCPClientAs`, `seedOrg` and `seedOrgWithoutDevMembership`:
      another tenant's owner is refused; a read-only token cannot import.
- [ ] 5.5 Correct the `scan_github_repos` description (30 minutes). Regenerate
      `self-model.json` (`task selfmodel:generate`).

## 6. Verification

- [ ] 6.1 `cd apps/strategy-server && go test ./...` green; `task lint` clean.
- [ ] 6.2 `openspec validate fix-github-connect-authorization --strict` passes.
- [ ] 6.3 Mutation-check the key tests (each mutation compiles): drop each
      authorization call and confirm a test fails.
- [ ] 6.4 Walk the attack list of the proposal (points 1 to 6) against a local
      server with two users and two organisations, and record the result.
- [ ] 6.5 Add this change and `add-web-tenant-isolation` as a gate to
      `deploy-strategy-server` (section 0 or 4).
