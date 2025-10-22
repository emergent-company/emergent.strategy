# PM2 Project Prefixing

## Problem

PM2 uses a global daemon (`~/.pm2/`) that manages processes for all projects on the system. When running multiple instances of the same project (e.g., `spec-server` and `spec-server-2`), processes from different projects could collide because they used the same names (e.g., `admin`, `server`, `postgres-dependency`).

This caused confusion when:
- Running `pm2 list` from one project showed processes from another project
- Running `workspace:status` showed the wrong project's services
- Attempting to access services on default ports would connect to the wrong instance

## Solution

We've implemented **automatic project prefixing** for all PM2 process names. The prefix is derived from the project directory name.

### How It Works

1. **Ecosystem Configs** (`tools/workspace-cli/pm2/ecosystem.*.cjs`):
   - Calculate prefix: `const projectName = path.basename(repoRoot);`
   - Apply prefix to all process names: `` name: `${projectName}-admin` ``

2. **Workspace CLI** (`tools/workspace-cli/src/commands/*.ts` and `tools/workspace-cli/src/status/collect.ts`):
   - Added `getProjectPrefix()` helper function
   - Updated all ecosystem name lookups to include prefix
   - Updated error messages to show expected prefixed names

### Example

For a project in `/Users/mcj/code/spec-server`:
- **Old names**: `admin`, `server`, `postgres-dependency`, `zitadel-dependency`
- **New names**: `spec-server-admin`, `spec-server-server`, `spec-server-postgres-dependency`, `spec-server-zitadel-dependency`

For a project in `/Users/mcj/code/spec-server-2`:
- **Names**: `spec-server-2-admin`, `spec-server-2-server`, `spec-server-2-postgres-dependency`, `spec-server-2-zitadel-dependency`

## Benefits

1. **Clear Identification**: Process list shows which project each process belongs to
2. **No Collisions**: Multiple project instances can run simultaneously without interference
3. **Correct Operations**: Workspace CLI commands affect only the current project's processes
4. **Better Debugging**: Logs and status output clearly indicate project context

## Usage

No changes required from developers! The prefixing is automatic:

```bash
# Start services (uses current directory name as prefix)
npm run workspace:start

# Check status (shows prefixed names)
npm run workspace:status

# View PM2 list (shows all projects with prefixes)
npx pm2 list
```

## Files Modified

### Ecosystem Configs
- `tools/workspace-cli/pm2/ecosystem.apps.cjs` - Added prefix to admin and server
- `tools/workspace-cli/pm2/ecosystem.dependencies.cjs` - Added prefix to postgres-dependency and zitadel-dependency

### Workspace CLI
- `tools/workspace-cli/src/commands/start-service.ts` - Updated ecosystem entry lookups
- `tools/workspace-cli/src/commands/stop-service.ts` - Updated ecosystem entry lookups
- `tools/workspace-cli/src/commands/restart-service.ts` - Updated ecosystem entry lookups
- `tools/workspace-cli/src/status/collect.ts` - Updated process name resolution

## Migration

If you have existing unprefixed processes:

1. **Stop all services** in the project:
   ```bash
   npm run workspace:stop
   npm run workspace:deps:stop
   ```

2. **Delete old unprefixed processes** (if still running):
   ```bash
   npx pm2 delete admin server postgres-dependency zitadel-dependency
   ```

3. **Start services with new prefixed names**:
   ```bash
   npm run workspace:deps:start
   npm run workspace:start
   ```

4. **Save PM2 state**:
   ```bash
   npx pm2 save
   ```

## Troubleshooting

### "Conflicting PM2 process detected"

If you see an error like:
```
Conflicting PM2 process detected for spec-server-admin. 
Expected namespace workspace-cli, found workspace-cli-deps.
```

This means an old process exists with the new name. Delete it:
```bash
npx pm2 delete spec-server-admin
npm run workspace:start
```

### Process list shows unprefixed names

Old processes from before the update are still running. Clean them up:
```bash
# Find old processes
npx pm2 list | grep -E "admin|server|postgres-dependency|zitadel-dependency"

# Delete them
npx pm2 delete <process-name>
```

### Status shows wrong project

Make sure you're in the correct project directory:
```bash
pwd  # Should show /Users/mcj/code/spec-server (or spec-server-2, etc.)
npm run workspace:status
```

## Technical Details

### Prefix Calculation

```javascript
// In ecosystem files and CLI
const repoRoot = path.resolve(process.cwd());
const projectName = path.basename(repoRoot);
const prefix = `${projectName}-`;
```

### Name Pattern

- **Applications**: `${prefix}${serviceId}` (e.g., `spec-server-admin`)
- **Dependencies**: `${prefix}${dependencyId}-dependency` (e.g., `spec-server-postgres-dependency`)

### Namespace

All processes still use the same namespace (`workspace-cli` for apps, `workspace-cli-deps` for dependencies) to maintain logical grouping within each project.
