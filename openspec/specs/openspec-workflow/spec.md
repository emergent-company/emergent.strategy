# openspec-workflow Specification

## Purpose
TBD - created by archiving change update-agent-documentation-verification. Update Purpose after archive.
## Requirements
### Requirement: Documentation Verification Before Proposal Creation

When creating a change proposal that involves external libraries, frameworks, or tools, agents SHALL verify documentation freshness using Context7 MCP or equivalent documentation tools.

#### Scenario: Proposal involves external library

- **WHEN** an agent is creating a change proposal
- **AND** the change involves using or modifying code that depends on external libraries (e.g., TypeORM, NestJS, React, Tailwind)
- **THEN** the agent SHALL use Context7 MCP to fetch the latest documentation for the relevant library
- **AND** the agent SHALL verify that proposed patterns and APIs are current
- **AND** the agent SHALL note in the proposal if any deprecated approaches were avoided

#### Scenario: Proposal is internal-only

- **WHEN** an agent is creating a change proposal
- **AND** the change only involves internal code patterns with no external library dependencies
- **THEN** documentation verification via Context7 MCP is optional
- **AND** the agent SHALL rely on existing code patterns in the repository

#### Scenario: Multiple libraries involved

- **WHEN** a change proposal involves multiple external libraries (e.g., TypeORM + NestJS)
- **THEN** the agent SHALL verify documentation for each library separately
- **AND** the agent SHALL check for compatibility or integration guidance between libraries

### Requirement: Documentation Verification Before Implementation

Before starting implementation of an approved change proposal, agents SHALL re-verify documentation for external dependencies to ensure information is current.

#### Scenario: Implementation starts after proposal approval

- **WHEN** an agent begins implementing an approved change
- **AND** the change involves external libraries or frameworks
- **THEN** the agent SHALL use Context7 MCP to fetch the latest documentation
- **AND** the agent SHALL compare against the proposal to verify no breaking changes occurred
- **AND** if breaking changes are found, the agent SHALL notify the user before proceeding

#### Scenario: No external dependencies in implementation

- **WHEN** an agent begins implementing an approved change
- **AND** the change only involves internal code with no external library usage
- **THEN** documentation verification via Context7 MCP is optional

#### Scenario: Long gap between proposal and implementation

- **WHEN** more than 7 days have passed between proposal approval and implementation start
- **AND** the change involves external libraries
- **THEN** documentation verification SHALL be mandatory
- **AND** the agent SHALL explicitly confirm documentation is still current

### Requirement: Test Verification Before Implementation

Before starting implementation of an approved change proposal, agents SHALL run existing unit and E2E tests to verify the current state of the codebase and confirm user approval to proceed if any tests are failing.

#### Scenario: Run tests before implementation starts

- **WHEN** an agent is ready to begin implementing an approved change
- **THEN** the agent SHALL run unit tests for the affected project (e.g., `nx run server:test` or `nx run admin:test`)
- **AND** the agent SHALL run E2E tests if the change affects user-facing functionality (e.g., `nx run server:test-e2e` or `nx run admin:e2e`)
- **AND** the agent SHALL report the test results to the user

#### Scenario: All tests pass before implementation

- **WHEN** the agent runs pre-implementation tests
- **AND** all tests pass successfully
- **THEN** the agent SHALL proceed with implementation
- **AND** the agent SHALL note in the implementation log that baseline tests passed

#### Scenario: Tests fail before implementation

- **WHEN** the agent runs pre-implementation tests
- **AND** one or more tests fail
- **THEN** the agent SHALL report the failing tests to the user with details (test names, error messages)
- **AND** the agent SHALL ask the user whether to:
  - Fix the failing tests first before proceeding with the change
  - Proceed with the change despite failing tests (user accepts risk)
  - Investigate the failing tests to determine if they are related to the planned change
- **AND** the agent SHALL NOT proceed with implementation until user provides explicit approval

#### Scenario: Change only affects specific project

- **WHEN** a change only affects the backend server
- **THEN** the agent SHALL run `nx run server:test` and `nx run server:test-e2e`
- **AND** the agent MAY skip frontend tests unless there are cross-cutting concerns

#### Scenario: Change affects multiple projects

- **WHEN** a change affects both frontend and backend
- **THEN** the agent SHALL run tests for all affected projects
- **AND** the agent SHALL report results separately for each project

### Requirement: Build, Lint, and Test Verification After Implementation

After completing implementation of a change, agents SHALL run build, lint, and test commands to verify the implementation is correct and does not introduce errors.

#### Scenario: Run verification after implementation completes

- **WHEN** an agent completes all implementation tasks
- **THEN** the agent SHALL run the build command for affected projects (e.g., `npm run build`, `nx run server:build`, or `nx run admin:build`)
- **AND** the agent SHALL run the lint command for affected projects (e.g., `nx run server:lint` or `nx run admin:lint`)
- **AND** the agent SHALL run unit and E2E tests for affected projects
- **AND** the agent SHALL report all results to the user

#### Scenario: Build succeeds after implementation

