## ADDED Requirements

### Requirement: EPF Artifact Writing Agent

The system SHALL provide an AI agent engine capable of writing, updating, and validating EPF YAML artifacts using headless OpenCode with the EPF Cloud Strategy Server as MCP context.

The agent SHALL:

- Accept an artifact operation task with context (target artifact type, operation, strategic brief)
- Use headless OpenCode (`opencode serve`) as the execution engine
- Connect to the EPF Cloud Strategy Server via MCP to query existing strategic context (personas, features, value model, roadmap)
- Validate generated artifacts against `epf-canonical` JSON Schemas using `epf-cli validate`
- Resolve EPF relationship references (`contributes_to` paths, KR references, persona links) against the live value model

#### Scenario: Write new feature definition from product brief

- **WHEN** the agent receives a task to write a new feature definition
- **AND** a product brief describing the feature is provided
- **THEN** the agent queries the strategy server for relevant personas, value model components, and existing features
- **AND** writes a feature definition YAML file conforming to `epf-canonical` schema
- **AND** populates `contributes_to` paths referencing valid value model components
- **AND** the output passes `epf-cli validate`

#### Scenario: Update dependent artifacts when persona changes

- **WHEN** the agent receives an update task
- **AND** a persona definition has changed
- **THEN** the agent identifies all artifacts referencing that persona (features, strategy formula)
- **AND** updates each artifact to reflect the persona changes
- **AND** all modified artifacts pass schema validation

#### Scenario: Validate cross-artifact consistency

- **WHEN** the agent receives an audit task for an EPF instance
- **THEN** the agent checks that all `contributes_to` paths resolve to valid value model components
- **AND** verifies that roadmap KR references target existing value model paths
- **AND** returns a consistency report with any broken references and suggested fixes

### Requirement: Framework-Agnostic Engine Layer

The system SHALL implement the agent engine as a framework-agnostic layer that manages OpenCode sessions, compute, and billing without knowledge of EPF-specific concepts.

The engine layer SHALL:

- Create and manage OpenCode headless sessions
- Dynamically attach MCP servers to sessions (framework layer provides context)
- Route artifact operation tasks to isolated compute
- Track token usage and enforce quotas
- Be independent of any specific framework's artifact types, schemas, or relationship model

#### Scenario: Attach MCP server dynamically

- **WHEN** the engine creates a new agent session for an EPF task
- **THEN** it dynamically attaches the EPF Cloud Strategy Server as an MCP server via OpenCode's `POST /mcp` endpoint
- **AND** the agent can query EPF strategic context through MCP tools

#### Scenario: Framework-agnostic session management

- **WHEN** the engine receives a task for any supported framework
- **THEN** it creates an OpenCode session, attaches the framework's MCP server, and submits the task
- **AND** the engine does not interpret or validate the framework-specific content — it only manages the session lifecycle

### Requirement: EPF Framework Integration

The system SHALL provide an EPF-specific framework layer that supplies strategic context and validation rules to the engine.

The framework layer SHALL:

- Configure the EPF Cloud Strategy Server as the MCP context provider for agent sessions
- Provide `epf-canonical` JSON Schemas for artifact validation
- Define EPF-specific agent instruction sets (artifact writing patterns, relationship resolution)
- Map EPF artifact types to the engine's generic task interface

#### Scenario: EPF context available during artifact writing

- **WHEN** an agent session is created for EPF artifact writing
- **THEN** the EPF framework layer attaches the strategy server as MCP
- **AND** the agent can query personas, features, value model, roadmap, and competitive position
- **AND** uses this context to write strategically aligned artifacts

#### Scenario: Schema validation of generated artifacts

- **WHEN** the agent completes writing an EPF artifact
- **THEN** the EPF framework layer validates the output against `epf-canonical` schemas
- **AND** if validation fails, the agent receives the errors and can iterate to fix them

### Requirement: ACP Protocol Abstraction

The system SHALL implement the Agent Client Protocol (ACP) for communication between frontends and the agent engine.

The ACP layer SHALL:

- Support task submission with parameters and context
- Stream agent progress events (steps, tool calls, intermediate results)
- Return final task results with written/modified artifacts and metadata
- Abstract the underlying agent engine (OpenCode) behind a stable protocol

#### Scenario: Submit artifact task via ACP

- **WHEN** a client submits an EPF artifact writing task via ACP
- **THEN** the engine creates a new agent session
- **AND** returns a task ID for tracking
- **AND** begins streaming progress events

#### Scenario: Stream progress events

- **WHEN** the agent is writing an EPF artifact
- **THEN** progress events are streamed to the client via SSE
- **AND** events include step descriptions, tool calls, and intermediate validation results

#### Scenario: Retrieve task results

- **WHEN** the agent completes an artifact operation
- **THEN** the client can retrieve the final results via the task ID
- **AND** results include written/modified artifact files, validation status, and any warnings
