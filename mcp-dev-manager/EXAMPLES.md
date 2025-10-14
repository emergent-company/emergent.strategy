# MCP Dev Manager Examples

## Running Tests

### Playwright Tests

```typescript
// Run all playwright tests
use_mcp_tool("dev-manager", "run_tests", {
  type: "playwright",
  config: "playwright.config.ts",
  project: "chromium"
});

// Run specific spec file
use_mcp_tool("dev-manager", "run_tests", {
  type: "playwright",
  spec: "e2e/specs/integrations.clickup.spec.ts",
  config: "e2e/playwright.config.ts",
  project: "chromium"
});

// Run with grep filter
use_mcp_tool("dev-manager", "run_tests", {
  type: "playwright",
  spec: "e2e/specs/integrations.clickup.spec.ts",
  config: "e2e/playwright.config.ts",
  project: "chromium",
  grep: "Click ClickUp integration card"
});

// Run from specific directory
use_mcp_tool("dev-manager", "run_tests", {
  type: "playwright",
  spec: "e2e/specs/auth.spec.ts",
  config: "e2e/playwright.config.ts",
  project: "chromium",
  workDir: "apps/admin"
});
```

### NPM Tests

```typescript
// Run npm test
use_mcp_tool("dev-manager", "run_tests", {
  type: "npm",
  command: "test"
});

// Run specific npm test script
use_mcp_tool("dev-manager", "run_tests", {
  type: "npm",
  command: "test:unit"
});
```

### Vitest Tests

```typescript
// Run all vitest tests
use_mcp_tool("dev-manager", "run_tests", {
  type: "vitest"
});

// Run specific test file
use_mcp_tool("dev-manager", "run_tests", {
  type: "vitest",
  spec: "src/utils/helpers.test.ts"
});

// Run with grep
use_mcp_tool("dev-manager", "run_tests", {
  type: "vitest",
  grep: "should format date correctly"
});
```

## Managing Services

### Docker Compose

```typescript
// Start all services
use_mcp_tool("dev-manager", "manage_service", {
  action: "start",
  service: "docker-compose"
});

// Start specific services
use_mcp_tool("dev-manager", "manage_service", {
  action: "start",
  service: "docker-compose",
  services: ["postgres", "redis"]
});

// Restart all services
use_mcp_tool("dev-manager", "manage_service", {
  action: "restart",
  service: "docker-compose"
});

// Check status
use_mcp_tool("dev-manager", "manage_service", {
  action: "status",
  service: "docker-compose"
});

// Stop specific services
use_mcp_tool("dev-manager", "manage_service", {
  action: "stop",
  service: "docker-compose",
  services: ["zitadel"]
});
```

### NPM Scripts

```typescript
// Start dev server
use_mcp_tool("dev-manager", "manage_service", {
  action: "start",
  service: "npm",
  script: "dev"
});

// Restart dev server
use_mcp_tool("dev-manager", "manage_service", {
  action: "restart",
  service: "npm",
  script: "dev"
});

// Check dev status
use_mcp_tool("dev-manager", "manage_service", {
  action: "status",
  service: "npm"
});

// Stop dev server
use_mcp_tool("dev-manager", "manage_service", {
  action: "stop",
  service: "npm",
  script: "dev"
});
```

### PM2

```typescript
// Start all PM2 processes
use_mcp_tool("dev-manager", "manage_service", {
  action: "start",
  service: "pm2"
});

// Restart specific process
use_mcp_tool("dev-manager", "manage_service", {
  action: "restart",
  service: "pm2",
  services: ["api"]
});

// Check PM2 status
use_mcp_tool("dev-manager", "manage_service", {
  action: "status",
  service: "pm2"
});
```

### Custom Commands

```typescript
// Run custom command
use_mcp_tool("dev-manager", "manage_service", {
  action: "start",
  service: "custom",
  command: "npm run build && npm run start"
});
```

## Browsing Logs

### List Available Logs

```typescript
// List all log files
use_mcp_tool("dev-manager", "browse_logs", {
  action: "list"
});
```

### Tail Logs