- **WHEN** the build command completes successfully
- **THEN** the agent SHALL proceed to run lint and tests
- **AND** the agent SHALL note the successful build in the implementation log

#### Scenario: Build fails after implementation

- **WHEN** the build command fails
- **THEN** the agent SHALL report the build errors to the user with details
- **AND** the agent SHALL fix the build errors before proceeding to lint and tests
- **AND** the agent SHALL re-run the build until it succeeds

#### Scenario: Lint errors found after implementation

- **WHEN** the lint command reports errors or warnings
- **THEN** the agent SHALL report the lint issues to the user
- **AND** the agent SHALL fix all lint errors (errors are mandatory to fix)
- **AND** the agent SHOULD fix lint warnings when feasible
- **AND** the agent SHALL re-run lint until no errors remain

#### Scenario: Tests fail after implementation

- **WHEN** unit or E2E tests fail after implementation
- **THEN** the agent SHALL report the failing tests to the user with details
- **AND** the agent SHALL analyze whether failures are caused by the implementation
- **AND** the agent SHALL fix test failures caused by the implementation
- **AND** the agent SHALL re-run tests until all pass

#### Scenario: All verification passes after implementation

- **WHEN** build, lint, and all tests pass successfully
- **THEN** the agent SHALL mark the implementation as complete
- **AND** the agent SHALL update the tasks checklist to reflect completion
- **AND** the agent SHALL notify the user that the change is ready for review

#### Scenario: Backend-only change verification

- **WHEN** a change only affects the backend server
- **THEN** the agent SHALL run `nx run server:build`, `nx run server:lint`, `nx run server:test`, and `nx run server:test-e2e`
- **AND** the agent MAY skip frontend build and tests

#### Scenario: Frontend-only change verification

- **WHEN** a change only affects the frontend admin
- **THEN** the agent SHALL run `nx run admin:build`, `nx run admin:lint`, `nx run admin:test`, and `nx run admin:e2e`
- **AND** the agent MAY skip backend build and tests

#### Scenario: Full-stack change verification

- **WHEN** a change affects both frontend and backend
- **THEN** the agent SHALL run `npm run build` (builds both projects)
- **AND** the agent SHALL run lint for both projects
- **AND** the agent SHALL run tests for both projects
- **AND** the agent SHALL ensure all verification passes before marking complete

### Requirement: Manual Testing Verification with DevTools MCP Before Writing Tests

Before writing E2E or integration tests, agents SHALL manually verify functionality using Chrome DevTools MCP to gather test inputs such as selectors, element states, and user flows.

#### Scenario: Verify functionality with DevTools MCP before writing test

- **WHEN** an agent is about to write an E2E or integration test for new functionality
- **THEN** the agent SHALL start Chrome with remote debugging using `npm run chrome:debug`
- **AND** the agent SHALL obtain test user credentials using `./scripts/get-test-user-credentials.sh`
- **AND** the agent SHALL instruct the user to manually login and navigate to the feature being tested
- **AND** the agent SHALL use Chrome DevTools MCP to inspect the page state (DOM, selectors, element attributes)
- **AND** the agent SHALL gather necessary test inputs (element selectors, button labels, form field names, etc.)
- **AND** the agent SHALL verify the expected behavior is present before writing assertions

#### Scenario: Gather selectors and element attributes with DevTools MCP

- **WHEN** an agent needs to write test assertions for UI elements
- **THEN** the agent SHALL use Chrome DevTools MCP `take_snapshot` tool to get page structure
- **AND** the agent SHALL identify stable selectors (data-testid, role, aria-label) from the snapshot
- **AND** the agent SHALL verify element visibility and interactivity states
- **AND** the agent SHALL use these verified selectors in the test code

#### Scenario: Verify user flow with DevTools MCP

- **WHEN** an agent is writing a test for a multi-step user flow
- **THEN** the agent SHALL ask the user to manually perform each step while Chrome DevTools MCP is connected
- **AND** the agent SHALL use DevTools MCP to observe DOM changes, network requests, console logs, and storage changes after each action
- **AND** the agent SHALL document the observed flow in test comments
- **AND** the agent SHALL use the verified flow to write accurate test steps

#### Scenario: Inspect network requests for API-dependent tests

- **WHEN** a test involves API calls or data fetching
- **THEN** the agent SHALL use Chrome DevTools MCP `list_network_requests` tool during manual testing
- **AND** the agent SHALL identify relevant API endpoints, request payloads, and response formats
- **AND** the agent SHALL note any timing or loading states to include in test waits
- **AND** the agent SHALL verify success and error response handling

#### Scenario: Check console errors before writing test

- **WHEN** verifying functionality with DevTools MCP
- **THEN** the agent SHALL use `list_console_messages` tool to check for errors or warnings
- **AND** if console errors are found, the agent SHALL ask the user whether to fix the errors, document them as known issues, or proceed with test writing
- **AND** the agent SHALL NOT proceed until user provides guidance

#### Scenario: Test credential management

