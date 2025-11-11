## 1. Pre-Rename Validation
- [ ] 1.1 Verify all services are stopped: `nx run workspace-cli:workspace:stop`
- [ ] 1.2 Verify clean git status (no uncommitted changes)
- [ ] 1.3 Create backup branch: `git checkout -b backup/before-server-rename`
- [ ] 1.4 Document current test pass rate as baseline

## 2. Directory and File Rename
- [ ] 2.1 Rename directory: `git mv apps/server-nest apps/server`
- [ ] 2.2 Update app package.json name: `apps/server/package.json` (change `"name": "server-nest"` to `"name": "server"`)
- [ ] 2.3 Update Nx project.json name: `apps/server/project.json` (change `"name": "server-nest"` to `"name": "server"`)
- [ ] 2.4 Update Nx project.json commands: Replace all `apps/server-nest` with `apps/server` in command paths

## 3. Workspace Configuration Updates
- [ ] 3.1 Update root package.json workspaces: Change `"apps/server-nest"` to `"apps/server"`
- [ ] 3.2 Update root package.json scripts: Replace `server-nest` with `server` in all script names and commands
- [ ] 3.3 Update nx.json if it contains any server-nest references (check targetDefaults, etc.)

## 4. PM2 Configuration Updates
- [ ] 4.1 Update `tools/workspace-cli/pm2/ecosystem.apps.cjs`: Change `resolveCwd('apps/server-nest')` to `resolveCwd('apps/server')`

## 5. Source Code Updates
- [ ] 5.1 Update `apps/server/src/common/config/config.module.ts`: Replace `apps/server-nest` with `apps/server` in path checks
- [ ] 5.2 Update `apps/server/src/common/logger/log-path.util.ts`: Replace `apps/server-nest` with `apps/server` in path handling
- [ ] 5.3 Update `apps/server/src/modules/openapi/openapi.controller.ts`: Update comment referencing `apps/server-nest/openapi.json`
- [ ] 5.4 Update `apps/server/src/modules/discovery-jobs/discovery-llm.provider.ts`: Update path calculation comments
- [ ] 5.5 Update `apps/server/src/common/database/database.service.ts`: Update path calculation comments
- [ ] 5.6 Update `apps/admin/src/hooks/use-chat.ts`: Update error message mentioning `apps/server-nest`
- [ ] 5.7 Update `apps/admin/e2e/fixtures/app.ts`: Update log directory path reference
- [ ] 5.8 Search for any remaining `server-nest` in source: `rg "server-nest" apps/server/src apps/admin/src`

## 6. Documentation Updates
- [ ] 6.1 Update `openspec/project.md`: Replace `apps/server-nest` with `apps/server` in all references
- [ ] 6.2 Update `AGENTS.md`: Replace `server-nest` with `server` in test commands and examples
- [ ] 6.3 Update `README.md`: Update any server-nest references
- [ ] 6.4 Update `QUICK_START_DEV.md`: Update commands and paths
- [ ] 6.5 Update `.github/copilot-instructions.md`: Update any server-nest references
- [ ] 6.6 Update `.github/instructions/*.instructions.md`: Search and replace server-nest references
- [ ] 6.7 Update `docs/` directory: Replace server-nest with server in all documentation files
- [ ] 6.8 Search entire docs: `rg "server-nest" docs/ .github/`

## 7. OpenSpec Changes Updates
- [ ] 7.1 Update `openspec/changes/document-test-infrastructure/proposal.md`: Replace server-nest paths
- [ ] 7.2 Update `openspec/changes/document-test-infrastructure/design.md`: Replace server-nest paths
- [ ] 7.3 Update `openspec/changes/document-test-infrastructure/tasks.md`: Replace server-nest references
- [ ] 7.4 Update `openspec/changes/document-test-infrastructure/specs/testing/spec.md`: Replace example paths
- [ ] 7.5 Search all openspec changes: `rg "server-nest" openspec/changes/`

## 8. Test Configuration Updates
- [ ] 8.1 Verify vitest configs don't have hardcoded server-nest paths
- [ ] 8.2 Verify jest/vitest setup files don't reference server-nest
- [ ] 8.3 Update any test helper files with hardcoded paths

## 9. Build and Dependency Cleanup
- [ ] 9.1 Remove node_modules from workspace root: `rm -rf node_modules`
- [ ] 9.2 Remove node_modules from apps/server: `rm -rf apps/server/node_modules`
- [ ] 9.3 Remove package-lock.json from workspace root: `rm package-lock.json`
- [ ] 9.4 Remove package-lock.json from apps/server: `rm apps/server/package-lock.json`
- [ ] 9.5 Run clean install: `npm install`

## 10. Validation and Testing
- [ ] 10.1 Verify workspace structure: `ls -la apps/` (should show `admin` and `server`)
- [ ] 10.2 Verify Nx can see server project: `nx show project server --json`
- [ ] 10.3 Build server: `nx run server:build`
- [ ] 10.4 Build admin: `nx run admin:build`
- [ ] 10.5 Start dependencies: `nx run workspace-cli:workspace:deps:start`
- [ ] 10.6 Start services: `nx run workspace-cli:workspace:start`
- [ ] 10.7 Check service status: `nx run workspace-cli:workspace:status`
- [ ] 10.8 View server logs: `nx run workspace-cli:workspace:logs -- --service=server`
- [ ] 10.9 Run server tests: `nx run server:test`
- [ ] 10.10 Run server e2e tests: `nx run server:test-e2e`
- [ ] 10.11 Run admin tests: `nx run admin:test`
- [ ] 10.12 Compare test results with baseline (step 1.4)
- [ ] 10.13 Stop all services: `nx run workspace-cli:workspace:stop`

## 11. Final Verification
- [ ] 11.1 Search for any remaining server-nest references: `rg "server-nest" --type-add 'config:*.{json,cjs,mjs,yaml,yml}' -t config -t ts -t tsx -t js -t jsx -t md`
- [ ] 11.2 Verify no broken imports in TypeScript: `nx run server:build --skip-cache`
- [ ] 11.3 Check git status: `git status` (should show renamed directory and updated files)
- [ ] 11.4 Review all changes: `git diff --staged`

## 12. Commit and Documentation
- [ ] 12.1 Commit changes: `git add -A && git commit -m "refactor: rename server-nest app to server"`
- [ ] 12.2 Create migration note for developers in CHANGELOG.md or MIGRATION.md
- [ ] 12.3 Update this tasks.md to mark all items complete
- [ ] 12.4 Archive this OpenSpec change after deployment

## Notes

- This is a structural refactor with no functional changes
- All tests should continue to pass with the same results as baseline
- The PM2 service name remains `workspace-cli-server` (no change)
- Git will track the rename as a directory move, preserving history
- Developers pulling this change MUST run `npm install` to update workspace links
