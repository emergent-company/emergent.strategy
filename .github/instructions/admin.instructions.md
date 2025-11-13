---
applyTo: "**"
---

# Admin Frontend - AI Assistant development instructions 

## Admin (React) – Mandatory Build & Test Loop Addendum

Whenever you add a new feature OR make any fix/refactor that can affect runtime behavior you MUST follow this loop for the **Admin** app.

### 1. Scope & Plan (Admin)
- Identify UI surface (page, component, hook, context) and any coupled API contract.
- Confirm if Org / Project gate, Auth, or Chat dependencies are involved (routes behind `/admin/apps/...`).
- Decide minimal incremental change set; avoid broad rewrites in a single PR.

### 2. Implement
- Add / edit strictly typed TSX or hooks (no `any`).
- Keep Tailwind/daisyUI utility approach; avoid ad‑hoc CSS unless necessary (then put overrides in `src/styles/core/components.css` and import via `src/styles/app.css`).
- Update / create unit tests (Vitest) for pure logic (helpers, hooks) if present.

### 3. Build (ALWAYS before committing)
- Run Admin type check/build: `nx run admin:build`.
	- Treat any TypeScript error as a blocker.
- If shared types changed (used by server) re-run server build too (`nx run server:build`).

### 4. Playwright E2E Tests
- Run targeted spec you touched first: `nx run admin:e2e -- e2e/specs/<spec>.spec.ts --project=chromium`.
- For full regression (pre-PR): `nx run admin:e2e` (append `-- --project=chromium` for a specific browser).
- Always ensure auth setup project passes first (it generates storage state).

### 5. Analyzing Failures (Playwright)
For every failing test there will be a directory under `apps/admin/test-results/<test-slug>-<project>/` containing:
- `error-context.md` ("Error Context") – READ THIS FIRST.
	- Contains page URL, console errors, and snapshot. Use it to confirm you are on the intended page (e.g., if you see Org/Project creation form, your test hit the gate instead of the app surface).
- `test-failed-*.png` screenshot – visually inspect missing elements/selectors.
- `video.webm` – playback for race/timing issues.

Failure triage steps:
1. Confirm correct route (snapshot URL vs expected). If wrong, fix navigation or prerequisite gating (seed org & project via localStorage or stub `/orgs` & `/projects`).
2. Check console errors in `error-context.md` for runtime exceptions or network 4xx/5xx.
3. Validate selectors: open component source; verify placeholder/text/role still matches. Avoid over‑broad regex.
4. For guarded pages (Org/Project gate): seed config (`__nexus_config_v1__`) before navigation OR stub org/project endpoints to return at least one item each.
5. Re-run the single failing test after each fix. Do not batch speculative changes.
6. If SSE / streaming flows hang: confirm stubbed route method & URL pattern; ensure you fulfill with `text/event-stream` and newline-delimited `data:` frames ending with a blank line.
7. After two failed fix attempts, write down a root cause hypothesis and alternative remediation options before proceeding.

### 6. Commit Readiness Checklist (Admin)
- [ ] Admin build passes (type check clean)
- [ ] Modified / new Playwright specs pass locally (at least Chromium)
- [ ] Any new selectors use accessible roles/names (prefer `getByRole`, `getByLabel`, `getByText`)
- [ ] No unused imports or console noise introduced
- [ ] Org / Project gating handled deterministically in tests

### 7. When Adding New E2E Tests
- Put specs under `apps/admin/e2e/specs/` following `<feature>.<action>.spec.ts` naming.
- Include at least: success path + one negative/edge (auth/gate/validation) path.
- Use `test.step()` groupings with user-centric phrasing.
- Prefer role/text/label based locators; avoid brittle CSS chains.

### 8. Common Chat Test Setup Pattern
Seed:
1. Auth storage (via setup project or token injection for isolated runs)
2. LocalStorage config for org/project OR stub `/orgs` & `/projects`
3. Network stubs for `/chat/conversations`, `/chat/<id>`, `/chat/stream` with deterministic frames
4. Navigate to `/admin/apps/chat/c/new` then wait for either heading `Ask your knowledge base` OR breadcrumb `AI Chat` plus a composer placeholder (`Let us know what you need...` or `Ask a question`).

### 9. Fast Reproduce Script (Optional)
Add a shell alias or custom Nx target for tight loops, e.g.: `nx run admin:e2e -- e2e/specs/chat.new-conversation.spec.ts --project=chromium`

### 10. Do Not Skip Build/Test
Every feature or fix MUST end with admin build + relevant tests green. Do not rely on CI for basic type or selector validation.


