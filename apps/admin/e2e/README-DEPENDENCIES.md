# E2E Test Dependency Management

## How It Works

### Automatic Server Management

Playwright's `webServer` configuration (in `playwright.config.ts`) automatically:

1. **Checks if the Admin SPA is running** on port 5175
2. **Starts the dev server** with `npm run dev` (scoped to `apps/admin`) when needed
3. **Waits for readiness** (30 s timeout)
4. **Reuses the existing server** when `reuseExistingServer: true` (default for local dev)
5. **Leaves the server running** after test execution for faster follow-up runs

### Configuration

```typescript
webServer: {
  command: 'npm run dev',
  cwd: ADMIN_DIR,
  port: DEV_PORT, // 5175
  reuseExistingServer: !process.env.CI && !process.env.E2E_FORCE_START,
  timeout: 30_000
}
```

Timeout defaults:
- **Test**: 30 s
- **Assertion**: 10 s
- **Server start**: 30 s

## Running Tests

### Recommended workflow

```bash
# Ensure Docker dependencies are healthy (Postgres + Zitadel)
npm run workspace:deps:start

# Optionally start the admin service under PM2 supervision
npm run workspace:start -- --service admin

# Execute Playwright tests from the admin app
npm --prefix apps/admin run e2e            # full suite
npm --prefix apps/admin run e2e:chat       # example subset
npx --yes playwright test \
  -c e2e/playwright.config.ts e2e/specs/integrations.clickup.spec.ts
```

The workspace CLI is optional for local loops, but it guarantees preflight checks and consolidated logs.

### Force a fresh dev server

```bash
E2E_FORCE_START=1 npx --yes playwright test -c e2e/playwright.config.ts
```

### Point at an existing server

```bash
E2E_BASE_URL=http://localhost:5175 npx --yes playwright test -c e2e/playwright.config.ts
```

## Script Dependencies

### Playwright project dependencies

1. **Setup project** (`auth.setup.ts`) runs first and persists storage state
2. **Spec projects** depend on setup via `dependencies: ['setup']`

### Environment variables

| Variable | Purpose | Default |
|----------|---------|---------|
| `E2E_FORCE_TOKEN` | Injects auth token instead of interactive login | `1` (set by run scripts) |
| `E2E_FORCE_START` | Forces Playwright to launch a fresh dev server | unset |
| `E2E_BASE_URL` | Overrides target URL when reusing an external server | unset |
| `ADMIN_PORT` | Custom dev port when not using 5175 | unset |

## Troubleshooting

### Server will not start

```bash
npm run workspace:status
lsof -ti:5175
kill $(lsof -ti:5175)
E2E_FORCE_START=1 npx --yes playwright test -c e2e/playwright.config.ts
```

### Tests timing out

Increase Playwright timeouts cautiously:

```ts
export default defineConfig({
  timeout: 60_000,
  expect: { timeout: 20_000 },
  webServer: { timeout: 60_000 }
});
```

### Need clean dependencies

```bash
npm run workspace:deps:restart
```

### Investigate logs

```bash
npm run workspace:logs -- --service admin
npm run workspace:logs -- --deps-only --lines 200
```

## Benefits

1. **Minimal setup** – Playwright handles the dev server lifecycle
2. **Faster iteration** – Server remains running between test runs
3. **CI-friendly** – Fresh server launch per run in CI/forced mode
4. **Fail-fast** – Tight timeouts highlight issues quickly
5. **Consistent orchestration** – Workspace CLI provides health checks and logging

## Execution Flow

```
npx playwright test …
    ↓
Playwright Test Runner
    ↓
Check webServer (port 5175)
    ↓
Is dev server alive?
    ↓  no → start `npm run dev` in apps/admin
    ↓  yes
Run setup project (auth.setup.ts)
    ↓
Run spec projects
    ↓
Leave dev server running (unless FORCE_START enabled)
```

## See Also

- [Playwright WebServer Docs](https://playwright.dev/docs/test-webserver)
- [Playwright Test Configuration](https://playwright.dev/docs/test-configuration)
- [Workspace CLI Quick Start](../../QUICK_START_DEV.md)
