---
applyTo: '**'
---

# Testing Infrastructure - AI Assistant Instructions

## Overview

Testing spans multiple applications (React admin SPA, NestJS API, automation tooling). Use the Workspace CLI and Nx runners as the primary interfaces for orchestrating builds, dependency lifecycles, and test suites. This document replaces all legacy MCP dev manager guidance.

**For detailed testing guidance and templates, see `docs/testing/AI_AGENT_GUIDE.md`** which provides:

- Test type decision trees (unit, integration, API e2e, browser e2e)
- Test templates and quick reference
- Directory structure and file naming conventions
- Import patterns and best practices

## Test Directory Structure

### Admin (`apps/admin`)

```
tests/
  ├── unit/               # Vitest unit tests
  │   ├── components/
  │   │   ├── atoms/
  │   │   ├── molecules/
  │   │   └── organisms/
  │   ├── contexts/
  │   └── hooks/
  ├── e2e/                # Playwright browser e2e tests
  │   ├── specs/
  │   ├── fixtures/
  │   ├── helpers/
  │   └── playwright.config.ts
  └── setup.ts
```

### Server (`apps/server`)

```
tests/
  ├── unit/               # Jest unit tests
  ├── integration/        # Jest integration tests
  └── e2e/                # Jest API e2e tests
```

## Automation Entry Points

- **Nx Targets (canonical):** Always prefer `nx run <project>:<target>` to execute tasks. Examples: `nx run admin:test`, `nx run server:test`, `nx run workspace-cli:workspace:start`.
- **Workspace CLI shorthands:** The `npm run workspace:<action>` aliases still exist but simply call the Nx targets above. Use them only when automation requires npm scripts specifically.
- **Direct npm scripts:** Only fall back to `npm --prefix apps/<project> run <script>` when no Nx target exists yet (track any gaps and add a target).

Always ensure dependencies are running (
`nx run workspace-cli:workspace:deps:start`
) before launching E2E suites.

## Project Structure & Test Types

### Admin Frontend (`apps/admin`)

- **Unit & integration tests:** `nx run admin:test`
- **Coverage:** `nx run admin:test-coverage`
- **Type check / build:** `nx run admin:build`
- **Playwright E2E:** `nx run admin:e2e`
- **Storybook smoke:** `nx run admin:serve:storybook -- --port=6006` (manual review)
- **Interactive Playwright UI:** `nx run admin:e2e-ui`

Fallback aliases: `npm --prefix apps/admin run <script>` remain available if you need to bypass Nx caching or run community scripts without targets.

### Server Backend (`apps/server`)

- **Unit tests:** `nx run server:test`
- **E2E integration:** `nx run server:test-e2e`
- **Coverage:** `nx run server:test-coverage`
- **Type check / build:** `nx run server:build`
- **Watch mode:** `nx run server:test-watch`
- **Scenario suite:** `nx run server:test-scenarios`
- **E2E coverage:** `nx run server:test-coverage-e2e`

Fallback aliases: `npm --prefix apps/server run <script>` should only be used when introducing new scripts and before wiring an Nx target.

### Workspace CLI (`tools/workspace-cli`)

Keeps build/test scripts thin. Rarely needs direct testing during feature work, but full verification is available through `nx run workspace-cli:verify` (still wraps the underlying npm script).

### Utility Scripts (`scripts/`)

Helpers such as smoke tests (`nx run repo-scripts:test-smoke`) or OpenAPI diff (`nx run repo-scripts:spec-diff`) live under the `repo-scripts` project. Aggregate coverage is `nx run repo-scripts:test-coverage-all`.

## Running Tests

### Admin (Vitest)

```bash
# All specs
nx run admin:test

# Focused file
nx run admin:test -- src/components/atoms/Button/Button.test.tsx

# Single test name
nx run admin:test -- -t "renders loading state"
```

### Admin (Playwright)

```bash
# Headless chromium suite (uses storage state)
E2E_FORCE_TOKEN=1 nx run admin:e2e

# Specific spec
E2E_FORCE_TOKEN=1 nx run admin:e2e -- tests/e2e/specs/integrations.clickup.spec.ts

# Interactive debug UI
E2E_FORCE_TOKEN=1 nx run admin:e2e-ui
```

Ensure dependencies are up before Playwright:

```bash
nx run workspace-cli:workspace:deps:start
nx run workspace-cli:workspace:start        # Launch API + Admin services under PM2
```

