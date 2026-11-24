# Tasks

Prerequisite: `fix-github-connect-authorization` section 1 (`internal/authz`).
Tests first in every section. Cross-tenant tests use two organisations and a user
who belongs to only one; there is no handler-level helper for that yet (1.1).

## 1. Test support

- [ ] 1.1 A handler test helper that builds an echo app with the real routes, two
      organisations with an instance each, and requests as a given user and role
      (admin of A, viewer of A, member of B only, no membership).
- [ ] 1.2 `TestEveryWebRouteIsClassified`: walks `echo.Routes()` and fails for a
      route with no class. Starts failing for every route (red), then 2.1 fills it.

## 2. Route classification and enforcement

- [ ] 2.1 The route table: every route of `RegisterRoutes` (the nav-graph loop and
      the hand-registered ones) with its class: instance-read, instance-write,
      org-admin, list, auth-flow, public. Reviewed against the handler of each.
- [ ] 2.2 Middleware for instance routes: read for GET/HEAD, write otherwise;
      resolves instance, workspace and organisation once and puts the instance in
      the context; answers as for a missing instance when access is missing.
- [ ] 2.3 `handleMoveInstance`: `org_admin` of the source and of the target
      organisation. `handleDeleteInstance`: `org_admin`.
- [ ] 2.4 `/settings/sync`, `/settings/import` and the other POSTs outside
      `/strategies/:id`: classified and checked against the organisation they act on.
- [ ] 2.5 SSE and run endpoints (`aim/runs/:runID/...`, draft review): the run or
      batch belongs to the instance in the URL; check that, not only the instance.

## 3. Lists

- [ ] 3.1 `loadWorkspaces`, `loadAllInstances` and every other global query in
      `queries.go`, `queries_phases.go` and the settings handlers take the caller's
      organisation ids and filter in SQL; counts use the same filter.
- [ ] 3.2 Test: the dashboard HTML for a user of A contains no workspace or
      instance name of B, and the counts equal A's.

## 4. Roles and dev mode

- [ ] 4.1 `org_viewer`: GET passes, every write route is answered as not-found.
- [ ] 4.2 Dev mode: the dev principal sees and writes what it created; pinned by a
      test against `EnsureDevOrg`.
- [ ] 4.3 Scoped token principals: answered by their grants (test with
      `tokenPrincipal`).

## 5. Verification

- [ ] 5.1 For each of the 32 instance routes plus move, delete and the settings
      POSTs: a request from the member of B to an instance of A returns the
      missing-instance answer and changes nothing (table-driven, from the route table).
- [ ] 5.2 `go test ./...`, `task lint`, `openspec validate add-web-tenant-isolation --strict`.
- [ ] 5.3 Mutation-check: remove the middleware from one class and confirm a test
      fails; remove a filter from one list query and confirm a test fails.
- [ ] 5.4 Walk the two-user, two-organisation scenario against a local server and
      record the result.
- [ ] 5.5 `deploy-strategy-server` lists this change as a gate.
