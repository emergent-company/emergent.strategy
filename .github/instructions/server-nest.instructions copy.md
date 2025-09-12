---
applyTo: "**"
---

# Server Nest - AI Assistant development instructions 

## AI Assistant – Implementation & Change Workflow (Short Instruction)

When introducing new functionality OR modifying / fixing existing functionality, the AI Assistant must follow this tight feedback loop to ensure reliability and fast iteration:

1. Scope & Plan: Identify affected modules (Nest controllers/services/entities, DTOs, OpenAPI generation, shared types, admin UI impacts). Prefer minimal, incremental changes. For fixes, capture the failing test(s) or reproduction first.
2. Implement / Modify: Edit only necessary files; keep style & patterns consistent with existing NestJS conventions (dependency injection, validation pipes, DTO classes). Update or add tests alongside new code or failing scenarios (test-first preferred for bug fixes).
3. Generate & Typecheck:
	- OpenAPI (if endpoints changed): `npm run spec:gen:nest` (runs `apps/server-nest` openapi generation).
	- Server build: `npm run build:server-nest` (tsc must be clean).
	- Admin build (if shared types or API contracts changed): `npm run build:admin`.
4. Unit & Spec Tests:
	- Server: `npm --prefix apps/server-nest run test:spec` (ensures OpenAPI + vitest).
	- Admin (if UI touched): `npm --prefix apps/admin run test:run`.
4a. E2E Test Authoring (MANDATORY): For every new feature OR modification/fix you introduce, add or update at least one end-to-end test exercising: (a) primary success path, (b) one representative error/auth or edge case. Place server HTTP-level tests under `apps/server-nest/tests/rest/` (reuse existing helpers). If UI behavior changes, add/update an admin Playwright spec (smoke if small, full flow if critical) under `apps/admin/e2e/specs/`. Prefer test-first when clarifying expected behavior.
4b. Cross-App (Admin) Test Coverage: If a backend change alters an API contract, shared type, auth/permission shape, or anything the Admin UI consumes, you MUST (i) add or update corresponding Admin unit/integration tests in `apps/admin/tests/` and/or Playwright specs in `apps/admin/e2e/specs/`, and (ii) run `npm --prefix apps/admin run test:run` plus the relevant Playwright suite (`e2e:smoke` or `e2e` for broader impact) inside the same loop. Treat any admin test failure as a blocker—resolve by adjusting server, shared types, or UI as needed before concluding.
5. Smoke & E2E:
	- Quick smoke (API + basic UI): `npm run test:smoke` (root script if provided) or `npm --prefix apps/admin run e2e:smoke`.
	- Full authenticated/UI flows only if contracts or critical flows changed: `npm --prefix apps/admin run e2e` (or narrower `e2e:auth`).
6. Log & Output Analysis: After each command, parse stdout/stderr for TypeScript errors, failed assertions, OpenAPI diffs, unhandled promise rejections, and deprecation warnings. Treat any non-zero exit or failing test as a blocker—fix and repeat from Step 2.
7. Iteration Rule: Do not push or conclude until all builds & tests are green and OpenAPI spec (if changed) is regenerated without diff noise (`npm run spec:diff` optional sanity check).
8. Dev Server Restart Policy: Do NOT restart running dev instances (`npm run dev:all`) unless:
	- Environment variables / config files changed.
	- New dependencies added or removed.
	- Fundamental build tooling or tsconfig paths changed.
	Otherwise rely on hot reload for both admin (Vite) and server (ts-node-dev).
9. Documentation & Cleanup: If endpoints or behavior changed, update spec docs / usage notes. Remove dead code, unused imports, and keep DTO validation explicit. Note intentional contract changes in commit / PR description.
10. Final Verification: Re-run Steps 3–5 in sequence once more after last edits to ensure no regressions; ensure previously failing tests now pass.

Failure Handling: If an error recurs after two consecutive fix attempts, surface a concise root-cause hypothesis and list concrete remediation options before proceeding.

This loop guarantees every feature or fix is typed, documented, spec-aligned, and production-safe without unnecessary server restarts.
