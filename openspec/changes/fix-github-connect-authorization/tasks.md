# Tasks

Tests come first in every section: write the failing test, then the change.
Cross-tenant tests use two organisations and a user who belongs to only one.

## 1. Shared authorization package

- [x] 1.1 Create `internal/authz` with the helpers of `internal/mcpserver/access.go`
      (workspace access, instance access, instance write, org admin, user org ids)
      behind small interfaces for the org and workspace lookups.
      Done: `internal/authz` (`Authorizer`: `WorkspaceAccess`, `InstanceAccess`, `InstanceWrite`, `OrgAdmin`, `WorkspaceAdmin`, `InstanceAdmin`, `UserOrgIDs`), 11 tests against fakes. `InstanceAdmin` is new (access plus `org_admin` of the instance's organisation).
- [x] 1.2 `internal/mcpserver` keeps wrappers with the same names and results; the
      existing access tests (`access_failclosed_test.go`, `access_workspace_test.go`,
      `access_coverage_test.go`) pass unchanged.
      Done: `mcpserver/access.go` is wrappers; the existing MCP access tests pass unchanged. A first version reworded the "access tokens cannot manage access tokens" message and `TestTokenTools_DeniedToTokenAuthenticatedCallers` caught it.
- [x] 1.3 A web adapter reads the principal from the request context and returns
      the same not-found answer for "no access" and "does not exist"; it fails
      closed when the principal or the org service is missing. Dev mode
      (`DevPrincipal`) keeps working.
      Done as `internal/authz` taking the principal from the request context (fails closed). The per-route web middleware is `add-web-tenant-isolation`.
- [x] 1.4 `domain/org`: `EnsureMember(ctx, orgID, userID, role)` inserts and does
      nothing on conflict. `AddMember` is unchanged.

      Done: `EnsureMember` (insert-only, refuses roles other than `org_admin`/`org_viewer`), 2 tests.
## 2. Import writes only into the caller's own tenancy

- [x] 2.1 Handler tests (two organisations A and B, a user in A only):
      workspace of B is refused; a foreign `workspace_id` gives not-found;
      a viewer of A is refused; an admin of A succeeds.
      Done: `handler_github_import_test.go`, 16 tests on two organisations (admin, viewer, outsider).
- [x] 2.2 `workspace_id` must belong to an organisation in which the caller is
      `org_admin`.
      Done: `resolveImportTarget` (`handler_github_import_target.go`): `WorkspaceAdmin` on a picked workspace.
- [x] 2.3 Inline creation: always a new organisation named by the user, the caller
      its `org_admin`; a taken name returns a conflict and adds no membership.
      Remove `GetOrCreate` and the `GetWorkspaceByOwner` fallback from this path.
      Done: inline creation is a new organisation with the caller as admin; a taken name, or a GitHub owner whose workspace another organisation holds, is a 409 and creates nothing. `GetOrCreate` and the unscoped `GetWorkspaceByOwner` fallback are gone; a workspace of the caller's own organisation for that owner is reused.
- [x] 2.4 `__existing__` resolves the existing instance's workspace and goes
      through 2.2; `__new__` goes through 2.3. They are no longer both mapped to
      the create branch.
      Done: `__existing__` resolves the repository's instance (400 when there is none); `__new__` goes through 2.3.
- [x] 2.5 An instance already linked to the repository: re-import only with write
      access; `MoveInstance` only when the caller administers the source and the
      target organisation; otherwise a conflict that names nothing.
      Done: re-import needs `InstanceAdmin`; a move also needs `WorkspaceAdmin` of the target; otherwise 409 naming nothing (403 for a viewer of that organisation).
- [x] 2.6 No membership is written with a role other than `org_admin` /
      `org_viewer`; the connect flow no longer calls `AddMember`.
      Done: the connect flow no longer calls `AddMember` or `GetOrCreate`.
- [x] 2.7 Regression test for the takeover: a user names an existing organisation
      as the new workspace; afterwards they are not a member of it and cannot
      reach its instances through the MCP access checks.

      Done: `TestInlineCreationNeverJoinsAnExistingOrganisation` (also asserts the caller cannot reach an instance of the named organisation through `authz`). 9 mutations on the resolver caught (one survivor led to a test for an already-connected repository).
## 3. The connect page shows only the caller's tenancy

- [x] 3.1 The dropdown lists the workspaces of organisations the caller
      administers, and keeps the `e2e-` exclusion.
      Done: the dropdown joins the caller's `org_admin` memberships in SQL; with no user it is empty.
- [x] 3.2 `annotateConnectedInstances` fills instance, organisation, workspace and
      sync fields only for instances the caller can access; for the rest it sets
      `connected_elsewhere` and nothing else. The templ shows that marker.
      Done: instances of other organisations come back flagged in the query and fill in only `ConnectedElsewhere`; the template shows "connected in another organisation" and no import form.
- [x] 3.3 Test: the rendered page for a user of A contains no id, name,
      organisation or workspace of B (assert on the HTML).

      Done: `TestConnectPageForAUserOfAContainsNothingOfB` renders the page and asserts on the HTML. 7 mutations caught, template included.
## 4. Revoked token and scan correctness

- [x] 4.1 `sync.TokenRevokedError`, produced from a 401 in `ListUserRepos` (both
      passes) and mapped in `internal/github/adapter.go`.
      Done: `TokenRevokedError` in `internal/github` and `domain/sync`, from a 401 in both passes of `ListUserRepos` and in `ListUserInstallations`; mapped in the adapter.
- [x] 4.2 Pass-2 errors other than 401 mark the result partial and are logged with
      the organisation names, instead of being dropped.
      Done, with one refinement of the design: a 403 on one organisation stays a silent skip (the expected "OAuth App not approved", already explained on the page). Other failures return the list with a `PartialResultError`, carried as `Incomplete`; the page says the list may be incomplete.
- [x] 4.3 The repos handler clears the stored token (`ClearGithubToken`), removes
      the cache entry and renders the authorize state. Test with a fake client that
      returns 401.
      Done: the repos handler (first scan and cached) and the scan POST. An HTMX request gets `HX-Redirect`, since the list is a fragment and a 302 would swap a page into it. 5 handler tests.
- [x] 4.4 Scan cache key: user id plus a hash of the token. Test: two users with
      tokens sharing a 16-character prefix do not share an entry.

      Done: the key is a hash of the whole token (the scan service has no user id); tokens sharing 16 characters do not share an entry; per-owner scans are cleared with the user's.
## 5. MCP tools

- [x] 5.1 `list_github_installations` returns the installations the caller's token
      sees (`ListUserInstallations`); no stored token gives
      `needs_github_connection`, not the server-wide list.
      Done as `list_github_installations` with the caller's own token; `Services.User` added; no token gives `needs_github_connection`; a revoked token is cleared.
- [x] 5.2 `scan_github_repos(owner)` requires the owner among those installations;
      otherwise the same "not installed" answer as for an unknown owner.
      Done differently from the first design: `scan_github_repos` lists with the caller's own token (`ScanUserOwnerRepos`, detection only for that owner's repositories). Scanning through the App's installation token would show repositories the caller's account cannot see. Access tokens are refused by both tools.
