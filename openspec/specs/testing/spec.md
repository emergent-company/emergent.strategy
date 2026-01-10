# testing Specification

## Purpose
TBD - created by archiving change document-test-infrastructure. Update Purpose after archive.
## Requirements
### Requirement: Test Documentation Standards

The testing infrastructure SHALL provide comprehensive documentation for all test types, patterns, and conventions used in the project.

#### Scenario: Developer writes new test

- **WHEN** a developer needs to write a new test
- **THEN** they can reference clear documentation on test types, mocking patterns, auth setup, and database configuration

#### Scenario: Developer reviews existing test

- **WHEN** a developer reviews an existing test file
- **THEN** inline comments explain what is mocked, why, and how authentication/database are configured

### Requirement: Unit Test Patterns

The testing infrastructure SHALL define standardized unit test patterns using Vitest and NestJS Testing Module.

#### Scenario: Service unit test with dependencies

- **WHEN** testing a service with external dependencies
- **THEN** use vi.fn() for simple mocks or vi.spyOn() for partial mocks, following Vitest best practices

#### Scenario: Guard unit test

- **WHEN** testing authentication guards
- **THEN** mock ExecutionContext and provide test tokens/user objects consistently

#### Scenario: Controller unit test

- **WHEN** testing controllers
- **THEN** use NestJS Test.createTestingModule() with mocked service dependencies

### Requirement: Integration Test Patterns

The testing infrastructure SHALL define standardized integration test patterns for testing multiple components together.

#### Scenario: API endpoint integration test

- **WHEN** testing API endpoints with multiple services
- **THEN** use Test.createTestingModule() with real services but mocked external dependencies (database, HTTP clients)

#### Scenario: Service integration test

- **WHEN** testing service interactions
- **THEN** mock only the boundaries (external APIs, database) while keeping service logic real

### Requirement: E2E Test Patterns

The testing infrastructure SHALL define standardized end-to-end test patterns using real database and authentication.

#### Scenario: E2E test with database

- **WHEN** running end-to-end tests
- **THEN** use createE2EContext() helper to set up real Postgres database with RLS policies and proper cleanup

#### Scenario: E2E test with authentication

- **WHEN** running authenticated e2e tests
- **THEN** use authHeader() helper with appropriate scopes for the test scenario

#### Scenario: E2E test cleanup

- **WHEN** e2e tests complete
- **THEN** automatically clean up test data using context teardown methods

### Requirement: Mocking Strategy Documentation

The testing infrastructure SHALL document when to use different mocking approaches.

#### Scenario: Simple function mock

- **WHEN** a function returns a value without side effects
- **THEN** use vi.fn() with mockReturnValue or mockResolvedValue

#### Scenario: HTTP request mock

- **WHEN** testing code that makes HTTP requests
- **THEN** use MSW (Mock Service Worker) for realistic HTTP mocking

#### Scenario: Database mock for unit tests

- **WHEN** unit testing services that use database
- **THEN** mock the database client/repository with vi.fn() returning test data

#### Scenario: Spy on existing method

- **WHEN** testing code that calls a method you want to observe
- **THEN** use vi.spyOn() to track calls while preserving or overriding implementation

### Requirement: Authentication Test Patterns

The testing infrastructure SHALL document how to handle authentication in different test types.

#### Scenario: Unit test with auth

- **WHEN** unit testing code that requires auth context
- **THEN** provide mock ExecutionContext with test user object and scopes

#### Scenario: E2E test with auth scopes

- **WHEN** e2e testing endpoints requiring specific scopes
- **THEN** use authHeader() with scope array matching the endpoint requirements

#### Scenario: Zitadel integration test

- **WHEN** testing Zitadel authentication flow
- **THEN** use test service account credentials from environment or test config

### Requirement: Database Test Patterns

The testing infrastructure SHALL document database setup strategies for different test types.

#### Scenario: Unit test database mock

- **WHEN** unit testing services with database operations
- **THEN** mock the database client/repository, document the mock behavior inline

#### Scenario: E2E test real database

- **WHEN** running e2e tests
- **THEN** use createE2EContext() to provision real Postgres with test isolation via RLS policies