```typescript
// Tail error log (last 50 lines)
use_mcp_tool("dev-manager", "browse_logs", {
  action: "tail",
  logFile: "logs/errors.log",
  lines: 50
});

// Tail test output (last 100 lines)
use_mcp_tool("dev-manager", "browse_logs", {
  action: "tail",
  logFile: "test-output.log",
  lines: 100
});

// Tail specific test result
use_mcp_tool("dev-manager", "browse_logs", {
  action: "tail",
  logFile: "apps/admin/test-results/integrations.clickup-Click-2119f-integration-card-in-gallery-chromium/error-context.md"
});
```

### Cat (View Entire File)

```typescript
// View entire log file
use_mcp_tool("dev-manager", "browse_logs", {
  action: "cat",
  logFile: "logs/app.log"
});

// View test results JSON
use_mcp_tool("dev-manager", "browse_logs", {
  action: "cat",
  logFile: "test-results/.last-run.json"
});
```

### Search Logs (Grep)

```typescript
// Search for errors
use_mcp_tool("dev-manager", "browse_logs", {
  action: "grep",
  logFile: "logs/app.log",
  pattern: "ERROR",
  context: 3
});

// Search for specific test
use_mcp_tool("dev-manager", "browse_logs", {
  action: "grep",
  logFile: "test-output.log",
  pattern: "ClickUp integration card",
  context: 5
});

// Search for timeout issues
use_mcp_tool("dev-manager", "browse_logs", {
  action: "grep",
  logFile: "test-output.log",
  pattern: "Timeout|timeout",
  context: 10
});
```

## Checking Status

### Check All Services

```typescript
// Check all services
use_mcp_tool("dev-manager", "check_status", {});
```

### Check Specific Services

```typescript
// Check docker-compose only
use_mcp_tool("dev-manager", "check_status", {
  services: ["docker-compose"]
});

// Check npm processes
use_mcp_tool("dev-manager", "check_status", {
  services: ["npm"]
});

// Check ports
use_mcp_tool("dev-manager", "check_status", {
  services: ["ports"]
});

// Check multiple
use_mcp_tool("dev-manager", "check_status", {
  services: ["docker-compose", "npm", "ports"]
});
```

### Detailed Status

```typescript
// Get detailed status
use_mcp_tool("dev-manager", "check_status", {
  services: ["docker-compose", "npm"],
  detailed: true
});
```

## Common Workflows

### Debug Failed Playwright Test

```typescript
// 1. Run the test
use_mcp_tool("dev-manager", "run_tests", {
  type: "playwright",
  spec: "e2e/specs/integrations.clickup.spec.ts",
  config: "e2e/playwright.config.ts",
  project: "chromium"
});

// 2. Check test output
use_mcp_tool("dev-manager", "browse_logs", {
  action: "tail",
  logFile: "test-output.log",
  lines: 100
});

// 3. View error context
use_mcp_tool("dev-manager", "browse_logs", {
  action: "list"
});

// 4. View specific error context file
use_mcp_tool("dev-manager", "browse_logs", {
  action: "cat",
  logFile: "apps/admin/test-results/[test-name]/error-context.md"
});
```

### Restart Development Environment

```typescript
// 1. Check current status
use_mcp_tool("dev-manager", "check_status", {
  services: ["docker-compose", "npm", "ports"]
});

// 2. Restart docker services
use_mcp_tool("dev-manager", "manage_service", {
  action: "restart",
  service: "docker-compose"
});

// 3. Restart npm dev server
use_mcp_tool("dev-manager", "manage_service", {
  action: "restart",
  service: "npm",
  script: "dev"
});

// 4. Verify everything is running
use_mcp_tool("dev-manager", "check_status", {});
```

### Monitor Logs During Development

```typescript
// 1. Tail error log
use_mcp_tool("dev-manager", "browse_logs", {
  action: "tail",
  logFile: "logs/errors.log",
  lines: 50
});

// 2. Search for specific error
use_mcp_tool("dev-manager", "browse_logs", {
  action: "grep",
  logFile: "logs/app.log",
  pattern: "UnauthorizedException",
  context: 5
});

// 3. Check service status
use_mcp_tool("dev-manager", "check_status", {
  services: ["npm", "ports"]
});
```
