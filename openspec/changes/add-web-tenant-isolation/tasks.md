# Tasks

Prerequisite: `fix-github-connect-authorization` section 1 (`internal/authz`).
Tests first in every section. Cross-tenant tests use two organisations and a user
who belongs to only one; there is no handler-level helper for that yet (1.1).

## 1. Test support

- [x] 1.1 A handler test helper that builds an echo app with the real routes, two
      organisations with an instance each, and requests as a given user and role
      (admin of A, viewer of A, member of B only, no membership).
      Done as the `tenancy` fixture of the handler tests (two organisations, an admin, a viewer, an outsider, an instance each, real database) with `do()` for requests as a given user.
- [x] 1.2 `TestEveryWebRouteIsClassified`: walks `echo.Routes()` and fails for a
      route with no class. Starts failing for every route (red), then 2.1 fills it.

      Done: `TestEveryWebRouteIsClassified` registers the real routes and fails for a route without a class. Written red, filled by 2.1.
## 2. Route classification and enforcement

- [x] 2.1 The route table: every route of `RegisterRoutes` (the nav-graph loop and
      the hand-registered ones) with its class: instance-read, instance-write,
      org-admin, list, auth-flow, public. Reviewed against the handler of each.
      Done: `classifyRoute` (`route_access.go`): five classes (authenticated, list, instance-read, instance-write, instance-in-form). 71 routes: 60 under `/strategies/:id`, 11 outside.
- [x] 2.2 Middleware for instance routes: read for GET/HEAD, write otherwise;
      resolves instance, workspace and organisation once and puts the instance in
      the context; answers as for a missing instance when access is missing.
      Done: `webAccess`, attached per route (see design 1a). Read for GET and HEAD; `InstanceAdmin` for every other method; 404 as for a missing instance; 401 with no principal; an unclassified route or a failed check is refused (404, 500), never allowed.
- [x] 2.3 `handleMoveInstance`: `org_admin` of the source and of the target
      organisation. `handleDeleteInstance`: `org_admin`.
      Done: the guard requires `org_admin` of the source for `move` and `delete`; `resolveMoveTarget` authorises the target and shares `newOrganisationWithWorkspace` with the connect import. `move` had the same organisation takeover as the old import (found while doing this task).
- [x] 2.4 `/settings/sync`, `/settings/import` and the other POSTs outside
      `/strategies/:id`: classified and checked against the organisation they act on.
      Done: `POST /settings/sync` and `/settings/import` are the class "instance in form": the guard checks the instance named in `instance_id`.
- [x] 2.5 SSE and run endpoints (`aim/runs/:runID/...`, draft review): the run or
      batch belongs to the instance in the URL; check that, not only the instance.

      Done, and it found a real hole: 14 routes name a record beside the instance and loaded it by its own id (through the real routes the other tenant's staged batch was discarded). `subResourceSpecs` makes the guard refuse a record that belongs to another instance; the two version routes were already scoped by their service. `TestSubResourceRoutesAreRealRoutes` fails for a route that names a record id and is not covered.
## 3. Lists

- [x] 3.1 `loadWorkspaces`, `loadAllInstances` and every other global query in
      `queries.go`, `queries_phases.go` and the settings handlers take the caller's
      organisation ids and filter in SQL; counts use the same filter.
      Done for the five queries that read across organisations: the sidebar, the dashboard instances and workspaces, and the settings page's memory and GitHub sync lists, through `restrictToCallersOrgs` (no organisations gives no rows). The settings sync SQL was split out of the GitHub-calling function (`loadSyncInstanceRows`) to be testable.
- [x] 3.2 Test: the dashboard HTML for a user of A contains no workspace or
      instance name of B, and the counts equal A's.

      Done: `TestListsHoldOnlyTheCallersOrganisations` (five loaders, five callers each), a membership that changes is followed, and the dev user.
## 4. Roles and dev mode

- [x] 4.1 `org_viewer`: GET passes, every write route is answered as not-found.
      Done: a viewer reads and cannot write, delete, move or sync (guard tests).
- [x] 4.2 Dev mode: the dev principal sees and writes what it created; pinned by a
      test against `EnsureDevOrg`.
      Done: `TestDevModeStillSeesItsOwnOrganisations`; the e2e tests, which register the real routes, now run as the dev user with membership, as dev mode does at startup.
- [x] 4.3 Scoped token principals: answered by their grants (test with
      `tokenPrincipal`).

      Done: a scoped token is answered by its grants on reads, and never writes on the web (`InstanceAdmin` refuses tokens).
## 5. Verification

- [x] 5.1 For each of the 32 instance routes plus move, delete and the settings
      POSTs: a request from the member of B to an instance of A returns the
      missing-instance answer and changes nothing (table-driven, from the route table).
      Done: `TestEveryInstanceRouteRefusesAUserOfAnotherOrganisation` requests all 60 real instance routes as a user of another organisation (404, nothing changes); `TestGuardRefusesAnotherTenantsRecordNamedUnderYourOwnInstance` and `TestForeignRecordsAreUntouchedThroughTheRealRoutes` do the same for the 14 record routes.
- [x] 5.2 `go test ./...`, `task lint`, `openspec validate add-web-tenant-isolation --strict`. 56 packages ok, 0 lint issues, valid.
- [x] 5.3 Mutation-check: remove the middleware from one class and confirm a test
      fails; remove a filter from one list query and confirm a test fails.
      About 35 mutations over the classification, the guard, the sub-resource table, the five list queries and the move target; every one that compiled was caught. Survivors became tests: a failed access check, a failed record lookup (both must refuse, not allow), and a dead flag that turned out to be unnecessary and was deleted.
- [ ] 5.4 Walk the two-user, two-organisation scenario against a local server and
      record the result.
      NOT DONE live. Covered by tests against a real database (every instance route and every record route as a user of another organisation), but not walked against a running server with two real accounts. Do it on staging with the `deploy-strategy-server` gate (section 3b).
- [x] 5.5 `deploy-strategy-server` lists this change as a gate. Done in #226 as section 3b.
