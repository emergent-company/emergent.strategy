# Design: Test Infrastructure Documentation and Standardization

## Context

The project has grown to ~100+ test files across unit, integration, and e2e tests, but testing patterns evolved organically without formal documentation. This creates friction for contributors and inconsistency in test quality. The project uses:

- **Testing Frameworks**: Vitest for unit tests, custom e2e harness built on top of NestJS testing utilities
- **Database**: PostgreSQL with Row-Level Security (RLS) policies for multi-tenancy
- **Authentication**: Zitadel for OIDC, scope-based authorization
- **Architecture**: NestJS monorepo with multiple apps (admin, server)

Key stakeholders: All developers writing or maintaining tests.

## Goals / Non-Goals

### Goals

- Provide clear, actionable documentation for all testing patterns
- Standardize mocking approaches using Vitest best practices
- Document authentication and database setup for each test type
- Enable new contributors to write high-quality tests quickly
- Improve test maintainability through consistent patterns

### Non-Goals

- Rewrite all existing tests (only refactor inconsistent patterns)
- Change testing frameworks or tools
- Add new testing infrastructure (use existing tools)
- Achieve 100% test coverage (focus on documentation, not coverage)
- Create automated test generation

## Decisions

### Decision 1: Four-Tier Test Organization

**What**: Organize tests into four clear tiers: Unit, Integration, API E2E, Browser E2E

**Why**:

- Clear boundaries help developers choose the right test type
- Different tiers have different trade-offs (speed vs realism)
- API e2e and browser e2e are fundamentally different: HTTP testing vs UI automation
- Aligns with industry best practices and NestJS/Playwright documentation

**Implementation**:

- **Unit Tests**: Test single classes/functions in isolation, mock all dependencies
  - Location (server): `/apps/server/tests/unit/**/*.spec.ts`
  - Location (admin): `/apps/admin/src/**/*.test.tsx`
  - Use: `Test.createTestingModule()` with mocked providers (NestJS) or Vitest (React)
  - Database: Always mocked
  - Auth: Mock ExecutionContext
- **Integration Tests**: Test multiple components together, mock external boundaries
  - Location (server): `/apps/server/tests/integration/**/*.integration.spec.ts`
  - Use: `Test.createTestingModule()` with real services, mocked external deps
  - Database: Can use in-memory or mocked
  - Auth: Mock tokens
- **API E2E Tests**: Test complete API workflows with HTTP requests, use real infrastructure
  - Location (server only): `/apps/server/tests/e2e/**/*.e2e-spec.ts`
  - Use: `createE2EContext()` helper + supertest for HTTP
  - Database: Real Postgres with RLS
  - Auth: Real tokens via `authHeader()`
- **Browser E2E Tests**: Test complete UI workflows with browser automation
  - Location (admin only): `/apps/admin/e2e/**/*.spec.ts`
  - Use: Playwright with fixtures
  - Backend: Real API server
  - Auth: Real Zitadel login flow via Playwright

**Alternatives Considered**:

- Single "e2e" category for both API and browser: Rejected - fundamentally different tools and patterns
- Three tiers (combine API/browser e2e): Rejected - hides important distinction
- Five tiers (add component tests): Rejected - adds complexity without clear value

### Decision 2: Vitest Mocking Patterns

**What**: Standardize on Vitest's built-in mocking utilities

**Why**:

- Native Vitest support with good DX
- Type-safe with TypeScript
- Consistent with modern JavaScript testing practices
- Avoids custom mock frameworks

**Patterns**:

- `vi.fn()`: Simple function mocks, single responsibility
- `vi.spyOn()`: Spy on existing methods, observe calls
- `vi.mock()`: Module-level mocks for external dependencies
- MSW: HTTP request mocking for realistic API testing

**What to Avoid**:

- Manual mock classes (e.g., `DbMock`) unless genuinely needed for complex state
- Jest-style mocks (project uses Vitest)
- Overly complex mock setups that obscure test intent

### Decision 3: MSW for HTTP Mocking

