# E2E Test Conventions (Refactored)

This suite follows the Playwright guidelines enforced in the repository instructions:

## Key Practices
- Accessible locators first: `getByRole`, `getByLabel`, `getByPlaceholder`, and semantic headings.
- All complex logical groupings use `test.step()` for clearer reporting.
- No arbitrary timeouts or hard waits; rely on auto-wait + web-first assertions.
- Network stubbing isolates UI behaviour (see chat + smoke tests) to remove backend flakiness.
- Auth bootstrap is centralized in `auth.setup.ts` (project dependency graph ensures storage state before other tests).
- Console and page errors are captured via the `consoleGate` fixture and asserted to be empty in smoke-style tests.

## File Overview
- `auth.setup.ts`: Produces `./.auth/state.json` by UI login (preferred) or token injection.
- `fixtures/consoleGate.ts`: Captures runtime console + page errors.
- `fixtures/auth.ts`: Provides `authToken` fixture and attaches storage state when present.
- `authenticated.example.spec.ts`: Pattern for asserting an authenticated page loads without redirect.
- `chat.new-conversation.spec.ts`: Demonstrates auth injection + network stubbing + optimistic UI assertions.
- `smoke.spec.ts`: Iterates core routes asserting no runtime errors.
- `login.real.spec.ts`: (Skipped unless real creds) Executes real IdP round‑trip.
- `template.new-view.spec.ts`: Copy template when adding new route smoke tests.

## Adding a New Spec
1. If route requires auth, depend on existing storage state (add nothing) or inject dev auth similar to chat spec.
2. Use `test.describe('Feature - scenario', () => { ... })`.
3. Wrap logical steps with `await test.step('Description', async () => { ... })`.
4. Prefer role/name based locators. Add `data-testid` only if necessary; avoid brittle CSS chains.
5. Assert absence of console/page errors if the test's purpose is structural (smoke) rather than functional nuance.

## Running
```
npx playwright test
```
Or open the UI:
```
npx playwright test --ui
```

## Real Login
Set these env vars (e.g. in `.env.e2e`) and un-skip:
```
E2E_REAL_LOGIN=1
E2E_OIDC_EMAIL=your+tester@example.com
E2E_OIDC_PASSWORD=secret
```

## Troubleshooting
- If auth state stale: delete `e2e/.auth/state.json` and re-run.
- Broken locators: inspect element accessibility tree with `playwright codegen`.
- Dynamic class names not picked up by Tailwind? Confirm they are not constructed at runtime; add safelist if needed.
