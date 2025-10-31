# PM2 Project Prefixing Implementation - Session Summary

**Date**: 2025-10-22  
**Duration**: ~30 minutes  
**Status**: ✅ Complete and Tested

## Problem Statement

User discovered that the workspace CLI was showing processes from a different project instance (`spec-server-2`) when running in the `spec-server` directory. This was caused by PM2's global daemon architecture where all processes from all projects share the same namespace.

### Symptoms
- Running `npm run workspace:status` showed services on ports 5176/3002 instead of 5175/3001
- `pm2 list` showed processes from both project instances
- `pm2 info admin` revealed `exec cwd: /Users/mcj/code/spec-server-2` instead of current directory
- Confusion about which project instance was actually running

## Root Cause

PM2 uses a single global daemon (`~/.pm2/`) for the entire system. When multiple clones of the same project exist (e.g., `spec-server` and `spec-server-2`), they all use identical process names:
- `admin`
- `server`
- `postgres-dependency`
- `zitadel-dependency`

This caused PM2 to treat processes from different project instances as the same, leading to:
1. Wrong project's processes appearing in status output
2. Inability to distinguish which instance is running
3. Potential for commands to affect the wrong project

## Solution Implemented

Added **automatic project-specific prefixing** to all PM2 process names using the directory basename.

### Changes Made

#### 1. Ecosystem Configurations

**File**: `tools/workspace-cli/pm2/ecosystem.apps.cjs`
- Added: `const projectName = path.basename(repoRoot);`
- Added: `const APP_PREFIX = \`${projectName}-\`;`
- Changed: `name: 'admin'` → `name: \`${APP_PREFIX}admin\``
- Changed: `name: 'server'` → `name: \`${APP_PREFIX}server\``

**File**: `tools/workspace-cli/pm2/ecosystem.dependencies.cjs`
- Added: Same prefix calculation logic
- Changed: `name: 'postgres-dependency'` → `name: \`${APP_PREFIX}postgres-dependency\``
- Changed: `name: 'zitadel-dependency'` → `name: \`${APP_PREFIX}zitadel-dependency\``

#### 2. Workspace CLI Updates

Added `getProjectPrefix()` helper function to all command files:
```typescript
function getProjectPrefix(): string {
  const repoRoot = path.resolve(process.cwd());
  const projectName = path.basename(repoRoot);
  return `${projectName}-`;
}
```

**Files Modified**:
- `tools/workspace-cli/src/commands/start-service.ts`
  - Updated `getEcosystemEntry()` to look for `${prefix}${serviceId}`
  - Updated `getDependencyEcosystemEntry()` to look for `${prefix}${dependencyId}-dependency`
  
- `tools/workspace-cli/src/commands/stop-service.ts`
  - Updated `resolveProcessName()` with prefix logic
  - Updated `resolveDependencyProcessName()` with prefix logic
  
- `tools/workspace-cli/src/commands/restart-service.ts`
  - Updated `resolveProcessName()` with prefix logic
  - Updated `resolveDependencyProcessName()` with prefix logic
  
- `tools/workspace-cli/src/status/collect.ts`
  - Updated `resolveApplicationProcessName()` with prefix logic
  - Updated `resolveDependencyProcessName()` with prefix logic

#### 3. Error Messages Enhanced

Updated error messages to show expected prefixed names:
```typescript
throw new Error(`Missing PM2 ecosystem entry for service: ${serviceId} (expected name: ${expectedName})`);
```

## Testing

### Build Verification
```bash
npx nx run workspace-cli:build
# ✅ Build successful
```

### Service Restart
```bash
npm run workspace:stop
npm run workspace:deps:stop
npm run workspace:deps:start
npm run workspace:start
# ✅ All services started with prefixed names
```

### PM2 Process List
```bash
npx pm2 list
# Before: admin, server, postgres-dependency, zitadel-dependency
# After: spec-server-admin, spec-server-server, spec-server-postgres-dependency, spec-server-zitadel-dependency
```

### Status Verification
```bash
npm run workspace:status
# ✅ Shows correct ports: 5175 (admin), 3001 (server)
# ✅ All services online and healthy
```

### Accessibility Test
```bash
curl http://localhost:5175/
# ✅ Returns 200 OK - Admin accessible on correct port
```

## Results