**What**: Use Mock Service Worker (MSW) for HTTP request mocking

**Why**:

- More realistic than mocking HTTP clients directly
- Works at network level, closer to production behavior
- Better for testing error handling and retry logic
- Recommended by Vitest and React Testing Library communities

**Implementation**:

- Set up MSW handlers in test setup files
- Use for ClickUp API, Zitadel, and other external HTTP calls
- Document handler patterns in testing guide

**Alternatives Considered**:

- Mocking axios/fetch directly: Rejected - less realistic, ties tests to implementation
- Nock: Rejected - MSW is more modern and better maintained

### Decision 4: Real Database for API E2E Tests

**What**: Continue using real PostgreSQL for API e2e tests with RLS isolation

**Why**:

- Tests real database constraints and RLS policies (critical for security)
- Catches database-specific issues (indexes, transactions, etc.)
- Project already has robust API e2e infrastructure via `createE2EContext()`
- RLS provides natural test isolation without complex teardown

**Trade-offs**:

- Slower than in-memory/mocked DB
- Requires local Postgres setup
- Accepted because: API E2E tests prioritize realism over speed

**Implementation**:

- Keep `createE2EContext()` helper as-is
- Document setup requirements clearly
- Provide Docker Compose for local development

### Decision 5: Authentication Testing Patterns

**What**: Use different auth strategies for different test types

**Why**:

- API tests need token-based auth (matches production auth model)
- Browser tests need real login flow (tests actual UX)
- Unit tests need mock auth (speed and isolation)

**Patterns**:

**API E2E (Server)**:

```typescript
// No auth
await request(app.getHttpServer()).get('/endpoint');

// Basic auth
await request(app.getHttpServer())
  .get('/endpoint')
  .set('Authorization', authHeader());

// Scoped auth
await request(app.getHttpServer())
  .get('/endpoint')
  .set('Authorization', authHeader(['read:documents', 'write:tasks']));
```

**Browser E2E (Admin)**:

```typescript
// Playwright fixture with real Zitadel login
test('user can view dashboard', async ({ authenticatedPage }) => {
  await authenticatedPage.goto('/dashboard');
  // ...
});
```

**Unit Tests**:

```typescript
// Mock ExecutionContext
const mockContext = {
  switchToHttp: () => ({
    getRequest: () => ({ user: { sub: 'user-123' } }),
  }),
} as ExecutionContext;
```

### Decision 6: Inline Documentation Strategy

**What**: Add inline comments explaining what is mocked and why

**Why**:

- Makes tests self-documenting
- Reduces cognitive load when reviewing tests
- Helps future maintainers understand test decisions

**Template**:

```typescript
/**
 * Tests the chat service's message handling.
 *
 * Mocked:
 * - Database client: Uses in-memory test data
 * - Embeddings service: Returns deterministic vectors
 * - LangGraph: Skipped to test business logic only
 *
 * Auth: Mock user with chat:read scope
 */
describe('ChatService', () => {
  // ...
});
```

### Decision 7: Central Testing Guide

**What**: Create `docs/testing/TESTING_GUIDE.md` as single source of truth

**Why**:

- Easier to maintain than scattered documentation
- Clear entry point for new contributors
- Can reference from PR templates and onboarding docs

**Structure**:

1. Overview and philosophy
2. Test types and when to use each
3. Mocking patterns and examples
4. Authentication setup
5. Database setup
6. Test organization
7. Running tests
8. Troubleshooting

### Decision 8: AI Agent Testing Guide

**What**: Create `docs/testing/AI_AGENT_GUIDE.md` as a condensed, actionable guide optimized for AI coding agents

**Why**:

- AI agents need concise, structured information without prose
- Code templates reduce hallucination and improve consistency
- Clear decision trees help AI agents make correct choices quickly
- Project increasingly uses AI agents for development tasks

**Key Differences from Human Guide**:

