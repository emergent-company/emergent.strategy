# Implementation Tasks

## 1. Delete Migrated Apps

### 1.1 Delete apps/admin

- [x] 1.1.1 Delete `apps/admin/` directory entirely

### 1.2 Delete apps/server

- [x] 1.2.1 Delete `apps/server/` directory entirely

## 2. Delete Supporting Tools

### 2.1 Delete MCP servers and CLI tools

- [x] 2.1.1 Delete `tools/api-client-mcp/`
- [x] 2.1.2 Delete `tools/langfuse-mcp/`
- [x] 2.1.3 Delete `tools/logs-mcp/`
- [x] 2.1.4 Delete `tools/workspace-cli/`
- [x] 2.1.5 Delete `tools/workspace-mcp/`
- [x] 2.1.6 Delete `tools/bin/` (only used by deleted tools)

## 3. Delete Infrastructure

### 3.1 Delete Docker configuration

- [x] 3.1.1 Delete `docker/` directory (Docker Compose for admin/server stack)

### 3.2 Delete scripts

- [x] 3.2.1 Delete `scripts/` directory (all admin/server specific)

## 4. Clean Up Root Configuration

### 4.1 Update package.json

- [x] 4.1.1 Delete package.json entirely (no longer needed for Go-based repo)

### 4.2 Clean up workspace files

- [x] 4.2.1 Delete `pnpm-workspace.yaml`
- [x] 4.2.2 Delete `nx.json` and `workspace.json`
- [x] 4.2.3 Delete `tsconfig.json` (no TypeScript projects remain)

### 4.3 Update agent instructions

- [x] 4.3.1 Update `AGENTS.md` - remove admin/server references
- [x] 4.3.2 Update `.opencode/instructions.md` - remove admin/server patterns
- [x] 4.3.3 Delete `.github/copilot-instructions.md`

## 5. Clean Up Documentation

### 5.1 Delete admin/server docs

- [x] 5.1.1 Delete `docs/testing/` - testing guides for admin/server
- [x] 5.1.2 Delete `docs/database/` - database schema docs
- [x] 5.1.3 Delete `docs/technical/` - technical implementation docs
- [x] 5.1.4 Delete `docs/bugs/` and `docs/improvements/`
- [x] 5.1.5 Delete `docs/archive/` - archived docs for old apps

### 5.2 Keep EPF documentation

- [x] 5.2.1 Keep `docs/EPF/` - EPF framework and instances
- [x] 5.2.2 No admin/server references found in EPF docs

## 6. Clean Up Misc Files

### 6.1 Delete config files for deleted apps

- [x] 6.1.1 Delete `.env*` files (admin/server specific)
- [x] 6.1.2 Delete `.prettierrc` and related
- [x] 6.1.3 Delete `.jscpd.json`
- [x] 6.1.4 Delete `.dockerignore`

### 6.2 Clean up root clutter

- [x] 6.2.1 Delete `logs/` directory
- [x] 6.2.2 Delete `secrets-dev/`
- [x] 6.2.3 Delete `.api/` directory
- [x] 6.2.4 Delete `.husky/`
- [x] 6.2.5 Delete `.nx/`
- [x] 6.2.6 Delete `node_modules/`
- [x] 6.2.7 Delete `.vscode/`
- [x] 6.2.8 Delete `reports/`
- [x] 6.2.9 Delete `test-data/`

## 7. Evaluate What to Keep

### 7.1 Review specs/

- [x] 7.1.1 Delete `specs/` directory (only for admin/server bash scripts)

### 7.2 Review openspec/

- [x] 7.2.1 Keep `openspec/` - useful for spec-driven development

### 7.3 Review reference/

- [x] 7.3.1 Delete `reference/` - only contained admin frontend references

### 7.4 Review .github/

- [x] 7.4.1 Keep `.github/prompts/` (openspec prompts)
- [x] 7.4.2 Delete `.github/instructions/` (admin/server self-learning log)
- [x] 7.4.3 Delete `.github/workflows/`
- [x] 7.4.4 Delete `.github/PULL_REQUEST_TEMPLATE/`

### 7.5 Review .gemini/

- [x] 7.5.1 Update `.gemini/settings.json` - remove postgres/playwright servers

## 8. Post-Cleanup Verification

- [x] 8.1 Verify `apps/epf-cli/` builds: `cd apps/epf-cli && go build`
- [x] 8.2 Update README.md to reflect new repo purpose
- [x] 8.3 Update opencode.jsonc to remove deleted file references

## Summary

This cleanup removed the admin/server apps that migrated to `emergent-company/emergent`, leaving emergent-strategy focused on:

- `apps/epf-cli/` - EPF CLI tool (Go)
- `docs/EPF/` - EPF framework documentation and instances
- `openspec/` - Spec-driven development infrastructure

### Files/Directories Deleted

- `apps/admin/`, `apps/server/`
- `tools/` (all MCP servers and CLI tools)
- `docker/`, `scripts/`
- `docs/` (except `docs/EPF/`)
- `specs/`, `reference/`
- Node.js configs: `package.json`, `pnpm-workspace.yaml`, `nx.json`, `workspace.json`, `tsconfig.json`, `pnpm-lock.yaml`
- Misc: `.env*`, `.prettierrc`, `.jscpd.json`, `.dockerignore`, `.husky/`, `.nx/`, `.vscode/`, `node_modules/`
- Root docs: `QUICK_START_DEV.md`, `RUNBOOK.md`, `SETUP.md`, `CONTRIBUTING.md`, `CHANGELOG.md`
- `.github/` (except prompts)

### Files Updated

- `AGENTS.md` - Simplified for epf-cli focus
- `.opencode/instructions.md` - Simplified for epf-cli focus
- `opencode.jsonc` - Removed old MCP server configs
- `README.md` - Updated to reflect new repo purpose
- `.gemini/settings.json` - Removed admin/server MCP servers
