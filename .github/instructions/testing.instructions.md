---
applyTo: "**"
---

# Testing Infrastructure - AI Assistant Instructions

## Overview

Testing spans multiple applications (React admin SPA, NestJS API, automation tooling). Use the Workspace CLI and Nx runners as the primary interfaces for orchestrating builds, dependency lifecycles, and test suites. This document replaces all legacy MCP dev manager guidance.

## Automation Entry Points

- **Workspace CLI:** `npm run workspace:<action>` (wraps `tools/workspace-cli`) controls Docker dependencies, PM2 services, and consolidated logs/status reports.
- **Nx Targets:** `nx run <project>:<target>` mirrors the npm shortcuts and is safe for scripted usage. Examples: `nx run admin:test`, `nx run server-nest:test`.
- **Direct npm scripts:** Use `npm --prefix apps/<project> run <script>` when you need the underlying tool binary (Vitest, Playwright, Jest) or interactive flags.

Always ensure dependencies are running (
`npm run workspace:deps:start`
) before launching E2E suites.

## Project Structure & Test Types

### Admin Frontend (`apps/admin`)
- **Unit & integration tests:** Vitest + React Testing Library (`npm --prefix apps/admin run test`)
- **Coverage:** `npm --prefix apps/admin run test:coverage`
- **Playwright E2E:** `npm --prefix apps/admin run e2e`
- **Storybook smoke:** `npm --prefix apps/admin run storybook` (manual review)

Nx equivalents:
- `nx run admin:test`
- `nx run admin:test -- --coverage`

### Server Backend (`apps/server-nest`)
- **Unit tests:** Jest (`npm --prefix apps/server-nest run test`)
- **E2E integration:** `npm --prefix apps/server-nest run test:e2e`
- **Coverage:** `npm --prefix apps/server-nest run test:coverage`
- **Type check / build:** `npm --prefix apps/server-nest run build`

Nx equivalents:
- `nx run server-nest:test`
- `nx run server-nest:test -- --testNamePattern="GraphService"`

### Workspace CLI (`tools/workspace-cli`)
Keeps build/test scripts thin. Rarely needs direct testing during feature work, but full verification is available through its own package scripts (`npm --prefix tools/workspace-cli run verify`).

### Utility Scripts (`scripts/`)
Helpers such as smoke tests (`npm run test:smoke`) or OpenAPI diff (`npm run spec:diff`) live at the repo root.

## Running Tests

### Admin (Vitest)
```bash
# All specs
nx run admin:test

# Focused file
npm --prefix apps/admin run test -- src/components/atoms/Button/Button.test.tsx

# Single test name
npm --prefix apps/admin run test -- -t "renders loading state"
```

### Admin (Playwright)
```bash
# Headless chromium suite (uses storage state)
E2E_FORCE_TOKEN=1 npm --prefix apps/admin run e2e

# Specific spec
E2E_FORCE_TOKEN=1 npm --prefix apps/admin run e2e -- e2e/specs/integrations.clickup.spec.ts

# Interactive debug UI
E2E_FORCE_TOKEN=1 npm --prefix apps/admin run e2e:ui
```

Ensure dependencies are up before Playwright:
```bash
npm run workspace:deps:start
npm run workspace:start        # Launch API + Admin services under PM2
```

### Server (Jest)
```bash
# Unit tests
nx run server-nest:test

# E2E tests
npm --prefix apps/server-nest run test:e2e

# Continuous watch (local only)
npm --prefix apps/server-nest run test:watch
```

### Combined Regression Loop
```bash
nx run server-nest:test
npm --prefix apps/server-nest run test:e2e
nx run admin:test
E2E_FORCE_TOKEN=1 npm --prefix apps/admin run e2e
```

## Coverage Reports

- **Admin:** `npm --prefix apps/admin run test:coverage` → `apps/admin/coverage/`
- **Server:** `npm --prefix apps/server-nest run test:coverage` → `apps/server-nest/coverage/`
- **Aggregate helper:** `npm run test:coverage:all`

Open coverage locally with `open apps/<project>/coverage/lcov-report/index.html` (macOS).

## CI Alignment

GitHub Actions under `.github/workflows/` use the same npm/Nx commands described above. Keep interactive flags (Playwright UI/headed) out of CI scripts.

## Dependency Management for Tests

