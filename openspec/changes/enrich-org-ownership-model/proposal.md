# Change: Enrich Org Ownership Model

## Why

The `orgs` table exists but is functionally empty. Workspaces are created without
org ownership, the CLI import has no org awareness, and the web UI shows a flat list
of strategies with no organizational grouping. The org model needs to become the
real ownership root: an org owns strategies (via workspaces), is identified by
business registry fields compatible with the 21st ecosystem, and is always present
in both dev and production flows.

This is foundational for future 21st-ID auth integration, where strategy-server
and 21st-captable share the same identity and org universe.

## What Changes

- **Enrich `orgs` table** with `org_number`, `country`, `website`, `logo_url`,
  and `twentyfirst_id` columns to match 21st ecosystem identity patterns
- **Dev org auto-creation** — `EnsureDevOrg()` called at server startup so dev
  mode always has an org; existing unscoped workspaces are adopted by the dev org
- **CLI import with `--org` flag** — create or find an org by name/ID, link the
  workspace to it; extract `north_star.organization` as fallback org name
- **MCP `create_workspace` gets explicit `org_id` parameter** — no more
  nondeterministic auto-pick-first; `org_id` is required
- **MCP `assign_workspace_to_org` tool** — reassign workspace org ownership
- **Web UI sidebar groups strategies by org** — org name as section header

## Impact

- Affected specs: `strategy-core`, `strategy-auth`, `strategy-web`
- Affected code:
  - `internal/database/migrations/` — new migration for org columns
  - `internal/domain/models.go` — enriched `Org` struct
  - `domain/org/service.go` — enriched `Create`, new `GetByName`, `GetOrCreate`
  - `domain/workspace/service.go` — `CreateWorkspace` accepts `orgID`
  - `cmd_serve.go` — `EnsureDevOrg()` call + dev workspace adoption
  - `cmd_import.go` — `--org` flag, north_star extraction
  - `internal/mcpserver/server.go` — `create_workspace` org_id param
  - `internal/mcpserver/register_org_tools.go` — `assign_workspace_to_org` tool
  - `internal/handler/queries.go` — sidebar grouped by org
  - `internal/ui/shell.templ` — sidebar org sections
