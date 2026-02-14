# Change: Clean up monorepo residue after admin/server migration

## Why

The `admin` and `server` applications have been migrated to a separate repository in the emergent-company organization. The emergent-strategy repo will now focus on strategy tooling, with `epf-cli` as the first app. Significant cleanup is needed to:

1. Remove the migrated apps and their supporting infrastructure
2. Clean up stale references from previous renaming efforts
3. Prepare the repo structure for future strategy-focused apps

## What Changes

### Phase 1: Delete Migrated Apps and Supporting Infrastructure

- **DELETE** `apps/admin/` - React frontend (migrated to separate repo)
- **DELETE** `apps/server/` - NestJS backend (migrated to separate repo)
- **DELETE** `tools/api-client-mcp/` - MCP server for admin/server API
- **DELETE** `tools/langfuse-mcp/` - MCP server for Langfuse tracing
- **DELETE** `tools/logs-mcp/` - MCP server for log browsing
- **DELETE** `tools/workspace-cli/` - CLI for managing admin/server processes
- **DELETE** `tools/workspace-mcp/` - MCP server for workspace management
- **DELETE** `docker/` - Docker Compose configs for admin/server stack
- **DELETE** `scripts/` - Most scripts were for admin/server (evaluate individually)

### Phase 2: Clean Up Root Configuration

- **UPDATE** `package.json` - Remove workspaces, scripts, and dependencies for deleted apps
- **UPDATE** `.opencode/instructions.md` - Remove references to admin/server patterns
- **UPDATE** `AGENTS.md` - Remove references to admin/server AGENT.md files
- **DELETE** Root Node.js tooling if no longer needed (nx.json, pnpm-workspace.yaml, etc.)

### Phase 3: Clean Up Documentation

- **DELETE** `docs/testing/` - Testing guides for admin/server
- **DELETE** `docs/database/` - Database schema docs for server
- **DELETE** `docs/technical/` - Technical docs for admin/server
- **DELETE** `docs/bugs/` and `docs/improvements/` - Issue tracking for old apps
- **KEEP** `docs/EPF/` - EPF framework documentation and instances

### Phase 4: Evaluate What to Keep

- **KEEP** `apps/epf-cli/` - Go-based EPF CLI (primary app)
- **KEEP** `docs/EPF/` - EPF instances and framework docs
- **KEEP** `openspec/` - Spec-driven development (useful for epf-cli and future apps)
- **KEEP** `reference/` - External reference submodule
- **EVALUATE** `specs/` - Some may be relevant to epf-cli

## Impact

- Affected specs: None behavioral; this is infrastructure cleanup
- Affected code: Massive deletion of migrated apps
- Breaking changes:
  - All admin/server functionality removed (intentional - migrated elsewhere)
  - Root package.json scripts will be removed
  - MCP servers will be unavailable (need new ones for epf-cli context)
- Risk: Low - apps have been migrated, this is cleanup

## Out of Scope

- Creating new MCP servers or tooling for epf-cli
- Restructuring the EPF instance files
- Changes to epf-cli itself