- **Format**: Structured as rules and templates, not explanatory prose
- **Decision Trees**: Simple flowcharts with concrete criteria
- **Code Templates**: Copy-paste examples for every pattern
- **Checklists**: Boolean validation criteria for test quality
- **Commands**: Exact command strings with expected output patterns

**Structure**:

```markdown
# AI Agent Testing Guide

## Quick Decision Tree

[Flowchart: What to test? → Test type selection]

## Rules

- Rule 1: Always mock external dependencies in unit tests
- Rule 2: Use createE2EContext() for e2e tests
- [etc.]

## Templates

### Unit Test Template

[Complete code example]

### Mock Setup Template

[Code for vi.fn(), vi.spyOn(), MSW]

### Auth Template

[Code for unit and e2e auth]

### Database Template

[Code for mock and real DB]

## Quality Checklist

- [ ] Test has clear describe/it blocks
- [ ] Assertions are meaningful
- [ ] Cleanup is handled
- [etc.]

## Commands

- Unit: `nx test <app>`
- E2E: `nx test-e2e <app>`
```

**Implementation**:

- Keep under 500 lines for fast AI context loading
- Use code blocks for every concept
- Minimize explanatory text
- Optimize for copy-paste and pattern matching

**Alternatives Considered**:

- Single guide for humans and AI: Rejected - different audiences need different formats
- Embedding guide in system prompts: Rejected - too dynamic, better as separate doc AI can reference

### Decision 9: Test Folder Structure Standardization

**What**: Consolidate scattered test files into a semantic, centralized folder structure with clear type-based organization, **distinguishing between API e2e and browser e2e**

**Why**:

- Tests currently scattered across multiple locations create confusion (server app):
  - `/apps/server/test/` (API e2e tests)
  - `/apps/server/tests/` (unit tests)
  - `/apps/server/src/modules/*/__tests__/` (co-located unit tests)
  - `/apps/server/src/modules/*/*.spec.ts` (inline spec files)
- **"test" vs "tests" is confusing and not semantic** - doesn't indicate what's inside
- **"e2e" doesn't distinguish between API testing and browser testing** - they use completely different tools (supertest vs Playwright)
- Inconsistent patterns make it hard to find and organize tests
- Co-located tests in `src/` blur the line between production and test code
- Centralized test folders are easier to configure in test runners and IDE tooling
- Semantic folder names make structure self-documenting

**Standard Structure**:

```
apps/
  server/                   # Backend API (NestJS)
    tests/
      unit/                 # Unit tests (mirror src structure)
        auth/
          auth.guard.spec.ts
          auth.service.spec.ts
        chat/
          chat.service.spec.ts
        graph/
          graph.service.spec.ts
        helpers/            # Unit-specific test utilities (if needed)
          mock-factories.ts
      e2e/                  # API E2E tests (HTTP/REST with supertest)
        auth-flow.e2e-spec.ts
        chat-flow.e2e-spec.ts
        extraction-flow.e2e-spec.ts
        helpers/            # E2E-specific utilities
          createE2EContext.ts
          authHeader.ts
      integration/          # Integration tests
        clickup-api.integration.spec.ts
        helpers/            # Integration-specific utilities
      helpers/              # Shared across ALL test types (only if truly shared)
        test-logger.ts
        common-assertions.ts
    src/                    # Production code only (no test files)
      modules/
        auth/
        chat/
        graph/

  admin/                    # Frontend UI (React + Vite)
    tests/
      unit/                 # React component unit tests
        components/
          atoms/
            Button.test.tsx
          molecules/
            PageTitle.test.tsx
        contexts/
          auth.logout.test.tsx
          toast.test.tsx
        hooks/
          use-local-storage.test.tsx
        helpers/            # Unit-specific utilities
      e2e/                  # Browser E2E tests (Playwright)
        specs/
          smoke.spec.ts
          extraction.manual-flow.spec.ts
          documents.aria.spec.ts
        fixtures/           # Playwright fixtures
          auth.ts
          app.ts
        helpers/
          test-user.ts
        playwright.config.ts
    src/                    # Production code only (no test files)
      components/
      contexts/
      hooks/
```

