# Automate Environment Variable Updates in Bootstrap Script

## Status
Proposed

## Category
Developer Experience

## Priority
High

## Problem Statement

### Current State
The `bootstrap-zitadel-fully-automated.sh` script successfully creates OAuth applications and generates client IDs, but:

1. **Manual Updates Required**: After provisioning, developers must manually:
   - Update `VITE_ZITADEL_CLIENT_ID` in Infisical `/admin` path
   - Re-export `.env` files using `env-export.sh`
   - Restart Vite dev server to pick up new environment variables

2. **Vite Environment Variable Caching**: Vite embeds `VITE_*` variables at dev server start time. Simply restarting the process isn't enough - the dev server must be fully stopped and started.

3. **Port Configuration Issues**: Docker Compose doesn't automatically use `docker/.env` file unless explicitly specified with `--env-file` flag, causing Zitadel to start on wrong ports (8100 instead of 8200).

### Impact
- Increases setup time and complexity
- Creates confusion when OAuth fails with "App not found" errors
- Requires developers to understand Vite's build-time environment variable behavior
- Easy to forget steps, leading to hard-to-debug authentication failures

## Proposed Solution

### 1. Enhance Bootstrap Script

Add automatic environment updates to the bootstrap script:

```bash
# After creating OAuth app, automatically update Infisical
if [ -n "$OAUTH_CLIENT_ID" ]; then
    echo -e "${BLUE}Updating admin app configuration...${NC}"
    infisical secrets set VITE_ZITADEL_CLIENT_ID "${OAUTH_CLIENT_ID}" \
        --env="${INFISICAL_ENV}" --path="/admin" $DOMAIN_FLAG --silent
    echo -e "${GREEN}✓ Updated VITE_ZITADEL_CLIENT_ID in Infisical /admin${NC}"
fi

# Re-export .env files
echo -e "${BLUE}Re-exporting .env files...${NC}"
./scripts/env-export.sh --path /admin --overwrite
./scripts/env-export.sh --path /server --overwrite

# Restart services to pick up new configuration
echo -e "${BLUE}Restarting services...${NC}"
nx run workspace-cli:workspace:restart
```

### 2. Fix Docker Compose Port Configuration

Update `workspace-cli` to always use `--env-file` flag:

```typescript
// In workspace-cli/src/services/dependency.service.ts
const composeCommand = [
  'docker', 'compose',
  '-f', 'docker-compose.dev.yml',
  '--env-file', 'docker/.env',  // Always specify env file
  ...args
];
```

### 3. Add Vite Dev Server Restart Logic

Create a helper script `scripts/restart-vite-dev.sh`:

```bash
#!/bin/bash
# Properly restart Vite dev server to reload environment variables

echo "Stopping admin service..."
nx run workspace-cli:workspace:stop --service admin

echo "Waiting for process to fully terminate..."
sleep 2

echo "Starting admin service with fresh environment..."
nx run workspace-cli:workspace:start --service admin

echo "✓ Vite dev server restarted - environment variables reloaded"
```

### 4. Document Environment Variable Behavior

Add to `docs/guides/ENVIRONMENT_VARIABLES.md`:

```markdown
## Vite Environment Variables (`VITE_*`)

Vite variables are embedded at **dev server start time**, not runtime:

- Changes to `.env` files require **full restart** (stop → start), not just reload
- Use `nx run workspace-cli:workspace:restart -- --service admin` after updating
- Alternatively: `./scripts/restart-vite-dev.sh`

### Debugging
If OAuth still uses old client ID after updating `.env`:
1. Check `apps/admin/.env` has correct `VITE_ZITADEL_CLIENT_ID`
2. Fully restart admin: `nx run workspace-cli:workspace:restart -- --service admin`
3. Clear browser cache/localStorage
4. Check browser DevTools → Network → Request URL for client_id parameter
```

## Implementation Plan

### Phase 1: Bootstrap Script Enhancement
1. Add Infisical update for `/admin` path
2. Add automatic `env-export.sh` invocation
3. Add service restart logic
4. Update help text and documentation

### Phase 2: Docker Compose Fix
1. Update `workspace-cli` to use `--env-file docker/.env`
2. Test that ports remain consistent across restarts
3. Document the change in `RUNBOOK.md`

### Phase 3: Documentation
1. Create `docs/guides/ENVIRONMENT_VARIABLES.md`
2. Add troubleshooting section to `RUNBOOK.md`
3. Update bootstrap script README

## Testing

### Test Cases
1. **Fresh Bootstrap**:
   - Run `bootstrap-zitadel-fully-automated.sh provision --push-to-infisical`
   - Verify `apps/admin/.env` has new client ID
   - Verify admin app OAuth uses correct client ID
   - Verify no manual steps required

2. **Docker Port Consistency**:
   - Start Docker: `nx run workspace-cli:workspace:start`
   - Verify Zitadel on port 8200
   - Restart: `nx run workspace-cli:workspace:restart`
   - Verify still on port 8200

3. **Vite Environment Reload**:
   - Change `VITE_ZITADEL_CLIENT_ID` in `.env`
   - Restart admin service
   - Verify new client ID used in OAuth requests

## Alternatives Considered

### Alternative 1: Runtime Environment Variables
**Approach**: Use runtime config instead of build-time `import.meta.env`

**Pros**:
- No restart needed after changes
- More flexible

**Cons**:
- Requires fetching config from API endpoint
- Adds complexity and potential failure points
- Goes against Vite best practices

**Decision**: Rejected - Stick with Vite conventions, improve tooling instead

### Alternative 2: Manual Process
**Approach**: Keep current manual process, just document better

**Pros**:
- No code changes needed
- More explicit control

**Cons**:
- Error-prone
- Time-consuming
- Bad developer experience

**Decision**: Rejected - Automation is better

## Success Metrics

- **Setup Time**: Reduce from ~10 minutes to ~2 minutes
- **Error Rate**: Zero "App not found" errors after bootstrap
- **Developer Feedback**: Positive feedback on streamlined setup

## Security Considerations

- Infisical API token must be present (already required)
- No new secrets exposed
- Automated updates use same security model as manual updates

## Migration Impact

- **Existing Deployments**: No impact - script is backwards compatible
- **CI/CD**: No changes needed
- **Documentation**: Update setup guides to reflect new automated process

## Related Issues

- Bug #002: Infisical export trailing newlines
- Port configuration inconsistency (8100 vs 8200)
- OAuth "invalid_request: App not found" errors

## References

- Vite Environment Variables: https://vitejs.dev/guide/env-and-mode
- Bootstrap Script: `scripts/bootstrap-zitadel-fully-automated.sh`
- Environment Export: `scripts/env-export.sh`
- Workspace CLI: `tools/workspace-cli/`
