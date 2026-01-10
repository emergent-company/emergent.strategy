# Change: Document and Standardize Test Infrastructure

## Why

The project has ~100+ test files across unit, integration, API e2e, and browser e2e tests, but lacks clear documentation on testing patterns, mocking strategies, authentication handling, and database setup. This creates inconsistency in how tests are written and makes onboarding difficult for new contributors.

## What Changes

- Add comprehensive documentation for testing patterns (unit, integration, API e2e, browser e2e)
- Standardize mocking approaches using Vitest best practices and MSW
- Document authentication patterns for tests (scope-based tokens, Zitadel integration, Playwright auth)
- Clarify database setup strategies (real DB with RLS for API e2e, mocks for unit)
- Add inline documentation to existing test files explaining what is mocked
- Refactor inconsistent test patterns to follow established conventions
- Create testing guidelines document
- **Create condensed AI agent testing guide** with decision trees, code templates, and quality checklists
- **Standardize test folder structure** by consolidating scattered tests from `src/**/__tests__/` and inline `*.spec.ts` files into a semantic centralized structure:
  - **Server**: `tests/unit/`, `tests/e2e/`, `tests/integration/`
  - **Admin**: `tests/unit/`, `tests/e2e/` (consistent structure across all apps)
- **Distinguish between API e2e and browser e2e**:
  - API e2e: HTTP/REST testing with supertest (apps/server)
  - Browser e2e: UI testing with Playwright (apps/admin)
- Organize tests into clear categories with defined boundaries
- Clean up test scripts in package.json and project.json files to clearly indicate which app and test type
- Remove duplicate or ambiguous test script definitions
- Standardize test script naming conventions
- **Configure AI tools** (GitHub Copilot, OpenCode, Gemini CLI) to reference the AI agent testing guide

## Impact

- **Affected specs**: Creates new `testing` capability spec
- **Affected code**:
  - **Server app**: All test files across `/apps/server/test/`, `/apps/server/tests/`, and `/apps/server/src/**/__tests__/`
  - **Admin app**: Browser tests in `/apps/admin/e2e/`
  - Test helper files (`createE2EContext`, `authHeader`, mock classes, Playwright fixtures)
  - Testing configuration files (vitest.config.ts, playwright.config.ts, package.json test scripts)
  - Will add new documentation files:
    - `docs/testing/TESTING_GUIDE.md` (comprehensive guide for humans)
    - `docs/testing/AI_AGENT_GUIDE.md` (condensed guide for AI agents)
  - Configuration files for AI tools:
    - `.github/copilot-instructions.md` (add testing guide reference)
    - `opencode.jsonc` (add testing guide to instructions array)
    - `.gemini/GEMINI.md` (add testing guide import)
  - Will create new semantic test structure for **server app**:
    - `apps/server/tests/unit/` (unit tests)
    - `apps/server/tests/e2e/` (API e2e tests - HTTP/REST with supertest)
    - `apps/server/tests/integration/` (integration tests)
    - `apps/server/tests/helpers/` (shared helpers)
    - `apps/server/tests/{type}/helpers/` (type-specific helpers)
  - Will create new semantic test structure for **admin app**:
    - `apps/admin/tests/unit/` (React component unit tests)
    - `apps/admin/tests/e2e/` (browser e2e tests - Playwright)
    - `apps/admin/tests/helpers/` (shared test utilities)
    - `apps/admin/tests/{type}/helpers/` (type-specific helpers)

## Current State Findings

### Test Types Identified

1. **Unit Tests** - Service and guard tests with manual mocks (both apps)
2. **API E2E Tests** - Server app integration tests using real database, auth, and HTTP requests (supertest)
3. **Browser E2E Tests** - Admin app UI tests using Playwright for browser automation
4. **Mixed Patterns** - Some use NestJS Testing Module, others manual DI

### Issues Found

- Inconsistent mocking (vi.fn() vs manual mock classes)
- Minimal inline documentation
- No clear guidelines on when to use real DB vs mocks
- Authentication setup varies between test types
- **Test files scattered across multiple inconsistent locations**:
  - **Server app**: Some in `/apps/server/tests/`, some in `/apps/server/test/`, some in `/apps/server/src/modules/*/__tests__/`, some inline as `/apps/server/src/modules/*/*.spec.ts`
  - **Admin app**: E2E tests in `/apps/admin/e2e/`, unit tests scattered in `/apps/admin/src/**/*.test.tsx`
- **Confusing folder names**: "test" vs "tests" is ambiguous and not semantic
- **API e2e vs Browser e2e not distinguished clearly in structure**
- **Admin tests not consistently organized**: E2E at root level, unit tests co-located with source
- Test organization lacks clear structure and type-based categorization

### Authentication Patterns

- **Server (API)**: Uses `authHeader()` helper with scope-based tokens
- **Admin (Browser)**: Uses Playwright fixtures with real Zitadel login flow
- Zitadel integration for auth testing
- Different approaches for unit vs e2e tests

### Database Patterns

- Real Postgres with RLS policies for API e2e tests
- Manual mocks (DbMock) for unit tests
- Custom `createE2EContext()` helper for setup/teardown
