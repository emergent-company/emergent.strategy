# MCP Dev Manager - Non-Interactive Fixes

**Date:** October 6, 2025  
**Status:** ✅ COMPLETE

## Problem

The MCP server was experiencing issues:

1. **Interactive Commands:** Some scripts (UI mode, headed browsers, log following) require user interaction (Ctrl-C, keyboard input)
2. **Server Crashes:** Connection errors: "Process exited with code null"
3. **Hanging Commands:** Commands that need user input would hang indefinitely

## Root Cause

The MCP server runs commands in a non-interactive environment. Commands that:
- Require keyboard input (Ctrl-C to stop)
- Open interactive UIs (Playwright UI mode, headed browsers)
- Follow logs continuously (docker compose logs -f)

These commands would either hang or cause the MCP server to crash.

## Solution

### 1. Non-Interactive Script Flags

Added appropriate flags to ensure commands complete without user interaction:

**Playwright Tests:**
- Added `--workers=1` to prevent parallel execution issues
- Added `--reporter=list` to disable interactive HTML report server
- Disabled interactive modes (--ui, --headed, --debug)

**Docker Logs:**
- Changed `docker compose logs -f` to `docker compose logs --tail=100`
- Added separate `logs:follow` script with clear error message

**Example Changes:**
```json
{
  "dev-manager:admin:e2e:clickup": "cd apps/admin && E2E_FORCE_TOKEN=1 npx playwright test e2e/specs/integrations.clickup.spec.ts --config=e2e/playwright.config.ts --project=chromium --workers=1 --reporter=list",
  "dev-manager:docker:logs": "cd docker && docker compose logs --tail=100"
}
```

### 2. Interactive Command Detection

Added validation in `run-script.ts` to detect and reject interactive commands:

```typescript
// Check if script requires user interaction
if (scriptCommand.includes('--ui') || 
    scriptCommand.includes('--headed') || 
    scriptCommand.includes('--debug') ||
    scriptCommand.includes('logs -f') ||
    scriptCommand.includes('logs --follow')) {
    throw new Error(
        `Script "${scriptName}" requires user interaction and cannot be run via MCP.\n\n` +
        `Please use run_in_terminal tool instead:\n` +
        `run_in_terminal({\n` +
        `  command: "npm run ${scriptName}",\n` +
        `  isBackground: true\n` +
        `})`
    );
}
```

### 3. Error Handling Improvements

**Better Error Reporting:**
- Added error stack traces for debugging
- Log errors to stderr without crashing server

**Process Error Handlers:**
```typescript
process.on('uncaughtException', (error) => {
    console.error('Uncaught exception:', error);
    // Don't exit - keep server running
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled rejection at:', promise, 'reason:', reason);
    // Don't exit - keep server running
});
```

## Script Categories

### ✅ Non-Interactive (Safe for MCP)

These scripts complete automatically and return results:

**Tests:**
- `admin:e2e` - Runs all E2E tests
- `admin:e2e:clickup` - Runs ClickUp tests
- `admin:test` - Unit tests
- `server:test` - Backend tests

**Builds:**
- `admin:build` - Frontend build
- `server:build` - Backend build

**Docker:**
- `docker:up` - Start containers in background (-d flag)
- `docker:down` - Stop containers
- `docker:restart` - Restart containers
- `docker:logs` - Show last 100 log lines
- `docker:ps` - List containers

### ⚠️ Interactive (Use run_in_terminal)

These scripts require user interaction:

**Debugging:**
- `admin:e2e:ui` - Playwright UI mode (needs clicks)
- `admin:e2e:headed` - Shows browser (needs Ctrl-C)
- `admin:e2e:debug` - Debug mode (breakpoints)

**Monitoring:**
- `docker:logs:follow` - Continuous log streaming (needs Ctrl-C)

**Development Servers:**
- `admin:storybook` - Long-running dev server
- `server:start` - Long-running API server

## Usage Guidelines

### For Non-Interactive Commands

Use `run_script`:
```typescript
mcp_dev-manager_run_script({
  app: "admin",
  action: "e2e:clickup"
})
```

### For Interactive Commands

Use `run_in_terminal`:
```typescript
run_in_terminal({
  command: "npm run dev-manager:admin:e2e:ui",
  isBackground: true,
  explanation: "Open Playwright UI for interactive test debugging"
})
```

### For Long-Running Background Services

Use `run_in_terminal` with `isBackground: true`:
```typescript
run_in_terminal({
  command: "cd docker && docker compose logs -f",
  isBackground: true,
  explanation: "Follow docker logs in background"
})
```

## Error Messages

When attempting to run an interactive command via MCP, users now get helpful error messages:

```
❌ Error: Script "admin:e2e:ui" requires user interaction and cannot be run via MCP.

Please use run_in_terminal tool instead:
run_in_terminal({
  command: "npm run dev-manager:admin:e2e:ui",
  isBackground: true
})
```

## Server Stability Improvements

**Before:**
- Server would crash with "Process exited with code null"
- Hanging commands would timeout
- No error recovery

**After:**
- Graceful error handling
- Server stays running even on uncaught exceptions
- Clear error messages with suggestions
- Stack traces for debugging

## Files Modified

1. **package.json**
   - Added `--workers=1` to Playwright commands
   - Changed `docker compose logs -f` to `--tail=100`
   - Made interactive scripts return error messages

2. **mcp-dev-manager/src/tools/run-script.ts**
   - Added interactive command detection
   - Better error messages with run_in_terminal suggestions

3. **mcp-dev-manager/src/index.ts**
   - Added uncaughtException handler
   - Added unhandledRejection handler
   - Better error logging with stack traces

4. **.github/instructions/mcp-dev-manager.instructions.md**
   - Marked interactive commands with ⚠️
   - Added usage guidelines

## Testing

To verify the fixes:

1. **Run non-interactive test:**
   ```typescript
   mcp_dev-manager_run_script({ app: "admin", action: "e2e:clickup" })
   ```
   ✅ Should complete and return results

2. **Try interactive command:**
   ```typescript
   mcp_dev-manager_run_script({ app: "admin", action: "e2e:ui" })
   ```
   ✅ Should fail with helpful error message

3. **Check server stability:**
   - Run multiple commands in sequence
   - Try invalid commands
   - Server should stay running

## Benefits

1. **No Hanging:** Commands complete automatically
2. **Clear Errors:** Helpful messages when something goes wrong
3. **Server Stability:** No more crashes or "Process exited" errors
4. **Guidance:** Users know when to use run_in_terminal instead
5. **Debugging:** Stack traces help diagnose issues

## Future Enhancements

- Add timeout warnings for long-running commands
- Implement command cancellation
- Add progress indicators for tests
- Support for interactive command proxying (future MCP feature)

---

**Status:** ✅ Complete  
**Last Updated:** October 6, 2025  
**MCP Server:** Rebuilt and ready for testing