### Before
- PM2 showed processes from `spec-server-2` when running commands in `spec-server`
- Admin on port 5176, Server on port 3002 (wrong instance)
- Confusion about which project was actually running
- Cannot run multiple project instances reliably

### After
- PM2 clearly shows which project each process belongs to
- Admin on port 5175, Server on port 3001 (correct instance!)
- Each project instance has uniquely identifiable processes
- Multiple project instances can run simultaneously without collision

### Process Name Examples

**Project: `/Users/mcj/code/spec-server`**
- `spec-server-admin` (port 5175)
- `spec-server-server` (port 3001)
- `spec-server-postgres-dependency`
- `spec-server-zitadel-dependency`

**Project: `/Users/mcj/code/spec-server-2`** (if running)
- `spec-server-2-admin` (port 5176)
- `spec-server-2-server` (port 3002)
- `spec-server-2-postgres-dependency`
- `spec-server-2-zitadel-dependency`

## Migration Steps for Users

If you have existing unprefixed processes:

1. Stop all services:
   ```bash
   npm run workspace:stop
   npm run workspace:deps:stop
   ```

2. Delete old unprefixed processes (if still running):
   ```bash
   npx pm2 delete admin server postgres-dependency zitadel-dependency
   ```

3. Start services with new prefixed names:
   ```bash
   npm run workspace:deps:start
   npm run workspace:start
   ```

4. Save PM2 state:
   ```bash
   npx pm2 save
   ```

## Files Created/Modified

### Created
- `docs/PM2_PROJECT_PREFIXING.md` - Comprehensive documentation

### Modified - Ecosystem Configs
- `tools/workspace-cli/pm2/ecosystem.apps.cjs`
- `tools/workspace-cli/pm2/ecosystem.dependencies.cjs`

### Modified - Workspace CLI
- `tools/workspace-cli/src/commands/start-service.ts`
- `tools/workspace-cli/src/commands/stop-service.ts`
- `tools/workspace-cli/src/commands/restart-service.ts`
- `tools/workspace-cli/src/status/collect.ts`

## Benefits

1. **Clear Identification**: Process list shows which project each process belongs to
2. **No Collisions**: Multiple project instances can run simultaneously without interference
3. **Correct Operations**: Workspace CLI commands affect only the current project's processes
4. **Better Debugging**: Logs and status output clearly indicate project context
5. **Zero Developer Overhead**: Prefixing is completely automatic

## Next Steps

Now that the workspace is properly isolated and running on the correct ports:

1. ✅ Test monitoring dashboard at `http://localhost:5175/admin/monitoring/dashboard`
2. ✅ Verify API endpoints respond correctly
3. ✅ Review user's file changes to monitoring components
4. ✅ Test with live extraction job data

## Architecture Notes

### PM2 Global Daemon
- Location: `~/.pm2/`
- Scope: System-wide (all users, all projects)
- Namespaces: Logical grouping within daemon (we use `workspace-cli` and `workspace-cli-deps`)
- Process Names: Must be unique across entire system

### Prefix Strategy
- **Source**: Directory basename (e.g., `spec-server`, `spec-server-2`)
- **Application**: Automatic via ecosystem config and CLI
- **Pattern**: `${directoryName}-${serviceName}`
- **Consistency**: Same logic in ecosystem files and TypeScript CLI

### Why This Works
- Each project instance gets a unique prefix based on its directory location
- PM2 sees distinct process names even though ecosystem configs are identical
- Workspace CLI commands correctly resolve process names using same prefix logic
- No manual configuration required - just works based on directory structure

## Lessons Learned

1. **PM2 is Global**: Always remember PM2's daemon is system-wide, not per-project
2. **Name Collisions**: Identical process names across projects cause confusion
3. **Dynamic Prefixes**: Using directory basename provides automatic, deterministic prefixing
4. **Consistency Critical**: Ecosystem configs and CLI must use identical prefix logic
5. **Thorough Testing**: Rebuild CLI, restart services, verify ports, check accessibility

## Success Metrics

- ✅ CLI builds without errors
- ✅ Services start with prefixed names
- ✅ Status shows correct ports (5175, 3001)
- ✅ Admin accessible at http://localhost:5175
- ✅ Old unprefixed processes cleaned up
- ✅ PM2 state saved
- ✅ Documentation created

**Status**: 🎉 **Production Ready** - Safe to merge and deploy