### Server (Jest)

```bash
# Unit tests
nx run server:test

# E2E tests
nx run server:test-e2e

# Continuous watch (local only)
nx run server:test-watch
```

### Combined Regression Loop

```bash
nx run server:test
nx run server:test-e2e
nx run admin:test
E2E_FORCE_TOKEN=1 nx run admin:e2e
```

## Coverage Reports

- **Admin:** `nx run admin:test-coverage` → `apps/admin/coverage/`
- **Server:** `nx run server:test-coverage` → `apps/server/coverage/`
- **Aggregate helper:** `nx run repo-scripts:test-coverage-all`

Open coverage locally with `open apps/<project>/coverage/lcov-report/index.html` (macOS).

## CI Alignment

GitHub Actions under `.github/workflows/` use the same npm/Nx commands described above. Keep interactive flags (Playwright UI/headed) out of CI scripts.

## Dependency Management for Tests

1. **Start Docker services:** `nx run workspace-cli:workspace:deps:start`
2. **Start application services:** `nx run workspace-cli:workspace:start`
3. **Check health:** `nx run workspace-cli:workspace:status`
4. **Tail logs when debugging:** `nx run workspace-cli:workspace:logs`

Ports: Postgres 5432, Zitadel 8080, API 3001, Admin 5175. Stop everything with `nx run workspace-cli:workspace:stop` and `nx run workspace-cli:workspace:deps:stop`.

### Environment Variables

- `E2E_FORCE_TOKEN=1` — bypasses interactive login for Playwright
- Database env defaults come from `docker/.env`; override via shell when needed

## Debugging Failures

### Playwright

**ALWAYS check Playwright logs and reports after test runs - most errors are visible there without asking the user.**

#### Viewing Test Reports and Logs

After any Playwright test run (pass or fail), IMMEDIATELY check the HTML report:

```bash
# Open the interactive HTML report in browser
npx playwright show-report apps/admin/tests/e2e/test-results/html-report
```

The HTML report contains:

- **Screenshots** - visual state when test failed or at key steps
- **Trace viewer** - DOM snapshots, network calls, console logs at each action
- **Video recordings** - full playback of test execution (if enabled)
- **Network tab** - all HTTP requests/responses with status codes
- **Console logs** - JavaScript errors and console output
- **Timing information** - how long each step took

**Always check the report before asking the user what went wrong.**

#### Test Artifacts Locations

Artifacts are written under `apps/admin/tests/e2e/test-results/`:

1. `html-report/` — interactive report with screenshots, traces, videos
2. `test-results.json` — machine-readable test results
3. Individual test directories may contain:
   - `error-context.md` — URL, console errors, page snapshot
   - `test-failed-*.png` — final frame screenshot
   - `video.webm` — execution recording
   - `trace.zip` — detailed trace for Playwright trace viewer

#### Viewing Traces

For detailed debugging, open trace files directly:

```bash
# Open a specific trace file
npx playwright show-trace apps/admin/tests/e2e/test-results/<test-name>/trace.zip
```

Trace viewer shows:

- DOM snapshots at each action
- localStorage, sessionStorage, cookies at each step
- Network requests and responses (with bodies)
- Console messages
- Source code with execution highlight
- Screenshot timeline

#### When Triaging Failures

**Required workflow for AI assistants:**

