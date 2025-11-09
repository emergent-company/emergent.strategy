# Implementation Tasks

## 1. Documentation

- [ ] 1.1 Create docs/testing/TESTING_GUIDE.md with comprehensive testing guidelines
- [ ] 1.2 Document test types (unit, integration, e2e) with clear boundaries
- [ ] 1.3 Document mocking strategies (vi.fn(), vi.spyOn(), MSW)
- [ ] 1.4 Document authentication patterns for each test type
- [ ] 1.5 Document database setup patterns (mocks vs real DB)
- [ ] 1.6 Create decision tree for choosing test type
- [ ] 1.7 Add examples of exemplary tests for each pattern
- [ ] 1.8 Document test file organization and naming conventions
- [ ] 1.9 Create docs/testing/AI_AGENT_GUIDE.md - condensed guide for AI agents
- [ ] 1.10 Add decision tree optimized for AI agent consumption
- [ ] 1.11 Add code templates for common patterns (mocks, auth, db setup)
- [ ] 1.12 Add test quality checklist for AI agents
- [ ] 1.13 Add exact command examples with expected outputs

## 2. Inline Documentation

- [ ] 2.1 Add header comments to all test files explaining what is tested
- [ ] 2.2 Document mocking decisions inline (what, why, how)
- [ ] 2.3 Document authentication setup in e2e tests
- [ ] 2.4 Document database configuration in e2e tests
- [ ] 2.5 Add comments to complex test assertions

## 3. Code Refactoring

- [ ] 3.1 Standardize unit test mocking to use vi.fn() and vi.spyOn()
- [ ] 3.2 Refactor manual mock classes to follow consistent patterns
- [ ] 3.3 Ensure all unit tests use Test.createTestingModule() where appropriate
- [ ] 3.4 Standardize e2e test setup using createE2EContext()
- [ ] 3.5 Standardize authentication in tests using authHeader() helper
- [ ] 3.6 Clean up unused mocks and imports (e.g., EmbeddingsMock in chat.service.spec.ts)
- [ ] 3.7 Fix test file imports (e.g., auto-extraction-flow.e2e-spec.ts module not found error)

## 4. Test Organization and Folder Structure Standardization

- [ ] 4.1 Audit all test file locations in apps/server-nest (test/, tests/, src/**/**tests**/, src/**/\*.spec.ts)
- [ ] 4.2 Audit all test file locations in apps/admin
- [ ] 4.3 Create new semantic directory structure: tests/unit/, tests/e2e/, tests/integration/
- [ ] 4.4 Create subdirectories in tests/unit/ mirroring source structure (auth/, graph/, chat/, etc.)
- [ ] 4.5 Move all unit tests from old tests/ to tests/unit/ with proper subdirectories
- [ ] 4.6 Move all e2e tests from old test/ to tests/e2e/
- [ ] 4.7 Move all integration tests to tests/integration/
- [ ] 4.8 Move all tests from src/modules/_/**tests**/_ to tests/unit/\*/
- [ ] 4.9 Move all .spec.ts files from src/modules/_/ to tests/unit/_/
- [ ] 4.10 Organize helpers: identify truly shared utilities
- [ ] 4.11 Create tests/helpers/ for shared utilities (if any genuinely shared)
- [ ] 4.12 Create tests/unit/helpers/ for unit-specific utilities
- [ ] 4.13 Create tests/e2e/helpers/ and move createE2EContext, authHeader, etc.
- [ ] 4.14 Create tests/integration/helpers/ if needed
- [ ] 4.15 Update all test file imports after moving files
- [ ] 4.16 Update vitest.config.ts to point to tests/unit/\*_/_.spec.ts
- [ ] 4.17 Update e2e test configuration to point to tests/e2e/\*_/_.e2e-spec.ts
- [ ] 4.18 Update integration test configuration to point to tests/integration/\*_/_.integration.spec.ts
- [ ] 4.19 Delete empty **tests**/ directories after migration
- [ ] 4.20 Delete old test/ directory after migration
- [ ] 4.21 Delete old tests/ directory after migration (once all moved to tests/unit/)
- [ ] 4.22 Apply same structure to apps/admin (tests/unit/, tests/e2e/)
- [ ] 4.23 Document the folder structure convention and helper organization in TESTING_GUIDE.md
- [ ] 4.24 Verify all unit tests run correctly: nx test server-nest
- [ ] 4.25 Verify all e2e tests run correctly: nx test-e2e server-nest
- [ ] 4.26 Update any CI/CD scripts that reference old test paths

## 5. Test Infrastructure Improvements

- [ ] 5.1 Document createE2EContext() helper usage and configuration
- [ ] 5.2 Document authHeader() helper usage and scope patterns
- [ ] 5.3 Create reusable mock factories for common dependencies
- [ ] 5.4 Document Vitest configuration (vitest.config.ts)
- [ ] 5.5 Document test scripts in package.json

## 6. Test Script Cleanup

- [ ] 6.1 Audit all test scripts in package.json (root level)
- [ ] 6.2 Audit all test scripts in apps/server-nest/project.json
- [ ] 6.3 Audit all test scripts in apps/admin/project.json
- [ ] 6.4 Remove duplicate test script definitions
- [ ] 6.5 Rename ambiguous test scripts to clearly indicate app and test type
- [ ] 6.6 Standardize naming convention (e.g., `nx test <app>` for unit, `nx test-e2e <app>` for e2e)
- [ ] 6.7 Update testing guide with all available test commands and their purpose
- [ ] 6.8 Add comments in package.json explaining test script organization

## 7. AI Tool Configuration

- [ ] 7.1 Update `.github/copilot-instructions.md` to reference AI agent testing guide
- [ ] 7.2 Add reference section to copilot-instructions explaining where to find testing patterns
- [ ] 7.3 Add `"docs/testing/AI_AGENT_GUIDE.md"` to instructions array in `opencode.jsonc`
- [ ] 7.4 Test that OpenCode can access the testing guide via instructions configuration
- [ ] 7.5 Create `.gemini/GEMINI.md` with `@docs/testing/AI_AGENT_GUIDE.md` import syntax
- [ ] 7.6 Document alternative Gemini CLI usage with `--include-directories` flag
- [ ] 7.7 Add section to TESTING_GUIDE.md explaining configuration method for each AI tool
- [ ] 7.8 Verify all three AI tools can access and reference the testing guide

## 8. Validation

- [ ] 8.1 Run all unit tests and verify they pass
- [ ] 8.2 Run all e2e tests and verify they pass
- [ ] 8.3 Verify test coverage hasn't decreased
- [ ] 8.4 Review documentation for completeness
- [ ] 8.5 Get peer review on testing guidelines

## 9. Examples and Templates

- [ ] 9.1 Create example unit test template
- [ ] 9.2 Create example integration test template
- [ ] 9.3 Create example e2e test template
- [ ] 9.4 Document common test patterns (service, controller, guard, etc.)
