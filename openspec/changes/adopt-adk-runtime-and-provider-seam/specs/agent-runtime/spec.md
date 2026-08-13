# agent-runtime

## ADDED Requirements

### Requirement: ADK graph engine as the workflow runtime

The system SHALL run the AIM cycle on the ADK Go 2.0 graph workflow engine,
representing each cycle step as a graph node, so orchestration, persistence, and
human-in-the-loop use one production-grade runtime instead of a bespoke engine.

#### Scenario: AIM cycle runs on ADK

- **WHEN** an AIM cycle is started for an instance
- **THEN** the cycle executes as an ADK graph of the six ordered steps
- **AND** the external HTTP/SSE and MCP behaviour is unchanged from the bespoke
  engine

#### Scenario: One active cycle per instance

- **WHEN** a second AIM cycle is requested for an instance that already has an
  active cycle
- **THEN** the runtime enforces a single active cycle per instance
  (concurrency key = instance id)

### Requirement: Human-in-the-loop gates via ADK RequestInput

The system SHALL implement AIM human-review gates using ADK's
`RequestInput`/Resume, so a step pauses for human review and resumes on the
user's approval without a bespoke gate mechanism.

#### Scenario: Step pauses for review

- **WHEN** a human-gated step (assessment, calibration, adapt_strategy,
  adapt_foundations) produces a staged batch
- **THEN** the run pauses emitting `RequestInput`
- **AND** the existing approve/commit action resumes the run

#### Scenario: Empty foundation step auto-advances

- **WHEN** adapt_foundations produces no staged changes
- **THEN** the node completes without requesting input and the run auto-advances

### Requirement: Durable, resumable runs

The system SHALL persist AIM run state so a run survives a server restart and
resumes from its last position using ADK session reconstruction.

#### Scenario: Resume after restart

- **WHEN** the server restarts while an AIM cycle is paused at a human gate
- **THEN** on restart the run state is reconstructed
- **AND** the pending human approval resumes the same run (idempotent — a
  duplicate approval is a no-op)

### Requirement: Providers registered as ADK models

The system SHALL expose the `llm.Provider` implementations (including Bedrock) to
ADK by registering them as ADK `model.LLM` implementations, so agent/workflow
nodes use the same providers and classified error contract as direct callers.

#### Scenario: ADK node uses the configured provider

- **WHEN** an ADK agent node performs a generation
- **THEN** it uses the configured `llm.Provider` (api-key, vertex, or bedrock)
- **AND** provider errors surface with the same classified `ErrorKind`