**Key Distinctions**:

1. **Server app**: API-focused, uses `tests/e2e/` for HTTP testing with supertest
2. **Admin app**: UI-focused, uses `tests/e2e/` for browser testing with Playwright
3. **Both apps use consistent `tests/` structure** for all test types
4. **Naming convention**:
   - Server e2e: `*.e2e-spec.ts` (supertest, HTTP requests)
   - Admin e2e: `*.spec.ts` (Playwright, browser automation)
   - Server unit: `*.spec.ts`
   - Admin unit: `*.test.tsx` (React Testing Library convention)
   - Integration: `*.integration.spec.ts`

**Helper Organization Strategy**:

- **Root `tests/helpers/`**: ONLY for utilities genuinely shared across multiple test types
- **Type-specific `tests/{type}/helpers/`**: For utilities used only by that test type
- **Principle**: Keep helpers close to where they're used unless truly shared

**Migration Strategy**:

**Server app**:

1. Create new structure: `tests/unit/`, `tests/e2e/`, `tests/integration/`
2. Move all tests from `src/modules/*/__tests__/` to `tests/unit/*/`
3. Move all `*.spec.ts` files from `src/modules/` to `tests/unit/*/`
4. Move tests from old `test/` to `tests/e2e/` (keep `*.e2e-spec.ts` naming)
5. Move tests from old `tests/` to `tests/unit/`
6. Maintain subdirectory structure matching source modules in `tests/unit/`
7. Organize helpers by scope (shared vs type-specific)
8. Update imports in moved test files
9. Update vitest/jest configuration to new paths:
   - Unit: `tests/unit/**/*.spec.ts`
   - E2E: `tests/e2e/**/*.e2e-spec.ts`
   - Integration: `tests/integration/**/*.integration.spec.ts`
10. Delete empty `__tests__/` directories and old `test/` folder

**Admin app**:

1. Create new structure: `tests/unit/`, `tests/e2e/`
2. Move e2e tests from root `e2e/` to `tests/e2e/`
3. Move all `*.test.tsx` files from `src/**/*.test.tsx` to `tests/unit/` (mirror src structure)
4. Create subdirectories: `tests/unit/components/`, `tests/unit/contexts/`, `tests/unit/hooks/`
5. Organize helpers by scope
6. Update imports in moved test files
7. Update vitest configuration:
   - Unit: `tests/unit/**/*.test.tsx`
   - E2E: `tests/e2e/**/*.spec.ts`
8. Update Playwright config path
9. Delete old root `e2e/` directory after migration

**Benefits**:

- **Consistent structure**: Both apps use `tests/` directory with same organization
- **Self-documenting**: `tests/e2e/` and `tests/unit/` are clear regardless of app
- **No ambiguity**: No confusion between "test" and "tests"
- **Context from app name**: Server's e2e = API tests, Admin's e2e = browser tests
- **Tool-specific organization**: API tests use supertest, browser tests use Playwright
- **Semantic organization**: Type → Module → Test file hierarchy
- **Clear separation**: Production code stays in `src/`, tests in dedicated directory
- **Easier configuration**: Can target specific test types in test runner
- **Scalable**: Easy to add more test types (visual, performance, etc.)
- **Better IDE support**: Dedicated test folders with semantic names
- **Flexible helpers**: Can have shared helpers + type-specific helpers
- **Future-proof**: Easy to add `tests/performance/`, `tests/visual/`, etc.
- **Consistent structure**: Same pattern across entire monorepo
- **Industry standard**: Matches common patterns in Node.js/NestJS projects

**Alternatives Considered**:

- Keep `test/` and `tests/` separate folders: Rejected - confusing, not semantic
- Keep co-located `__tests__/` folders: Rejected - mixes concerns, harder to configure tooling
- Flat structure with filename prefixes: Rejected - doesn't scale, loses organization
- Type at root level (`unit-tests/`, `e2e-tests/`): Rejected - clutters root, not idiomatic
- Move all tests to project root `test/` without subdirectories: Rejected - loses organizational structure