#### Scenario: Test data cleanup

- **WHEN** tests create database records
- **THEN** clean up test data in afterEach or afterAll hooks using context cleanup methods

### Requirement: Test Organization and Folder Structure

The testing infrastructure SHALL organize tests into clear categories with semantic folder names and defined file locations, eliminating scattered test files across multiple inconsistent locations.

#### Scenario: Unit test file location

- **WHEN** creating unit tests
- **THEN** place in /apps/{app}/tests/unit/ with .spec.ts extension (e.g., /apps/server-nest/tests/unit/auth/auth.service.spec.ts)

#### Scenario: E2E test file location

- **WHEN** creating e2e tests
- **THEN** place in /apps/{app}/tests/e2e/ with .e2e-spec.ts extension (e.g., /apps/server-nest/tests/e2e/auth-flow.e2e-spec.ts)

#### Scenario: Integration test file location

- **WHEN** creating integration tests
- **THEN** place in /apps/{app}/tests/integration/ with .integration.spec.ts extension (e.g., /apps/server-nest/tests/integration/clickup-api.integration.spec.ts)

#### Scenario: Shared test helper location

- **WHEN** creating test utilities used across multiple test types
- **THEN** place in /apps/{app}/tests/helpers/ at the root level

#### Scenario: Type-specific test helper location

- **WHEN** creating test utilities used only by one test type
- **THEN** place in /apps/{app}/tests/{type}/helpers/ (e.g., tests/e2e/helpers/createE2EContext.ts, tests/unit/helpers/mock-factories.ts)

#### Scenario: Eliminating co-located **tests** folders

- **WHEN** encountering tests in src/modules/\*/**tests**/ folders
- **THEN** move them to /apps/{app}/tests/unit/ organized by module (e.g., src/modules/auth/**tests**/auth.service.spec.ts → tests/unit/auth/auth.service.spec.ts)

#### Scenario: Eliminating spec files in src

- **WHEN** encountering .spec.ts files directly in src/modules/ folders
- **THEN** move them to /apps/{app}/tests/unit/ maintaining subdirectory structure (e.g., src/modules/auth/auth.guard.spec.ts → tests/unit/auth/auth.guard.spec.ts)

#### Scenario: Unit test directory structure mirrors source

- **WHEN** organizing unit tests in /apps/{app}/tests/unit/
- **THEN** use subdirectories that mirror the source module structure for easy navigation (e.g., tests/unit/auth/, tests/unit/graph/, tests/unit/chat/)

#### Scenario: Consistent structure across apps

- **WHEN** organizing tests for different apps
- **THEN** apply the same folder structure pattern to all apps (admin, server-nest, etc.) with tests/unit/, tests/e2e/, tests/integration/ subdirectories

#### Scenario: Semantic folder names

- **WHEN** navigating the test directory
- **THEN** folder names clearly indicate test type (unit, e2e, integration) without ambiguity between similar names like "test" vs "tests"

### Requirement: Inline Test Documentation

All test files SHALL include inline comments documenting mocking decisions, authentication setup, and database configuration.

#### Scenario: Test file header comment

- **WHEN** creating a test file
- **THEN** include header comment explaining what is being tested, what is mocked, and why

#### Scenario: Mock setup documentation

- **WHEN** creating mocks in test setup
- **THEN** add inline comments explaining what behavior is being mocked and rationale

#### Scenario: Test case documentation

- **WHEN** writing complex test assertions
- **THEN** add comments explaining the expected behavior and why it matters

### Requirement: Testing Guidelines Document

The testing infrastructure SHALL provide a central testing guidelines document.

#### Scenario: New contributor onboarding

- **WHEN** a new contributor joins the project
- **THEN** they can read docs/testing/TESTING_GUIDE.md to understand all testing patterns and conventions

#### Scenario: Choosing test type

- **WHEN** deciding what type of test to write
- **THEN** guidelines document provides decision tree for unit vs integration vs e2e

#### Scenario: Finding test examples

- **WHEN** looking for example tests
- **THEN** guidelines document references exemplary test files for each pattern

### Requirement: Test Script Organization

