# PM2 Cleanup - Files to Remove/Update

This document tracks PM2-related files that need to be removed or updated after migrating to PID-based process management.

## ✅ Status: Ready for Cleanup

The new PID-based system is fully implemented and ready for testing. Once tests pass, these files can be safely removed.

---

## Files to DELETE

### PM2 Ecosystem Configuration

- `tools/workspace-cli/pm2/ecosystem.apps.cjs` - PM2 app config (replaced by application-processes.ts)
- `tools/workspace-cli/pm2/ecosystem.dependencies.cjs` - PM2 dependency config (replaced by dependency-processes.ts)

### PM2 Client & Utilities

- `tools/workspace-cli/src/pm2/client.ts` - PM2 API wrapper (replaced by process/manager.ts)
- `tools/workspace-cli/src/pm2/logrotate.ts` - PM2 logrotate setup (no longer needed)
- `tools/workspace-cli/src/types/pm2.d.ts` - PM2 TypeScript types
- `tools/workspace-cli/types/pm2.d.ts` - PM2 TypeScript types (duplicate)

### Old Command Files (Replaced by -v2 versions)

- `tools/workspace-cli/src/commands/start-service.ts` → Replaced by `start-service-v2.ts`
- `tools/workspace-cli/src/commands/stop-service.ts` → Replaced by `stop-service-v2.ts`
- `tools/workspace-cli/src/commands/restart-service.ts` → Replaced by `restart-service-v2.ts`

### Status Collection (Needs Update or Removal)

- `tools/workspace-cli/src/status/collect.ts` - Uses PM2 client (replaced by status-v2.ts)
- `tools/workspace-cli/src/status/render.ts` - Renders PM2 status (replaced by status-v2.ts)

---

## Files to UPDATE

### Logs Command

**File:** `tools/workspace-cli/src/logs/read.ts`

**Current State:** Uses PM2 and searches both `apps/logs` and `logs` directories

**Required Changes:**

- Remove `import pm2 from 'pm2'`
- Update `LOG_SEARCH_ROOTS` to only use `logs/` directory
- Remove any PM2-specific logic

**Affected Lines:**

- Line 6: `import pm2 from 'pm2';` (remove)
- Lines 29-32: LOG_SEARCH_ROOTS (simplify to only `logs/`)

### Lifecycle Utils

**File:** `tools/workspace-cli/src/commands/lifecycle-utils.ts`

**Current State:** Uses PM2 client for process description

**Options:**

1. Delete if no longer used
2. Update to use new process/manager.ts

### Preflight Checks

**File:** `tools/workspace-cli/src/preflight/checks.ts`

**Current State:** Uses PM2 client to check process status

**Required Changes:**

- Replace `describeProcess` from pm2/client with `getProcessStatus` from process/manager
- Update logic to work with PID-based status

### Index Exports

**File:** `tools/workspace-cli/src/index.ts`

**Current State:** Exports PM2 client

**Required Changes:**

- Remove: `export * from './pm2/client.js';`
- Add: `export * from './process/manager.js';`

---

## Dependencies to REMOVE

**File:** `tools/workspace-cli/package.json`

```json
"dependencies": {
  "pm2": "^5.4.2",           // REMOVE
  "pm2-logrotate": "^2.7.0"   // REMOVE
}
```

Run after removal:

```bash
cd tools/workspace-cli
npm uninstall pm2 pm2-logrotate
```

---

## Directory Cleanup

### Delete PM2 Directory

```bash
rm -rf tools/workspace-cli/pm2/
rm -rf tools/workspace-cli/src/pm2/
```

### Clean Up Old Logs Directory Structure

After migration is complete and all services are using new log structure:

```bash
# Optional: Back up old logs first
tar -czf logs-backup-$(date +%Y%m%d).tar.gz apps/logs/

# Remove old structure
rm -rf apps/logs/
```

---

## Testing Checklist

Before removing PM2 files:

- [ ] Test start command with single service
- [ ] Test start command with all services
- [ ] Test start command with dependencies
- [ ] Test stop command
- [ ] Test restart command
- [ ] Test status command (verify PID and port display)
- [ ] Verify log files are created in `logs/` directory
- [ ] Verify PID files are created in `apps/pids/` directory
- [ ] Test environment variable validation (missing vars)
- [ ] Test graceful shutdown (SIGTERM)
- [ ] Test process cleanup on crash

**Test Script:** `scripts/test-pid-process-management.sh`

---

## Migration Steps

1. **Test New System** ✅ (ready to test)

   ```bash
   ./scripts/test-pid-process-management.sh
   ```

2. **Update Logs Command** (after test passes)

   - Update `logs/read.ts` to remove PM2 imports
   - Update LOG_SEARCH_ROOTS to only use `logs/`

3. **Update Preflight Checks** (after test passes)

   - Replace PM2 client usage with process/manager

4. **Remove Old Files** (after everything works)

   ```bash
   # Remove old command files
   rm tools/workspace-cli/src/commands/start-service.ts
   rm tools/workspace-cli/src/commands/stop-service.ts
   rm tools/workspace-cli/src/commands/restart-service.ts

   # Remove PM2 directories
   rm -rf tools/workspace-cli/pm2/
   rm -rf tools/workspace-cli/src/pm2/
   rm -rf tools/workspace-cli/src/status/

   # Remove PM2 type definitions
   rm tools/workspace-cli/src/types/pm2.d.ts
   rm tools/workspace-cli/types/pm2.d.ts
   ```

5. **Remove PM2 Dependencies** (final step)

   ```bash
   cd tools/workspace-cli
   npm uninstall pm2 pm2-logrotate
   cd ../..
   npm install  # Update lockfile
   ```

6. **Rename -v2 Files** (cleanup naming)

   ```bash
   mv tools/workspace-cli/src/commands/start-service-v2.ts \
      tools/workspace-cli/src/commands/start-service.ts
   mv tools/workspace-cli/src/commands/stop-service-v2.ts \
      tools/workspace-cli/src/commands/stop-service.ts
   mv tools/workspace-cli/src/commands/restart-service-v2.ts \
      tools/workspace-cli/src/commands/restart-service.ts
   mv tools/workspace-cli/src/commands/status-v2.ts \
      tools/workspace-cli/src/commands/status.ts
   ```

7. **Update CLI Imports** (after rename)
   - Update `cli.ts` to import from non-v2 paths

---

## Rollback Plan

If issues are discovered:

1. **Keep PM2 files** until new system is proven stable
2. **CLI can be reverted** by changing imports back to old commands
3. **Old logs** are preserved in `apps/logs/` until cleanup is confirmed
4. **Git revert** is available for all changes

---

## Benefits After Cleanup

- **Smaller bundle size:** Remove PM2 and pm2-logrotate dependencies
- **Simpler codebase:** Remove ~500+ lines of PM2 wrapper code
- **Clearer log structure:** Single `logs/` directory instead of nested structure
- **No daemon:** No PM2 daemon running in background
- **Better debugging:** Direct process management with standard UNIX tools