- **WHEN** an agent needs to test authenticated features
- **THEN** the agent SHALL use `./scripts/get-test-user-credentials.sh` to retrieve test user credentials
- **AND** the agent SHALL provide these credentials to the user for manual login
- **AND** the agent SHALL use DevTools MCP to verify authentication state (cookies, local storage tokens)
- **AND** the agent SHALL include credential cleanup in test teardown

#### Scenario: Extract test data from browser state

- **WHEN** tests require specific data values or IDs
- **THEN** the agent SHALL use Chrome DevTools MCP `evaluate_script` tool to extract data from the page
- **AND** the agent SHALL store extracted values for use in test assertions
- **AND** the agent SHALL verify data consistency across page refreshes if needed

#### Scenario: DevTools MCP not available

- **WHEN** Chrome DevTools MCP is not available or Chrome is not running with remote debugging
- **THEN** the agent SHALL ask the user to run `npm run chrome:debug` first
- **AND** if MCP is still unavailable, the agent MAY proceed with test writing using Playwright built-in inspection
- **AND** the agent SHALL document that manual verification was skipped

### Requirement: Context7 MCP Integration

Agents SHALL use Context7 MCP as the primary tool for documentation verification when available.

#### Scenario: Context7 MCP is configured

- **WHEN** the workspace has Context7 MCP configured in `.vscode/mcp.json` or `opencode.jsonc`
- **THEN** agents SHALL use Context7 tools to fetch library documentation
- **AND** agents SHALL use the `context7_resolve-library-id` tool first to identify the correct library
- **AND** agents SHALL use the `context7_get-library-docs` tool to fetch documentation for specific topics

#### Scenario: Context7 MCP is not available

- **WHEN** Context7 MCP is not configured or unavailable
- **THEN** agents SHALL use alternative documentation sources (WebFetch, official docs sites)
- **AND** agents SHALL note the documentation source used in proposals

#### Scenario: Library not available in Context7

- **WHEN** a library's documentation is not available via Context7
- **THEN** the agent SHALL use WebFetch to access official documentation
- **AND** the agent SHALL note the fallback documentation source

### Requirement: Documentation Verification Scope

Agents SHALL determine when documentation verification is required based on the nature of the change.

#### Scenario: Change modifies external library usage

- **WHEN** a change modifies how the codebase uses an external library's API
- **THEN** documentation verification SHALL be required
- **AND** the agent SHALL verify the specific APIs, patterns, or configurations being modified

#### Scenario: Change adds new external dependency

- **WHEN** a change introduces a new external library or framework
- **THEN** documentation verification SHALL be required
- **AND** the agent SHALL verify installation, configuration, and integration patterns

#### Scenario: Change is bug fix restoring spec behavior

- **WHEN** a change is a bug fix that restores previously specified behavior
- **AND** no external library API changes are involved
- **THEN** documentation verification is optional

### Requirement: Workflow Integration

The documentation verification requirements SHALL be integrated into the OpenSpec three-stage workflow.

#### Scenario: Stage 1 checklist includes documentation verification

- **WHEN** an agent reviews the Stage 1 (Creating Changes) workflow
- **THEN** the workflow SHALL include a step to verify external library documentation
- **AND** the step SHALL appear before spec delta creation
- **AND** the step SHALL reference Context7 MCP as the primary tool

#### Scenario: Stage 2 checklist includes pre-implementation verification

- **WHEN** an agent reviews the Stage 2 (Implementing Changes) workflow
- **THEN** the workflow SHALL include a step to re-verify documentation before implementation
- **AND** the step SHALL appear after reading proposal, design, and tasks and before implementation
- **AND** the step SHALL be clearly marked as mandatory for external library changes

#### Scenario: Stage 2 checklist includes test baseline verification

- **WHEN** an agent reviews the Stage 2 (Implementing Changes) workflow
- **THEN** the workflow SHALL include a step to run baseline tests before implementation starts
- **AND** the step SHALL require user approval to proceed if tests are failing

#### Scenario: Stage 2 checklist includes DevTools MCP test verification

- **WHEN** an agent reviews the Stage 2 (Implementing Changes) workflow
- **THEN** the workflow SHALL include a step to verify functionality with DevTools MCP before writing tests
- **AND** the step SHALL document the workflow for gathering test inputs

#### Scenario: Stage 2 checklist includes post-implementation verification

- **WHEN** an agent reviews the Stage 2 (Implementing Changes) workflow
- **THEN** the workflow SHALL include a mandatory step to run build, lint, and tests after implementation
- **AND** the step SHALL require all verification to pass before marking complete

#### Scenario: AGENTS.md documents verification process

- **WHEN** developers or agents read `openspec/AGENTS.md`
- **THEN** the documentation SHALL explain when and how to verify external library documentation
- **AND** the documentation SHALL provide examples of using Context7 MCP
- **AND** the documentation SHALL clarify when verification can be skipped
- **AND** the documentation SHALL explain the DevTools MCP testing workflow
- **AND** the documentation SHALL document post-implementation verification requirements