1. **First**: Open and examine the HTML report: `npx playwright show-report apps/admin/e2e/test-results/html-report`
2. **Check**: Screenshot shows what page actually rendered
3. **Check**: Network tab shows API calls and status codes
4. **Check**: Console shows JavaScript errors
5. **Check**: Trace shows exact DOM state when test failed
6. **Then**: Diagnose root cause from artifacts (don't guess or ask user)
7. **Finally**: Rerun focused spec if needed: `E2E_FORCE_TOKEN=1 nx run admin:e2e -- tests/e2e/specs/<file>.spec.ts`

Additional debugging:

- Use `nx run admin:e2e-ui` for interactive debugging with headed browser (never in CI)
- Add `--headed` flag to see browser during test execution
- Add `--debug` flag to pause test and open Playwright Inspector

### Jest/Vitest

- Add `--runInBand` if parallelism hides logs
- Use `--testNamePattern` / `-t` for targeted reruns
- Check `.spec.ts` files for lingering database handles; close connections in `afterAll`

## Best Practices

### AI Assistants

1. Default to Workspace CLI and Nx commands; avoid legacy MCP language.
2. Confirm dependencies are running before advising Playwright runs.
3. **ALWAYS check Playwright HTML report after test runs** - most errors are visible in screenshots/traces without asking the user.
4. Never parallelize Playwright specs unless suites are explicitly isolated.
5. Point users to artifact folders and open the HTML report to diagnose failures.
6. For Nest specs touching the database, require `describeWithDb` and explicit teardown.

### Developers

1. Run unit tests + type checks before every commit.
2. Keep E2E runs deterministic: seed data or stub network responses inside tests.
3. Enforce ≥80% coverage on new modules; update thresholds if deliberate.
4. Use `scripts/validate-story-duplicates.mjs` via npm hook before Storybook work.
5. Document non-trivial test data builders in `docs/` for future contributors.

## Locating Tests

| Area               | Pattern                                      |
| ------------------ | -------------------------------------------- |
| Server unit        | `apps/server/tests/unit/**/*.spec.ts`        |
| Server integration | `apps/server/tests/integration/**/*.spec.ts` |
| Server e2e         | `apps/server/tests/e2e/**/*.spec.ts`         |
| Admin unit         | `apps/admin/tests/unit/**/*.test.{ts,tsx}`   |
| Admin e2e          | `apps/admin/tests/e2e/specs/**/*.spec.ts`    |

Search helpers:

```bash
find apps/server/tests -name "*.spec.ts"
find apps/admin/tests/unit -name "*.test.ts" -o -name "*.test.tsx"
find apps/admin/tests/e2e/specs -name "*.spec.ts"
```

## Quick Reference

| Task              | Primary Command                         | Alt Command                                                                          | Notes                                        |
| ----------------- | --------------------------------------- | ------------------------------------------------------------------------------------ | -------------------------------------------- |
| Admin unit tests  | `nx run admin:test`                     | `npm --prefix apps/admin run test`                                                   | Append `-- -t "name"` for focused run        |
| Admin coverage    | `nx run admin:test-coverage`            | `npm --prefix apps/admin run test:coverage`                                          | Coverage report under `apps/admin/coverage/` |
| Admin E2E         | `E2E_FORCE_TOKEN=1 nx run admin:e2e`    | `E2E_FORCE_TOKEN=1 npx playwright test -c apps/admin/tests/e2e/playwright.config.ts` | Start deps/services first                    |
| Server unit tests | `nx run server:test`                    | `npm --prefix apps/server run test`                                                  | Use `-- --testNamePattern` to filter         |
| Server E2E        | `nx run server:test-e2e`                | `npm --prefix apps/server run test:e2e`                                              | Requires Postgres + Zitadel running          |
| Server coverage   | `nx run server:test-coverage`           | `npm --prefix apps/server run test:coverage`                                         | Generates `apps/server/coverage/`            |
| Workspace status  | `nx run workspace-cli:workspace:status` | `npm run workspace:status`                                                           | Reports Docker + PM2 health                  |

Common loop:

```bash
nx run workspace-cli:workspace:deps:start
nx run workspace-cli:workspace:start
nx run server:test
nx run server:test-e2e
nx run admin:test
E2E_FORCE_TOKEN=1 nx run admin:e2e
nx run workspace-cli:workspace:stop
nx run workspace-cli:workspace:deps:stop
```

## Troubleshooting

### Ports Busy

```bash
lsof -ti:3001,5175,5432,8080 | xargs kill -9
nx run workspace-cli:workspace:deps:restart
```

### Database Connection Errors

```bash
nx run workspace-cli:workspace:deps:restart
nx run workspace-cli:workspace:status
```

### Playwright Browser Missing

```bash
npx playwright install chromium
npx playwright install-deps
```

### Long-Running Tests / Timeouts

- Prefer Playwright web-first assertions (`await expect(locator).toHaveText(...)`).
- Inspect network stubs for hanging promises.
- For Jest, confirm `done()` callbacks are not left dangling.

## Related Documentation

- `.github/instructions/admin.instructions.md`
- `docs/DEV_PROCESS_MANAGER.md`
- `docs/CLICKUP_E2E_TESTS.md`
- `QUICK_START_DEV.md`

## Remember

- Keep automation consistent: Workspace CLI → Nx → npm.
- Capture artifacts before re-running failing suites.
- Never assume services are running—check via `nx run workspace-cli:workspace:status`.
- Tests should reflect user behavior; avoid mocking core integrations in E2E suites.
