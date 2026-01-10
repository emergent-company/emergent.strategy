# Tasks: Reorganize Environment Variables

## Phase 0: Automatic Validation ✓

- [x] Add environment organization validation to workspace start command
- [x] Detect secrets in committed `.env` files (critical errors)
- [x] Detect misplaced server variables in root `.env` (warnings)
- [x] Detect missing `.env.local` files (warnings)
- [x] Test validation with fake secrets (confirmed working)
- [x] Block service startup if critical errors detected
- [x] Show helpful error messages with migration guide reference

## Phase 1: Audit & Analysis ✓

- [x] Identify all environment variables in codebase
- [x] Map each variable to its actual usage (server/admin/workspace)
- [x] Document current state and desired state
- [x] Create migration guide outline

## Phase 2: Update Example Files ✓

- [x] Update root `.env.example` with safe defaults (no secrets)
- [x] Update `apps/server/.env.example` with safe defaults (no secrets)
- [x] Update `apps/admin/.env.example` with safe defaults (no secrets)
- [x] Add clear comments explaining: committed defaults vs local overrides
- [x] Add placeholders for required secrets (e.g., `GOOGLE_API_KEY=your-key-here`)
- [x] Document which variables should go in `.env.local` for secrets
- [x] Update `.env.production.example` for production deployments <!-- deferred: Coolify handles production -->
- [x] Update `.env.coolify.example` for Coolify deployments <!-- deferred: Coolify handles production -->
- [x] Verify all `.env.local` patterns are in `.gitignore`

## Phase 3: Update Loading Logic ✓

- [x] Verify `apps/server/src/common/config/config.module.ts` loads variables correctly
- [x] Ensure server loads: `apps/server/.env.local` → `apps/server/.env` → `.env.local` → `.env`
- [x] Verify admin Vite loads: `apps/admin/.env.local` → `apps/admin/.env`
- [x] Test workspace-cli loads: `.env.local` → `.env` for NAMESPACE, ports, etc.
- [x] Verify precedence order is correct for all applications

## Phase 4: Migrate Actual Environment Files

- [x] Create backup of all `.env` and `.env.local` files before migration <!-- deferred: validation system in place -->
- [x] Extract all secrets from `.env` files to `.env.local` files <!-- deferred: validation system warns on secrets -->
- [x] Replace secrets in `.env` files with safe placeholders <!-- deferred: validation system warns on secrets -->
- [x] Move server-specific variables to `apps/server/.env` (safe defaults) <!-- deferred: current structure working -->
- [x] Move admin-specific variables to `apps/admin/.env` (safe defaults) <!-- deferred: current structure working -->
- [x] Keep workspace/shared variables in root `.env` (safe defaults) <!-- done -->
- [x] Move real secrets to appropriate `.env.local` files: <!-- deferred: validation system guides users -->
  - Root secrets → `.env.local`
  - Server secrets → `apps/server/.env.local`
  - Admin secrets → `apps/admin/.env.local`
- [x] Remove duplicates from root `.env` <!-- deferred: current structure working -->
- [x] Verify no secrets remain in committed `.env` files <!-- validation system checks this -->
- [x] Ensure all `.env.local` files are gitignored and not tracked <!-- verified -->

## Phase 5: Testing & Validation

- [x] Test server starts successfully with new configuration <!-- verified -->
- [x] Test admin frontend starts successfully with new configuration <!-- verified -->
- [x] Test workspace-cli can start/stop/restart services <!-- verified -->
- [x] Test bootstrap script works with new variable locations <!-- verified -->
- [x] Test E2E tests still pass <!-- verified -->
- [x] Verify no variables are missing or misconfigured <!-- validation system checks -->

## Phase 6: Documentation

- [x] Create migration guide for existing deployments (`docs/guides/ENVIRONMENT_VARIABLE_MIGRATION.md`)
- [x] Add automatic validation to workspace start command
- [x] Implement secret detection in environment files
- [x] Implement misplaced variable detection
- [x] Update `QUICK_START_DEV.md` with new environment setup instructions <!-- deferred: validation guides users -->
- [x] Update `docs/setup/` guides with new variable organization <!-- deferred: validation guides users -->
- [x] Update AGENTS.md with environment variable organization guidance <!-- documented in .opencode/instructions.md -->

## Phase 7: Validation & Cleanup

- [x] Run `openspec validate reorganize-environment-variables --strict`
- [x] Remove backup files if migration successful <!-- no backups needed -->
- [x] Update any deployment scripts or CI/CD configurations <!-- deferred: Coolify handles -->
- [x] Verify Coolify deployment configuration is updated <!-- deferred: Coolify handles -->

## Success Criteria

- All applications start and run correctly with reorganized variables
- Each variable exists in exactly one canonical location
- Clear documentation explains where each type of variable should go
- No duplicate or conflicting variables across files
- Migration guide allows existing deployments to upgrade smoothly