- [x] 5.3 `import_from_github` calls the instance-write check.
      Done: `assertInstanceWrite`.
- [x] 5.4 Tests with `newMCPClientAs`, `seedOrg` and `seedOrgWithoutDevMembership`:
      another tenant's owner is refused; a read-only token cannot import.
      Done: `github_tools_scope_test.go` (9 tests; the import test uses a token with a write grant on one instance and a read grant on another, which only the per-instance check stops). 10 mutations caught.
- [x] 5.5 Correct the `scan_github_repos` description (30 minutes). Regenerate
      `self-model.json` (`task selfmodel:generate`).

      Done: descriptions say 30 minutes and name the connected-account requirement; `self-model.json` regenerated (167 tools; the personal handle in an example is gone).
## 6. Verification

- [x] 6.1 `cd apps/strategy-server && go test ./...` green; `task lint` clean. 56 packages ok (the new one is `internal/authz`), 0 lint issues.
- [x] 6.2 `openspec validate fix-github-connect-authorization --strict` passes.
- [x] 6.3 Mutation-check the key tests (each mutation compiles): drop each
      authorization call and confirm a test fails.
      About 70 mutations over the authz helpers, the import resolver, the connect page, the GitHub client, adapter and scan service, the handler and the MCP tools; every one that compiled was caught (several first survivors led to tests for the already-connected repository, the cached branch of the incomplete notice, and the read-grant case of the import tool).
- [ ] 6.4 Walk the attack list of the proposal (points 1 to 6) against a local
      server with two users and two organisations, and record the result.
      NOT DONE live. The attacks of the proposal (1 to 6) are each reproduced by a test against a real database with two organisations and three roles, but they have not been walked against a running server with two real accounts. Do that on staging with the `deploy-strategy-server` gate (section 3b).
- [x] 6.5 Add this change and `add-web-tenant-isolation` as a gate to
      `deploy-strategy-server` (section 0 or 4). Done in #226 as section 3b.
