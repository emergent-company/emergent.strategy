# Design: Reorganize Environment Variables

## Overview

This change reorganizes environment variables from a flat, mixed structure to a clear hierarchy based on application scope. This improves maintainability, reduces confusion, and establishes clear ownership of configuration.

## Current State

### Problems

1. **Mixed concerns**: Root `.env` contains workspace, server, and admin variables
2. **Duplication**: Variables like `ADMIN_PORT` appear in multiple files
3. **Unclear precedence**: When same variable exists in multiple files, behavior is unclear
4. **Discovery issues**: Developers unsure where to add new variables
5. **Deployment complexity**: Hard to determine minimal required configuration per service

### File Structure (Current)

```
.env                      # Mixed: workspace + server + admin variables
apps/server/.env          # Server variables (some duplicates from root)
apps/admin/.env           # Admin variables (mostly VITE_* prefixed)
```

## Proposed State

### Principles

1. **Single source of truth**: Each variable exists in exactly one canonical location
2. **Scope-based organization**: Variables grouped by which application uses them
3. **Clear precedence**: Application-specific files override shared files
4. **Documented ownership**: Comments clearly indicate variable purpose and scope

### File Structure (Proposed)

```
.env                      # Workspace/shared: NAMESPACE, ports, test users, bootstrap config
apps/server/.env          # Server-only: database, LLM, auth backend, extraction
apps/admin/.env           # Admin-only: VITE_* variables for frontend
```

## Variable Categories

### Category 1: Workspace/Shared (Root `.env`)

**Users**: workspace-cli, bootstrap scripts, multiple applications  
**Examples**: `NAMESPACE`, `ADMIN_PORT`, `SERVER_PORT`, `ZITADEL_DOMAIN`, test user credentials

**Rationale**: These variables coordinate across multiple processes and need to be visible workspace-wide.

### Category 2: Server Application (`apps/server/.env`)

**Users**: NestJS backend exclusively  
**Examples**: Database config, Vertex AI, LLM config, extraction settings, backend auth

**Rationale**: These variables only affect the server application and should be isolated from other concerns.

### Category 3: Admin Frontend (`apps/admin/.env`)

**Users**: React/Vite frontend exclusively  
**Examples**: `VITE_*` prefixed variables for OIDC, API URL, environment flags

**Rationale**: Vite only exposes `VITE_*` prefixed variables to the frontend. These should be separate from backend config.

## Loading Strategy

### Server (`apps/server/src/common/config/config.module.ts`)

```typescript
// Current behavior (already implemented):
1. Load apps/server/.env (via dotenv.config())
2. Load root .env as fallback (dotenv doesn't override existing values)
3. Validate all required variables via config.schema.ts

// Precedence: apps/server/.env > root .env > process.env
```

**No code changes needed** - Current loading already supports this pattern.

### Admin (Vite)

```typescript
// Vite automatically loads:
1. apps/admin/.env
2. apps/admin/.env.local (user-specific overrides)
3. Only VITE_* prefixed vars exposed to frontend

// Precedence: .env.local > .env > process.env
```

**No code changes needed** - Vite's built-in behavior already correct.

### Workspace CLI

```typescript
// tools/workspace-cli loads:
1. Root .env only (via dotenv)
2. Reads NAMESPACE, ADMIN_PORT, SERVER_PORT for PM2 config

// No need to load app-specific variables
```

**No code changes needed** - Already loads root `.env` only.

## Migration Strategy

### Phase 1: Example Files (Safe - no runtime impact)

Update all `.env.example` files with:

- Reorganized variables by category
- Clear section headers and comments
- Cross-references where needed
- Migration notes for existing deployments

### Phase 2: Actual `.env` Files (Requires coordination)

For each environment (dev, staging, production):

1. Backup current `.env` files
2. Create new structure:
   - Move server variables to `apps/server/.env`
   - Move admin variables to `apps/admin/.env`
   - Keep workspace variables in root `.env`
3. Test all services start correctly
4. Remove backups after validation

### Phase 3: Documentation (Ongoing)

- Update `QUICK_START_DEV.md`
- Update setup guides
- Add troubleshooting section
- Create migration guide for deployments

## Backward Compatibility

### Strategy

The server's current loading behavior provides natural backward compatibility:

- Variables in root `.env` will still be loaded as fallback
- Application-specific `.env` files take precedence
- No breaking changes to loading logic

### Deprecation Path

1. **Phase 1** (this change): Reorganize example files, document new structure
2. **Phase 2** (future): Add warnings when variables found in "wrong" location
3. **Phase 3** (future): Eventually require correct placement (breaking change)

**This proposal only implements Phase 1** - safe documentation and example file updates.

## Validation

### Automated Checks

- Server startup validates all required variables via `config.schema.ts`
- Workspace CLI validates `NAMESPACE`, ports via `env-validation.ts`
- Vite build fails if required `VITE_*` variables missing

### Manual Testing

1. Start workspace-cli services: `nx run workspace-cli:workspace:start`
2. Verify server starts: `curl http://localhost:3002/health`
3. Verify admin starts: `curl http://localhost:5176`
4. Run E2E tests: `nx run admin:e2e`

## Risks & Mitigations

| Risk                              | Impact | Likelihood | Mitigation                                                             |
| --------------------------------- | ------ | ---------- | ---------------------------------------------------------------------- |
| Variables missing after migration | High   | Medium     | Provide comprehensive migration guide, maintain backward compatibility |
| Developer confusion               | Medium | Medium     | Clear documentation in all `.env.example` files                        |
| Deployment issues                 | High   | Low        | Test in staging first, provide rollback procedure                      |
| Variable conflicts                | Medium | Low        | Clear precedence rules, validation checks                              |

## Success Metrics

- [ ] All `.env.example` files updated with clear categorization
- [ ] All services start successfully with reorganized variables
- [ ] No duplicate variables across files (except documented cases)
- [ ] Migration guide created and tested
- [ ] Developer documentation updated
- [ ] At least one deployment (dev/staging) migrated successfully

## Open Questions

1. **Should `ADMIN_PORT` be in both root and `apps/admin/.env`?**

   - **Decision**: Keep in root only. Workspace-cli needs it for PM2. Admin app doesn't need it as env var.

2. **Should we add validation for "misplaced" variables?**

   - **Decision**: Not in this change. Add later as Phase 2 improvement.

3. **How to handle user-specific overrides (`.env.local`)?**
   - **Decision**: Keep `.env.local` in root for workspace overrides. Each app can also have its own `.env.local`.

## Future Enhancements

1. Add `opencode` tool to validate variable placement
2. Pre-commit hook to check for common misplacements
3. Automated migration script for deployments
4. Environment variable documentation generator
