# Tasks: Reorganize Environment Variables

## Phase 1: Audit & Analysis ✓

- [x] Identify all environment variables in codebase
- [x] Map each variable to its actual usage (server/admin/workspace)
- [x] Document current state and desired state
- [x] Create migration guide outline

## Phase 2: Update Example Files

- [ ] Update root `.env.example` with workspace/shared variables only
- [ ] Update `apps/server/.env.example` with server-specific variables
- [ ] Update `apps/admin/.env.example` with admin-specific variables
- [ ] Add clear comments explaining variable scope and purpose
- [ ] Update `.env.production.example` for production deployments
- [ ] Update `.env.coolify.example` for Coolify deployments

## Phase 3: Update Loading Logic

- [ ] Verify `apps/server/src/common/config/config.module.ts` loads variables correctly
- [ ] Ensure server can read both `apps/server/.env` and root `.env` (with proper precedence)
- [ ] Verify admin Vite loads `apps/admin/.env` and `.env.local` correctly
- [ ] Test workspace-cli still loads root `.env` for NAMESPACE, ports, etc.

## Phase 4: Migrate Actual Environment Files

- [ ] Create backup of all `.env` files before migration
- [ ] Move server-specific variables to `apps/server/.env`
- [ ] Move admin-specific variables to `apps/admin/.env`
- [ ] Keep workspace/shared variables in root `.env`
- [ ] Remove duplicates from root `.env`
- [ ] Update `.env.local` if it exists

## Phase 5: Testing & Validation

- [ ] Test server starts successfully with new configuration
- [ ] Test admin frontend starts successfully with new configuration
- [ ] Test workspace-cli can start/stop/restart services
- [ ] Test bootstrap script works with new variable locations
- [ ] Test E2E tests still pass
- [ ] Verify no variables are missing or misconfigured

## Phase 6: Documentation

- [ ] Create migration guide for existing deployments
- [ ] Update `QUICK_START_DEV.md` with new environment setup instructions
- [ ] Update `docs/setup/` guides with new variable organization
- [ ] Add troubleshooting section for common migration issues
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
