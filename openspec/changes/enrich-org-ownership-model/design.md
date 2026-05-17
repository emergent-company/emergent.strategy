## Context

Strategy-server has an `orgs` table with name and slug, plus `org_memberships` for
role-based access. However, the table is empty in practice: the CLI import creates
workspaces with `org_id = NULL`, dev mode does not seed a dev org, and the MCP
`create_workspace` tool auto-assigns to the user's first org nondeterministically.

The 21st ecosystem (21st-captable, 21st-ID) uses richer company/org models with
business registry identifiers (`org_number`, `country`, `twentyfirst_id`). Strategy-server
will share this identity universe when 21st-ID replaces Zitadel as the auth provider.

### Stakeholders

- Strategy-server web UI users (need org-scoped navigation)
- MCP clients (need deterministic workspace-org assignment)
- 21st-ID integration (future — needs compatible org identity fields)
- CLI import users (need to associate imported strategies with an org)

## Goals / Non-Goals

### Goals

- Enrich the `orgs` table with fields compatible with the 21st ecosystem
- Make org ownership mandatory for all workspaces (no more NULL `org_id`)
- Provide reliable org creation and workspace-org linking in CLI, MCP, and web flows
- Extract org name from `north_star.organization` during import when no explicit org is given
- Auto-create a dev org in dev mode so the full ownership chain works locally

### Non-Goals

- 21st-ID auth integration (deferred — Zitadel remains for now)
- Cross-service org federation between strategy-server and 21st-captable
- Business registry API integration (no 21st.ai API calls)
- Org-scoped access control changes in the MCP layer (existing `assertWorkspaceAccess` is sufficient)
- Norwegian-specific fields from 21st-captable (`org_form`, `is_capital_paid`, etc.)

## Decisions

### Decision 1: Enrich orgs table, not create a new companies table

**What:** Add `org_number`, `country`, `website`, `logo_url`, `twentyfirst_id` to the
existing `orgs` table rather than creating a separate `companies` table.

**Why:** The `orgs` table already has the right semantics (tenant container with name,
slug, membership). Adding identity fields keeps the model simple and avoids a
Company-vs-Org split that would need reconciliation later. 21st-captable uses
`Company` because it has no org/tenant concept; strategy-server already does.

**Alternatives considered:**
- Create a `companies` table and FK from `orgs` — adds indirection without clear benefit
- Use a JSONB `metadata` column — loses schema enforcement and query capability

### Decision 2: org_id becomes NOT NULL on workspaces (with migration backfill)

**What:** Make `workspaces.org_id` NOT NULL. The migration creates a "Default" org
and assigns all existing NULL-org workspaces to it.

**Why:** Partial org ownership creates ambiguous access semantics (NULL means "open to
everyone"). Making it mandatory simplifies authorization and UI grouping.

**Migration plan:**
1. Insert a "Default" org with a well-known UUID if any workspace has `org_id IS NULL`
2. UPDATE all workspaces SET `org_id = <default_org_id>` WHERE `org_id IS NULL`
3. ALTER COLUMN `org_id` SET NOT NULL

**Risks:** Existing test data with NULL org_id will be assigned to the Default org.
This is acceptable — test workspaces are already filtered by `github_owner` pattern
in the web UI.

### Decision 3: CLI import extracts org name from north_star artifact

**What:** When `--org` is not provided, the import scans the parsed artifacts for
`north_star.organization` and uses it as the org name. If found, it calls
`GetOrCreate(ctx, name)` on the org service.

**Why:** The org name is canonical in the EPF artifact. Auto-extracting it reduces
friction for the most common import flow.

**Fallback chain:** `--org` flag > `north_star.organization` > workspace `github_owner`

### Decision 4: MCP create_workspace requires org_id

**What:** Add required `org_id` parameter to `create_workspace`. Remove the
auto-pick-first-org logic.

**Why:** The current auto-assignment is nondeterministic and the error path silently
discards failures. An explicit parameter makes the intent clear.

### Decision 5: Dev org auto-creation at startup

**What:** Call `orgSvc.EnsureDevOrg(ctx, devUserID)` during server startup in dev
mode. Also adopt any existing workspaces with `org_id = NULL`.

**Why:** Dev mode should mirror production behavior. Without a dev org, the ownership
chain is broken locally and org-scoped features cannot be tested.

## Risks / Trade-offs

- **Breaking MCP change:** `create_workspace` now requires `org_id`. Existing MCP
  clients that do not provide it will get a validation error.
  Mitigation: The only known MCP client is the OpenCode agent. Update the tool
  description to document the new required parameter.

- **Migration complexity:** Making `org_id` NOT NULL requires backfilling existing
  data. Risk of breaking test fixtures.
  Mitigation: Use a well-known Default org UUID. Test with `database.TestDB(t)`.

## Open Questions

- Should `twentyfirst_id` be an integer (matching 21st-captable) or a UUID
  (anticipating 21st-ID's identifier format)? Decision: use integer for now to
  match 21st-captable's `twentyfirst_id` pattern. Can be changed when 21st-ID
  ships.
