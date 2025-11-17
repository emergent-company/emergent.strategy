# Change: Rename server-nest app to server

## Why

The app name `server-nest` is unnecessarily verbose and redundant. The "-nest" suffix doesn't add meaningful information since:
- The tech stack (NestJS) is already documented in project.md and clear from the codebase
- No other server implementations exist that would require disambiguation
- Shorter names improve developer ergonomics (faster to type, easier to read in commands and logs)

Renaming to `server` provides a cleaner, more intuitive name that aligns with the frontend app's simple naming (`admin`).

## What Changes

- Rename directory from `apps/server-nest/` to `apps/server/`
- Update Nx project name from `server-nest` to `server`
- Update all references to `server-nest` in:
  - package.json files (root and app)
  - Nx configuration (nx.json, project.json)
  - Documentation files (README, guides, instructions)
  - Source code comments and error messages
  - Test files and test configuration
  - Workspace CLI PM2 configuration
  - OpenSpec change proposals and specs

**Note:** This is a non-breaking rename from a user perspective. The API endpoints, database, and runtime behavior remain unchanged. Only internal project structure and developer tooling are affected.

## Impact

- **Affected specs:** None directly (no functional changes)
- **Affected code:**
  - Root workspace configuration: `package.json`, `nx.json`
  - App directory structure: `apps/server-nest/` → `apps/server/`
  - Nx project configuration: `apps/server/project.json`
  - PM2 configuration: `tools/workspace-cli/pm2/ecosystem.apps.cjs`
  - Documentation: `openspec/project.md`, `AGENTS.md`, various docs in `docs/`
  - Source code: Comments, log paths, error messages in various files
  - OpenSpec changes: `openspec/changes/document-test-infrastructure/`
- **Developer impact:**
  - All developers must run `npm install` after pulling changes (workspace update)
  - Command changes: `nx run server-nest:*` → `nx run server:*`
  - Path changes: `apps/server-nest/*` → `apps/server/*`
  - No production deployment changes (compiled output paths handled by build config)