### Decision 10: AI Tool Configuration

**What**: Configure project AI tools (GitHub Copilot, OpenCode, Gemini CLI) to reference the AI agent testing guide

**Why**:

- Ensures AI agents have consistent access to testing patterns
- Reduces hallucination by providing authoritative guidance
- Improves test quality when using AI assistance
- Project uses multiple AI tools that should follow same standards

**Implementation**:

- **GitHub Copilot**: Add reference to AI agent guide in `.github/copilot-instructions.md`
  - Copilot reads this file automatically for workspace context
  - Add section: "For testing, reference docs/testing/AI_AGENT_GUIDE.md"
- **OpenCode**: Add AI agent guide path to `opencode.jsonc` instructions array
  - OpenCode config supports `instructions` array with paths/globs to instruction files
  - Update: `"instructions": [".opencode/instructions.md", "docs/testing/AI_AGENT_GUIDE.md"]`
  - OpenCode loads these files and includes them in the AI's context automatically
- **Gemini CLI**: Add AI agent guide to project GEMINI.md context file
  - Gemini CLI uses hierarchical context files (GEMINI.md) with `@import` syntax
  - Create `.gemini/GEMINI.md` in project root with: `@docs/testing/AI_AGENT_GUIDE.md`
  - Alternatively, use `--include-directories docs/testing` CLI flag for on-demand inclusion
  - Context files are automatically loaded from `.gemini/` directory in project

**Configuration Strategy**:

- Reference guide by path, don't duplicate content (single source of truth)
- Each tool uses its native configuration mechanism:
  - GitHub Copilot: Markdown reference in copilot-instructions.md
  - OpenCode: JSON array in opencode.jsonc instructions field
  - Gemini CLI: @import in GEMINI.md or --include-directories flag
- All three tools support hierarchical/imported instructions
- Test that each tool can actually access the guide

**Alternatives Considered**:

- Duplicate content in each tool's config: Rejected - maintenance burden, drift risk
- Only configure one tool: Rejected - team uses multiple tools
- Create unified config format: Rejected - each tool has different capabilities
- MCP server for testing guidance: Future consideration, but not needed initially

## Risks / Trade-offs

### Risk: Documentation Drift

**Mitigation**:

- Link testing guide from PR template
- Add reminder in contributing guide
- Include in onboarding checklist

### Risk: Refactoring Breaks Tests

**Mitigation**:

- Refactor incrementally, run tests frequently
- Focus on high-value refactorings first (unused mocks, broken imports)
- Don't change test behavior, only patterns

### Risk: Inconsistent Adoption

**Mitigation**:

- Provide clear examples and templates
- Review tests in PRs for compliance
- Update existing tests opportunistically

### Trade-off: Documentation Maintenance Burden

**Acceptance**: Worth it for improved developer experience and test quality

## Migration Plan

### Phase 1: Documentation (No Code Changes)

1. Create testing guide
2. Document current patterns
3. Get feedback from team
4. No breaking changes

### Phase 2: Low-Risk Refactoring

1. Remove unused imports/mocks
2. Fix broken test file paths
3. Add inline documentation
4. All tests still pass

### Phase 3: Pattern Standardization

1. Refactor manual mock classes to vi.fn()
2. Standardize Test.createTestingModule() usage
3. Update tests incrementally
4. Maintain backward compatibility

### Rollback Plan

- Documentation changes: Easily reverted
- Code refactorings: Isolated to individual test files, can revert per-file
- All changes non-breaking to test functionality

## Open Questions

1. Should we add integration test tier now or later?
   - **Recommendation**: Document in guide but add tests opportunistically
2. Should we enforce testing patterns via linter rules?

   - **Recommendation**: Start with documentation, add linting if adoption is low

3. How to handle flaky e2e tests?

   - **Recommendation**: Document common pitfalls and retry strategies in guide

4. Should we extract `createE2EContext()` to a package?
   - **Recommendation**: Keep in-repo for now, extract if needed by other projects