1. **Start Docker services:** `npm run workspace:deps:start`
2. **Start application services:** `npm run workspace:start`
3. **Check health:** `npm run workspace:status`
4. **Tail logs when debugging:** `npm run workspace:logs`

Ports: Postgres 5432, Zitadel 8080, API 3001, Admin 5175. Stop everything with `npm run workspace:stop` and `npm run workspace:deps:stop`.

### Environment Variables
- `E2E_FORCE_TOKEN=1` — bypasses interactive login for Playwright
- Database env defaults come from `docker/.env`; override via shell when needed

## Debugging Failures

### Playwright
Artifacts are written under `apps/admin/test-results/<slug>/<browser>/`:
1. `error-context.md` — first stop (URL, console, snapshot)
2. `test-failed-*.png` — final frame screenshot
3. `video.webm` — execution recording

When triaging:
- Rerun focused spec with `E2E_FORCE_TOKEN=1 npm --prefix apps/admin run e2e -- e2e/specs/<file>.spec.ts`
- Use `e2e:ui` for interactive debugging only (never in CI)

### Jest/Vitest
- Add `--runInBand` if parallelism hides logs
- Use `--testNamePattern` / `-t` for targeted reruns
- Check `.spec.ts` files for lingering database handles; close connections in `afterAll`

## Best Practices

### AI Assistants
1. Default to Workspace CLI and Nx commands; avoid legacy MCP language.
2. Confirm dependencies are running before advising Playwright runs.
3. Never parallelize Playwright specs unless suites are explicitly isolated.
4. Point users to artifact folders instead of guessing failure causes.
5. For Nest specs touching the database, require `describeWithDb` and explicit teardown.

### Developers
1. Run unit tests + type checks before every commit.
2. Keep E2E runs deterministic: seed data or stub network responses inside tests.
3. Enforce ≥80% coverage on new modules; update thresholds if deliberate.
4. Use `scripts/validate-story-duplicates.mjs` via npm hook before Storybook work.
5. Document non-trivial test data builders in `docs/` for future contributors.

## Locating Tests

| Area | Pattern |
| --- | --- |
| Server unit | `apps/server-nest/src/**/*.spec.ts` |
| Server e2e | `apps/server-nest/test/**/*.e2e-spec.ts` |
| Admin unit | `apps/admin/src/**/*.{test.ts,test.tsx}` |
| Admin e2e | `apps/admin/e2e/specs/**/*.spec.ts` |

Search helpers:
```bash
find apps/server-nest -name "*.spec.ts" -o -name "*.e2e-spec.ts"
find apps/admin/src -name "*.test.ts" -o -name "*.test.tsx"
```

## Quick Reference

| Task | Primary Command | Alt Command | Notes |
| --- | --- | --- | --- |
| Admin unit tests | `nx run admin:test` | `npm --prefix apps/admin run test` | Append `-- -t "name"` for focused run |
| Admin coverage | `nx run admin:test -- --coverage` | `npm --prefix apps/admin run test:coverage` | Coverage report under `apps/admin/coverage/` |
| Admin E2E | `E2E_FORCE_TOKEN=1 npm --prefix apps/admin run e2e` | `E2E_FORCE_TOKEN=1 npx playwright test -c apps/admin/e2e/playwright.config.ts` | Start deps/services first |
| Server unit tests | `nx run server-nest:test` | `npm --prefix apps/server-nest run test` | Use `-- --testNamePattern` to filter |
| Server E2E | `npm --prefix apps/server-nest run test:e2e` |  | Requires Postgres + Zitadel running |
| Server coverage | `npm --prefix apps/server-nest run test:coverage` |  | Generates `apps/server-nest/coverage/` |
| Workspace status | `npm run workspace:status` | `nx run workspace-cli:workspace:status` | Reports Docker + PM2 health |

Common loop:
```bash
npm run workspace:deps:start
npm run workspace:start
nx run server-nest:test
npm --prefix apps/server-nest run test:e2e
nx run admin:test
E2E_FORCE_TOKEN=1 npm --prefix apps/admin run e2e
npm run workspace:stop
npm run workspace:deps:stop
```

## Troubleshooting

### Ports Busy
```bash
lsof -ti:3001,5175,5432,8080 | xargs kill -9
npm run workspace:deps:restart
```

### Database Connection Errors
```bash
npm run workspace:deps:restart
npm run workspace:status
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
- Never assume services are running—check via `npm run workspace:status`.
- Tests should reflect user behavior; avoid mocking core integrations in E2E suites.
