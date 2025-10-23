# MCP Dev Manager - Quick Reference

## Primary Tool: run_script

```typescript
mcp_dev-manager_run_script({
  app: "admin" | "server" | "docker",
  action: "e2e:clickup" | "build" | "test" | ...
})
```

## Common Tasks

### Run ClickUp E2E Tests
```typescript
mcp_dev-manager_run_script({ app: "admin", action: "e2e:clickup" })
```

### Build Admin
```typescript
mcp_dev-manager_run_script({ app: "admin", action: "build" })
```

### Run Server Tests
```typescript
mcp_dev-manager_run_script({ app: "server", action: "test" })
```

### Docker Commands
```typescript
mcp_dev-manager_run_script({ app: "docker", action: "up" })      // Start
mcp_dev-manager_run_script({ app: "docker", action: "down" })    // Stop
mcp_dev-manager_run_script({ app: "docker", action: "restart" }) // Restart
mcp_dev-manager_run_script({ app: "docker", action: "logs" })    // View logs
mcp_dev-manager_run_script({ app: "docker", action: "ps" })      // List containers
```

## Discover Scripts

```typescript
mcp_dev-manager_list_scripts()
```

Returns categorized list of all available scripts.

## When to Use run_in_terminal

Use `run_in_terminal` for interactive commands:
- Playwright UI mode (`admin:e2e:ui`)
- Headed browser (`admin:e2e:headed`)
- Debug mode (`admin:e2e:debug`)
- Log following (`docker:logs:follow`)
- Development servers (Storybook, API server)

Example:
```typescript
run_in_terminal({
  command: "npm run dev-manager:admin:e2e:ui",
  isBackground: true,
  explanation: "Open Playwright UI for interactive debugging"
})
```

## Other Useful Tools

### Browse Logs
```typescript
mcp_dev-manager_browse_logs({
  action: "tail",
  logFile: "apps/admin/test-results/.last-run.json"
})
```

### Check Status
```typescript
mcp_dev-manager_check_status({
  services: ["docker-compose", "ports"]
})
```

## All Available Scripts

### Admin (Frontend)
- ✅ `e2e` - All E2E tests
- ✅ `e2e:clickup` - ClickUp tests
- ✅ `e2e:chat` - Chat tests
- ⚠️ `e2e:ui` - UI mode (interactive)
- ⚠️ `e2e:headed` - Headed browser (interactive)
- ⚠️ `e2e:debug` - Debug mode (interactive)
- ✅ `build` - Build app
- ✅ `test` - Unit tests
- ✅ `test:coverage` - Tests with coverage
- ⚠️ `storybook` - Start Storybook (background)

### Server (Backend)
- ✅ `test` - Unit tests
- ✅ `test:e2e` - E2E API tests
- ✅ `test:coverage` - Tests with coverage
- ✅ `build` - Build server
- ⚠️ `start` - Dev server (background)

### Docker
- ✅ `up` - Start containers
- ✅ `down` - Stop containers
- ✅ `restart` - Restart containers
- ✅ `logs` - Last 100 lines
- ⚠️ `logs:follow` - Follow logs (interactive)
- ✅ `ps` - List containers

**Legend:**
- ✅ Non-interactive (use `run_script`)
- ⚠️ Interactive or background (use `run_in_terminal`)

## Error Handling

If you try to run an interactive command via `run_script`, you'll get:

```
❌ Error: Script "admin:e2e:ui" requires user interaction and cannot be run via MCP.

Please use run_in_terminal tool instead:
run_in_terminal({
  command: "npm run dev-manager:admin:e2e:ui",
  isBackground: true
})
```

## Tips

1. **Always start with `list_scripts`** to see what's available
2. **Use `run_script`** for automated tasks (tests, builds)
3. **Use `run_in_terminal`** for interactive tasks (debugging, monitoring)
4. **Check logs** with `browse_logs` when tests fail
5. **Verify services** with `check_status` before running tests
