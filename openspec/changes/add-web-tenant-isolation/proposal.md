# Change: Enforce organisation membership in the web UI

## Why

The MCP server checks organisation membership (`assertWorkspaceAccess`,
`assertInstanceAccess`, ...). The web UI does not. No handler under
`internal/handler` or `internal/web` calls `IsMember` or `UserOrgIDs`:

- The dashboard (`handleDashboard`) lists every workspace and every instance
  (`loadWorkspaces`, `loadAllInstances`: no user or organisation filter beyond
  deleted, archived and test rows).
- The instance routes, 32 of them under `/strategies/:id/...` (pages, drafts,
  AIM runs, evidence, publish, restore, move, delete), do not check that the
  signed-in user belongs to the instance's organisation. Anyone who knows or
  guesses an instance id reads and writes it.
- The main spec (`strategy-auth`, "Workspace-Scoped Authorisation") says a user may
  only reach workspaces tied to their GitHub identity, and "organisation
  membership" is marked "future". Neither is implemented in the web layer.

The MCP-side gaps of the same kind are tracked by `add-scoped-readonly-mcp-access`
(point 4 of its proposal). The web side is covered by nothing. The GitHub connect
flow's specific holes are `fix-github-connect-authorization`, which also creates
the shared package this change builds on.

Today this is harmless only because the server is not deployed for more than one
tenant. It must be closed before `deploy-strategy-server` ships.

## What Changes

- A route classification, enforced by a test: every web route is declared as
  instance-read, instance-write, organisation-admin, list (filtered to the
  caller's organisations), authentication flow, or public. A new route that is
  not classified fails the build (the web counterpart of `TestEveryToolIsClassified`).
- One enforcement point for the `/strategies/:id/...` routes: GET and HEAD need
  read access to the instance, every other method needs write access
  (`org_admin`). The answer for no access is the one for a missing instance.
- The dashboard, settings and any other list or lookup shows only instances and
  workspaces of the caller's organisations.
- `move` needs `org_admin` of the source and the target organisation; `delete`
  needs `org_admin`.
- `org_viewer` is read-only on the web, as it is meant to be over MCP.
- Dev mode (`DevPrincipal`) keeps seeing everything it created.
- The `strategy-auth` requirement is rewritten from "GitHub identity" to
  organisation membership, which is what the data model and the MCP side use.

## Impact

- Affected specs: `strategy-auth` (MODIFIED, ADDED).
- Affected code: `internal/handler/handler.go` (route registration),
  `queries.go` and the other global queries, `handler_instance.go`,
  `internal/web/middleware.go`, the shared `internal/authz`.
- Breaking: a user sees only their organisations' data; a bookmark to another
  tenant's instance returns not-found.
- Blocks `deploy-strategy-server`.
