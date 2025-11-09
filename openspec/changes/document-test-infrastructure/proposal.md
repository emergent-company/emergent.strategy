# Change: Document and Standardize Test Infrastructure

## Why

The project has ~100+ test files across unit, integration, and e2e tests, but lacks clear documentation on testing patterns, mocking strategies, authentication handling, and database setup. This creates inconsistency in how tests are written and makes onboarding difficult for new contributors.

## What Changes

- Add comprehensive documentation for testing patterns (unit, integration, e2e)
- Standardize mocking approaches using Vitest best practices and MSW
- Document authentication patterns for tests (scope-based tokens, Zitadel integration)
- Clarify database setup strategies (real DB with RLS for e2e, mocks for unit)
- Add inline documentation to existing test files explaining what is mocked
- Refactor inconsistent test patterns to follow established conventions
- Create testing guidelines document
- **Create condensed AI agent testing guide** with decision trees, code templates, and quality checklists
- **Standardize test folder structure** by consolidating scattered tests from `src/**/__tests__/` and inline `*.spec.ts` files into a semantic centralized structure: `tests/unit/`, `tests/e2e/`, `tests/integration/` with clear type-based organization
- Organize tests into clear categories with defined boundaries
- Clean up test scripts in package.json and project.json files to clearly indicate which app and test type
- Remove duplicate or ambiguous test script definitions
- Standardize test script naming conventions
- **Configure AI tools** (GitHub Copilot, OpenCode, Gemini CLI) to reference the AI agent testing guide

## Impact

- **Affected specs**: Creates new `testing` capability spec
- **Affected code**:
  - All test files across `/apps/server-nest/test/`, `/apps/server-nest/tests/`, and `/apps/server-nest/src/**/__tests__/`
  - Test helper files (`createE2EContext`, `authHeader`, mock classes)
  - Testing configuration files (vitest.config.ts, package.json test scripts)
  - Will add new documentation files:
    - `docs/testing/TESTING_GUIDE.md` (comprehensive guide for humans)
    - `docs/testing/AI_AGENT_GUIDE.md` (condensed guide for AI agents)
  - Configuration files for AI tools:
    - `.github/copilot-instructions.md` (add testing guide reference)
    - `opencode.jsonc` (add testing guide to instructions array)
    - `.gemini/GEMINI.md` (add testing guide import)
  - Will create new semantic test structure:
    - `apps/server-nest/tests/unit/` (unit tests)
    - `apps/server-nest/tests/e2e/` (e2e tests)
    - `apps/server-nest/tests/integration/` (integration tests)
    - `apps/server-nest/tests/helpers/` (shared helpers)
    - `apps/server-nest/tests/{type}/helpers/` (type-specific helpers)

## Current State Findings

### Test Types Identified

1. **Unit Tests** - Service and guard tests with manual mocks
2. **E2E Tests** - Integration tests using real database and auth
3. **Mixed Patterns** - Some use NestJS Testing Module, others manual DI

### Issues Found

- Inconsistent mocking (vi.fn() vs manual mock classes)
- Minimal inline documentation
- No clear guidelines on when to use real DB vs mocks
- Authentication setup varies between test types
- **Test files scattered across multiple inconsistent locations**:
  - Some in `/apps/server-nest/tests/`
  - Some in `/apps/server-nest/test/`
  - Some in `/apps/server-nest/src/modules/*/__tests__/`
  - Some inline as `/apps/server-nest/src/modules/*/*.spec.ts`
- **Confusing folder names**: "test" vs "tests" is ambiguous and not semantic
- Test organization lacks clear structure and type-based categorization

### Authentication Patterns

- Uses `authHeader()` helper with scope-based tokens
- Zitadel integration for auth testing
- Different approaches for unit vs e2e tests

### Database Patterns

- Real Postgres with RLS policies for e2e tests
- Manual mocks (DbMock) for unit tests
- Custom `createE2EContext()` helper for setup/teardown