The testing infrastructure SHALL provide clear, well-organized test scripts that make it obvious which tests are being run and for which application.

#### Scenario: Running unit tests for specific app

- **WHEN** a developer wants to run unit tests for a specific app
- **THEN** test script name clearly indicates the app and test type (e.g., `nx test admin` for admin unit tests, `nx test server-nest` for server unit tests)

#### Scenario: Running e2e tests for specific app

- **WHEN** a developer wants to run e2e tests for a specific app
- **THEN** test script name clearly indicates the app and test type (e.g., `nx test-e2e server-nest` or `nx e2e admin`)

#### Scenario: Running all tests

- **WHEN** a developer wants to run all tests across all apps
- **THEN** a single command runs all test suites with clear output showing which app is being tested

#### Scenario: Understanding available test commands

- **WHEN** a developer wants to know what test commands are available
- **THEN** test scripts follow consistent naming conventions and are documented in the testing guide

#### Scenario: Duplicate or unclear test scripts

- **WHEN** reviewing package.json and project.json files
- **THEN** duplicate test scripts are removed and remaining scripts have clear, descriptive names indicating purpose and scope

### Requirement: AI Agent Testing Guide

The testing infrastructure SHALL provide a condensed, actionable testing guide specifically designed for AI coding agents.

#### Scenario: AI agent needs to write tests

- **WHEN** an AI agent is tasked with writing tests for new or existing code
- **THEN** it can reference a concise guide with clear rules, patterns, and examples optimized for AI consumption

#### Scenario: AI agent chooses test type

- **WHEN** an AI agent needs to decide between unit, integration, or e2e test
- **THEN** the guide provides a simple decision tree with concrete criteria (e.g., "Are you testing a single function? → Unit test")

#### Scenario: AI agent sets up mocks

- **WHEN** an AI agent needs to mock dependencies
- **THEN** the guide provides code templates for common mocking patterns (vi.fn(), vi.spyOn(), MSW) with inline explanations

#### Scenario: AI agent sets up authentication

- **WHEN** an AI agent needs to add authentication to tests
- **THEN** the guide provides copy-paste examples for both unit tests (mock ExecutionContext) and e2e tests (authHeader with scopes)

#### Scenario: AI agent sets up database

- **WHEN** an AI agent needs to configure database for tests
- **THEN** the guide clearly states "Unit: always mock" and "E2E: use createE2EContext()" with code examples

#### Scenario: AI agent validates test quality

- **WHEN** an AI agent completes writing tests
- **THEN** the guide provides a checklist for test quality (clear describe blocks, meaningful assertions, proper cleanup, inline comments)

#### Scenario: AI agent runs tests

- **WHEN** an AI agent needs to run tests after writing them
- **THEN** the guide lists exact commands to run tests (nx test <app>, nx test-e2e <app>) with expected output patterns

### Requirement: AI Tool Configuration

The testing infrastructure SHALL configure AI coding tools (GitHub Copilot, OpenCode, Gemini CLI) to reference the AI agent testing guide as part of their workspace instructions.

#### Scenario: GitHub Copilot references testing guide

- **WHEN** a developer uses GitHub Copilot to write tests
- **THEN** Copilot's workspace instructions in `.github/copilot-instructions.md` include a reference to the AI agent testing guide

#### Scenario: OpenCode references testing guide

- **WHEN** a developer uses OpenCode to write tests
- **THEN** OpenCode's configuration in `opencode.jsonc` includes the AI agent testing guide in its instructions array

#### Scenario: Gemini CLI references testing guide

- **WHEN** a developer uses Gemini CLI to write tests
- **THEN** Gemini CLI loads `.gemini/GEMINI.md` which imports the AI agent testing guide using `@import` syntax, or can be invoked with `--include-directories` flag as an alternative

#### Scenario: Consistent guidance across tools

- **WHEN** multiple AI tools are used in the project
- **THEN** all tools reference the same authoritative AI agent testing guide for consistency

#### Scenario: AI tool instructions are maintainable

- **WHEN** testing patterns change
- **THEN** AI tool configurations reference the guide by path rather than duplicating content, ensuring single source of truth

