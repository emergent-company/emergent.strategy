# E2E Test Dependency Management

## How It Works

### Automatic Server Management

Playwright's `webServer` configuration (in `playwright.config.ts`) automatically:

1. **Checks if server is running** on the configured port (5175)
2. **Starts server if needed** using `npm run dev`
3. **Waits for server to be ready** (up to 30 seconds)
4. **Reuses existing server** if `reuseExistingServer: true` (default for local dev)
5. **Keeps server running** after tests complete (for faster subsequent runs)

### Configuration

```typescript
webServer: {
    command: 'npm run dev',
    cwd: ADMIN_DIR,
    port: DEV_PORT, // 5175
    reuseExistingServer: !process.env.CI && !process.env.E2E_FORCE_START,
    timeout: 30_000, // 30 seconds to start
}
```

### Timeouts

All timeouts have been reduced for faster feedback:

- **Test timeout**: 30 seconds (was 90s)
- **Assertion timeout**: 10 seconds (was 15s)
- **Server start timeout**: 30 seconds (was 180s)

These shorter timeouts ensure:
- Tests fail fast when something is wrong
- No long waits for hung tests
- Better developer experience

## Running Tests

### Via npm scripts (recommended)

```bash
# Playwright handles server automatically
npm run dev-manager:admin:e2e:clickup
```

**What happens:**
1. Playwright checks if server is on port 5175
2. If not running, starts `npm run dev` in apps/admin
3. Waits up to 30s for server to respond
4. Runs tests
5. Leaves server running for next test run

### Force fresh server

```bash
# Kill existing server and start fresh
E2E_FORCE_START=1 npm run dev-manager:admin:e2e:clickup
```

### With external server

```bash
# Use already-running server on different URL
E2E_BASE_URL=http://localhost:3000 npm run dev-manager:admin:e2e:clickup
```

## Script Dependencies

### Implicit Dependencies

The scripts leverage Playwright's built-in dependency management:

1. **Setup project** runs first (auth.setup.ts)
   - Creates authenticated storage state
   - Dependency declared in playwright.config.ts

2. **Test projects** run after setup
   - Uses saved storage state
   - `dependencies: ['setup']`

### Environment Variables

- `E2E_FORCE_TOKEN=1` - Always set, forces token injection auth
- `E2E_FORCE_START=1` - Optional, force fresh server start
- `E2E_BASE_URL` - Optional, use external server
- `ADMIN_PORT` - Optional, change dev server port (default: 5175)

## Troubleshooting

### Server won't start

```bash
# Check if port is in use
lsof -ti:5175

# Kill existing process
kill $(lsof -ti:5175)

# Try again with force start
E2E_FORCE_START=1 npm run dev-manager:admin:e2e:clickup
```

### Tests timeout

```bash
# Increase timeouts in playwright.config.ts
timeout: 60_000,  # 60 seconds
expect: { timeout: 20_000 },  # 20 seconds
webServer: { timeout: 60_000 }  # 60 seconds
```

### Server keeps restarting

Check if another process is using port 5175:
```bash
lsof -ti:5175
ps aux | grep "vite\|npm run dev"
```

## Benefits

1. **No manual setup** - Just run tests, server starts automatically
2. **Fast iteration** - Server stays running between test runs
3. **CI-friendly** - Fresh server for each CI run
4. **Fail-fast** - Short timeouts catch issues quickly
5. **Flexible** - Override with environment variables

## Architecture

```
npm run dev-manager:admin:e2e:clickup
    ↓
Playwright Test Runner
    ↓
Check webServer config
    ↓
Is port 5175 open?
    ↓ No
Start `npm run dev` (30s timeout)
    ↓ Yes
Run setup project (auth.setup.ts)
    ↓
Run test project (integrations.clickup.spec.ts)
    ↓
Leave server running (reuse for next run)
```

## See Also

- [Playwright WebServer Docs](https://playwright.dev/docs/test-webserver)
- [Playwright Test Config](https://playwright.dev/docs/test-configuration)
- [Playwright Projects & Dependencies](https://playwright.dev/docs/test-projects)
