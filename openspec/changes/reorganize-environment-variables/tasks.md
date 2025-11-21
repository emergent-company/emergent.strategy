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
- [ ] Update `.env.production.example` for production deployments
- [ ] Update `.env.coolify.example` for Coolify deployments
- [x] Verify all `.env.local` patterns are in `.gitignore`

## Phase 3: Update Loading Logic ✓

- [x] Verify `apps/server/src/common/config/config.module.ts` loads variables correctly
- [x] Ensure server loads: `apps/server/.env.local` → `apps/server/.env` → `.env.local` → `.env`
- [x] Verify admin Vite loads: `apps/admin/.env.local` → `apps/admin/.env`
- [x] Test workspace-cli loads: `.env.local` → `.env` for NAMESPACE, ports, etc.
- [x] Verify precedence order is correct for all applications

## Phase 4: Migrate Actual Environment Files

- [ ] Create backup of all `.env` and `.env.local` files before migration
- [ ] Extract all secrets from `.env` files to `.env.local` files
- [ ] Replace secrets in `.env` files with safe placeholders
- [ ] Move server-specific variables to `apps/server/.env` (safe defaults)
- [ ] Move admin-specific variables to `apps/admin/.env` (safe defaults)
- [ ] Keep workspace/shared variables in root `.env` (safe defaults)
- [ ] Move real secrets to appropriate `.env.local` files:
  - Root secrets → `.env.local`
  - Server secrets → `apps/server/.env.local`
  - Admin secrets → `apps/admin/.env.local`
- [ ] Remove duplicates from root `.env`
- [ ] Verify no secrets remain in committed `.env` files
- [ ] Ensure all `.env.local` files are gitignored and not tracked

## Phase 5: Testing & Validation

- [ ] Test server starts successfully with new configuration
- [ ] Test admin frontend starts successfully with new configuration
- [ ] Test workspace-cli can start/stop/restart services
- [ ] Test bootstrap script works with new variable locations
- [ ] Test E2E tests still pass
- [ ] Verify no variables are missing or misconfigured

## Phase 6: Documentation

- [x] Create migration guide for existing deployments (`docs/guides/ENVIRONMENT_VARIABLE_MIGRATION.md`)
- [x] Add automatic validation to workspace start command
- [x] Implement secret detection in environment files
- [x] Implement misplaced variable detection
- [ ] Update `QUICK_START_DEV.md` with new environment setup instructions
- [ ] Update `docs/setup/` guides with new variable organization
- [ ] Update AGENTS.md with environment variable organization guidance

## Phase 7: Validation & Cleanup

- [ ] Run `openspec validate reorganize-environment-variables --strict`
- [ ] Remove backup files if migration successful
- [ ] Update any deployment scripts or CI/CD configurations
- [ ] Verify Coolify deployment configuration is updated

## Success Criteria

- All applications start and run correctly with reorganized variables
- Each variable exists in exactly one canonical location
- Clear documentation explains where each type of variable should go
- No duplicate or conflicting variables across files
- Migration guide allows existing deployments to upgrade smoothly
