## ADDED Requirements

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
- **AND** the step SHALL appear after reading proposal/design/tasks and before implementation
- **AND** the step SHALL be clearly marked as mandatory for external library changes

#### Scenario: AGENTS.md documents verification process

- **WHEN** developers or agents read `openspec/AGENTS.md`
- **THEN** the documentation SHALL explain when and how to verify external library documentation
- **AND** the documentation SHALL provide examples of using Context7 MCP
- **AND** the documentation SHALL clarify when verification can be skipped
