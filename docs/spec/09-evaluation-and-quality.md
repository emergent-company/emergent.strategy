# Evaluation and Quality

## Retrieval Quality
- Offline eval sets: queries mapped to gold citations from a seed project.
- Metrics: nDCG@k, Recall@k, MRR; per-source breakdown.
- A/B rerankers (RRF vs graph-aware) with shadow tests.

## Ingestion Quality
- Extraction coverage per MIME type; fallback OCR success.
- Chunk integrity: token distribution, section preservation.
- Embedding health: cosine self-similarity sanity checks.

## MCP Usability
- Contract stability, error clarity, performance budgets.
- Agent harness to validate end-to-end tasks: “write spec for feature X with citations”.

## Acceptance Criteria (v1)
- Ingest: PDF, DOCX, MD, HTML, Jira, GitHub Issues/PRs; Slack export.
- Search: hybrid top-10 with at least 80% recall on eval set.
- MCP: search and fetch with citations and provenance.

## UI End-to-End Testing (Playwright)

Goal: automatically browse the admin SPA in a real browser, fail fast on any console errors/exceptions, and run a small set of reliable smoke scenarios across critical routes. This acts as a quality gate on every PR and nightly.

### Tooling
- Framework: Microsoft Playwright Test (Chromium + WebKit + Firefox; headless in CI, headed locally)
- Artifacts: traces, videos, screenshots on failure
- Accessibility (optional): @axe-core/playwright for a11y smoke checks

### Test targets
- App: apps/admin (React + Vite). Routes are declared in `apps/admin/src/router/register.tsx` and will be enumerated for navigation checks.
- Environments: local dev (vite), preview (vite preview), or against a running backend. Tests support two modes:
	- Mocked network (default, reliable): intercept selected API calls and fulfill with fixtures
	- Live backend (opt-in via env): run against a real server for end-to-end coverage

### Minimal scenarios (smoke)
1) No console errors on landing
	 - Open `/` and `/landing`; assert no `pageerror` and `console.error`
2) Auth happy-path
	 - Visit `/auth/login` → submit credentials (mocked or test user) → redirected to `/admin`
3) Navigation across admin shell
	 - Visit and assert render for: `/admin/apps/documents`, `/admin/apps/chunks`, `/admin/apps/chat`, `/admin/profile`, `/admin/settings/ai/prompts`
	 - Each page: no console errors; key landmark selector present
4) Basic interaction
	 - Documents page: filter or paginate list (mocked data). Verify request fired and UI responds

### Console and exception gate (required)
All tests must attach listeners and fail if any browser console error or unhandled exception occurs:

```ts
// test/fixtures/consoleGate.ts
import { test as base } from '@playwright/test';

export const test = base.extend<{ consoleErrors: string[]; pageErrors: string[] }>({
	consoleErrors: async ({ page }, use) => {
		const errors: string[] = [];
		page.on('console', (msg) => {
			if (msg.type() === 'error') errors.push(msg.text());
		});
		await use(errors);
	},
	pageErrors: async ({ page }, use) => {
		const errors: string[] = [];
		page.on('pageerror', (err) => errors.push(err.message));
		await use(errors);
	},
});
```

Usage in a spec:

```ts
import { expect } from '@playwright/test';
import { test } from './fixtures/consoleGate';

test('landing has no console errors', async ({ page, consoleErrors, pageErrors }) => {
	await page.goto('/');
	await expect(page.getByRole('navigation')).toBeVisible();
	expect(consoleErrors, `console errors: ${consoleErrors.join('\n')}`).toHaveLength(0);
	expect(pageErrors, `page errors: ${pageErrors.join('\n')}`).toHaveLength(0);
});
```

Allowed warnings: if needed, define a small allowlist (regex) for known benign third‑party warnings, but keep it short and reviewed.

### Project layout (proposal)
- apps/admin/e2e/
	- playwright.config.ts (baseURL from env; start dev server locally if not provided)
	- fixtures/ (console gate, auth helpers, network mocks)
	- specs/
		- smoke.spec.ts
		- navigation.spec.ts
		- auth.spec.ts
	- mocks/ (JSON fixtures for intercepted endpoints)

### Config highlights
- baseURL: `process.env.E2E_BASE_URL || 'http://localhost:5175'`
- webServer (local runs): start `npm run dev` in apps/admin and wait for port
- retries: 2 in CI, 0 locally
- reporter: html locally, dot + junit in CI
- use: trace on-first-retry, screenshot only-on-failure, video retain-on-failure

### Network mocking (default mode)
- Intercept read-only endpoints (documents list, chunks, chat history) and fulfill with fixtures to stabilize tests
- For mutating actions, prefer to assert UI intent (e.g., button becomes disabled, success toast appears) and stub 200 OK

### Running
- Local, quick smoke:
	- Headed: `npx playwright test --ui` (developer loop)
	- Headless: `npx playwright test`
- Against preview build:
	- Build: `npm --prefix apps/admin run build`
	- Preview: `npm --prefix apps/admin run preview`
	- Test with `E2E_BASE_URL=http://localhost:4173 npx playwright test`

### CI integration (GitHub Actions example)
- Trigger on PRs to master and nightly
- Cache playwright browsers; upload trace/video on failure
- Jobs:
	- typecheck/admin → build/admin → e2e/admin (mocked) → e2e/admin-live (optional, behind secret + nightly)

### Exit criteria
- A PR cannot merge if: any e2e smoke test fails, there is any console error or page error during navigation, or accessibility critical violations (if enabled) exceed threshold

### Definition of Done: new routes/views
Whenever a new route or view is added to the admin SPA, the PR must include a minimal Playwright test that visits it.

- Register the route in `apps/admin/src/router/register.tsx`.
- Add or update an e2e spec under `apps/admin/e2e/specs/` to navigate to the new path and assert:
	- The page renders a stable, semantic selector (e.g., a heading, landmark, or data-testid) that identifies the view.
	- No `console.error` events and no `pageerror` are observed (via the shared console gate fixture).
- If the route requires authentication, ensure the test runs in the authenticated project using the shared `storageState` setup.
- Prefer updating the existing navigation/smoke spec if appropriate; otherwise, create a focused spec for the new view.
- PRs that add routes without an accompanying route-visit test will be requested to add one before merge.

### Future extensions
- Route enumeration: import route registry (`apps/admin/src/router/register.tsx`) to programmatically navigate to each path and assert 200 and no console errors
- Visual snapshots: Playwright snapshot testing per route in stable containers
- Lighthouse budgets: add a separate perf check on `/admin/apps/documents` (LHCI)

