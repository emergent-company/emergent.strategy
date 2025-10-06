# MCP Dev Manager - Script-Based Architecture

**Date:** October 6, 2025  
**Status:** ✅ COMPLETE

## Overview

The MCP Dev Manager has been upgraded to use a **script-based architecture** that eliminates the need to know file paths, working directories, or command-line flags. All development tasks are now accessible via standardized npm scripts with a `dev-manager:` prefix.

## Problem Solved

**Before:** AI had to know:
- Exact file paths (e.g., `apps/admin/e2e/specs/integrations.clickup.spec.ts`)
- Working directories (e.g., `apps/admin`)
- Config file locations (e.g., `e2e/playwright.config.ts`)
- Command-line flags (e.g., `E2E_FORCE_TOKEN=1`, `--project=chromium`)

**After:** AI only needs to know:
- App name: `admin`, `server`, or `docker`
- Action: `e2e:clickup`, `build`, `test`, etc.

## Architecture

### Script Naming Convention

All dev-manager scripts follow this pattern:
```
dev-manager:{app}:{action}
```

Examples:
- `dev-manager:admin:e2e:clickup` - Run ClickUp E2E tests
- `dev-manager:admin:build` - Build admin app
- `dev-manager:server:test` - Run server unit tests
- `dev-manager:docker:up` - Start docker containers

### Tool Interface

Two new MCP tools provide the interface:

#### 1. `run_script` - Execute a development task

**Option A: Use app + action**
```typescript
mcp_dev-manager_run_script({
  app: "admin",
  action: "e2e:clickup"
})
```

**Option B: Use full script name**
```typescript
mcp_dev-manager_run_script({
  script: "admin:e2e:clickup"  // or "dev-manager:admin:e2e:clickup"
})
```

#### 2. `list_scripts` - Discover available tasks

```typescript
mcp_dev-manager_list_scripts()
```

Returns a categorized list of all available scripts, grouped by app (admin, server, docker).

## Available Scripts

### Admin (Frontend)
- `admin:e2e` - Run all E2E tests
- `admin:e2e:clickup` - Run ClickUp integration tests
- `admin:e2e:chat` - Run chat E2E tests
- `admin:e2e:ui` - Run tests in Playwright UI mode
- `admin:e2e:headed` - Run tests in headed browser
- `admin:e2e:debug` - Run tests in debug mode
- `admin:build` - Build admin app
- `admin:test` - Run unit tests
- `admin:test:coverage` - Run tests with coverage
- `admin:storybook` - Start Storybook

### Server (Backend)
- `server:test` - Run unit tests
- `server:test:e2e` - Run E2E API tests
- `server:test:coverage` - Run tests with coverage
- `server:build` - Build server
- `server:start` - Start dev server

### Docker
- `docker:up` - Start all containers
- `docker:down` - Stop all containers
- `docker:restart` - Restart containers
- `docker:logs` - View container logs

## Implementation Details

### package.json Scripts

All scripts are defined in the root `package.json`:

```json
{
  "scripts": {
    "dev-manager:admin:e2e": "cd apps/admin && E2E_FORCE_TOKEN=1 npx playwright test e2e/specs --config=e2e/playwright.config.ts --project=chromium",
    "dev-manager:admin:e2e:clickup": "cd apps/admin && E2E_FORCE_TOKEN=1 npx playwright test e2e/specs/integrations.clickup.spec.ts --config=e2e/playwright.config.ts --project=chromium",
    "dev-manager:admin:build": "npm --prefix apps/admin run build",
    "dev-manager:server:test": "npm --prefix apps/server-nest run test",
    "dev-manager:docker:up": "cd docker && docker compose up -d"
    // ... more scripts
  }
}
```

### MCP Tool Implementation

New file: `mcp-dev-manager/src/tools/run-script.ts`

**Key functions:**
- `discoverScripts()` - Reads package.json and extracts all `dev-manager:*` scripts
- `runScript()` - Executes the requested script via `npm run`
- `listScripts()` - Returns formatted list of available scripts

**Features:**
- Smart error messages with suggestions for similar scripts
- Script name matching supports partial names (with or without `dev-manager:` prefix)
- Formatted output with success/failure status and debugging tips

## Benefits

### 1. Zero Path Knowledge Required
AI never needs to know where files are located or which directory to run commands from.

### 2. Maintainable
When paths, flags, or commands change, only `package.json` needs updating. The MCP tool automatically discovers the new scripts.

### 3. Self-Documenting
Run `list_scripts` to see all available commands with their actual shell commands.

### 4. Consistent Interface
Same pattern works for all apps:
- Frontend tests: `app="admin", action="e2e"`
- Backend tests: `app="server", action="test"`
- Docker management: `app="docker", action="up"`

### 5. Error Messages
When a script is not found, the tool suggests similar scripts:
```
Script "admin:e2e:clckup" not found.

Did you mean one of these?
  - dev-manager:admin:e2e:clickup
  - dev-manager:admin:e2e:chat
  - dev-manager:admin:e2e
```

## Migration Guide

### For AI Assistants

**Old approach (DEPRECATED):**
```typescript
mcp_dev-manager_run_tests({
  type: "playwright",
  spec: "e2e/specs/integrations.clickup.spec.ts",
  config: "e2e/playwright.config.ts",
  project: "chromium",
  workDir: "apps/admin"
})
```

**New approach (PREFERRED):**
```typescript
mcp_dev-manager_run_script({
  app: "admin",
  action: "e2e:clickup"
})
```

### For Developers

To add a new development task:

1. Add a script to root `package.json` with `dev-manager:` prefix
2. Follow the naming convention: `dev-manager:{app}:{action}`
3. That's it! The MCP tool will automatically discover it

Example:
```json
{
  "scripts": {
    "dev-manager:admin:lint": "npm --prefix apps/admin run lint",
    "dev-manager:server:migrate": "npm --prefix apps/server-nest run migration:run"
  }
}
```

## Backward Compatibility

The old tools (`run_tests`, `manage_service`) still exist but are marked as DEPRECATED in the tool descriptions. They will be removed in a future version.

## Testing

The new script-based approach has been tested and verified:

✅ MCP server builds successfully  
✅ New tools (`run_script`, `list_scripts`) are registered  
✅ All dev-manager scripts are defined in package.json  
✅ Instructions documentation updated  

Next step: Run actual tests using the new tools to verify end-to-end functionality.

## Example Workflow

### Running ClickUp E2E Tests

**Step 1: Discover available scripts**
```typescript
mcp_dev-manager_list_scripts()
```

**Step 2: Run the test**
```typescript
mcp_dev-manager_run_script({
  app: "admin",
  action: "e2e:clickup"
})
```

**Step 3: If it fails, check logs**
```typescript
mcp_dev-manager_browse_logs({
  action: "cat",
  logFile: "apps/admin/test-results/.last-run.json"
})
```

**Step 4: View error context**
```typescript
mcp_dev-manager_browse_logs({
  action: "list"
})
// Then pick the specific error-context.md file
```

## Files Modified

1. **package.json** - Added 18 new dev-manager scripts
2. **mcp-dev-manager/src/tools/run-script.ts** - New tool implementation (192 lines)
3. **mcp-dev-manager/src/index.ts** - Registered new tools, marked old tools as deprecated
4. **.github/instructions/mcp-dev-manager.instructions.md** - Updated with new usage patterns

## Future Enhancements

Potential improvements for the future:

1. **Script Validation** - Verify scripts actually work before execution
2. **Script Categories** - Group by category (test, build, deploy, etc.)
3. **Interactive Mode** - Allow selecting from list in terminal UI
4. **Script Chaining** - Run multiple scripts in sequence
5. **Environment Profiles** - Different script sets for dev/staging/prod

## Conclusion

The script-based architecture dramatically simplifies the MCP Dev Manager interface. AI assistants no longer need to maintain knowledge of file paths, working directories, or command-line flags. Everything is discoverable at runtime via `list_scripts`, and execution is as simple as specifying an app and action.

This makes the development workflow more maintainable, self-documenting, and easier to extend.

---

**Status:** ✅ Complete  
**Last Updated:** October 6, 2025  
**Next:** Test with actual ClickUp E2E tests
