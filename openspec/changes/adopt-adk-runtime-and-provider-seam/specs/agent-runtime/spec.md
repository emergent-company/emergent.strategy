# agent-runtime

> **Scope corrected.** Three requirements originally in this delta — the ADK
> graph as the AIM workflow runtime, human gates as ADK `RequestInput` pauses,
> and run resume via ADK session reconstruction — have been **withdrawn**. They
> assumed an ADK session could span an AIM cycle including its multi-day review
> gates. Measurement showed ADK reloads and rescans a session's whole event
> history every turn, with no way to bound it, so cost grows with the life of
> the cycle. See `openspec/AGENT_RUNTIME_PATTERN.md` and the scope correction in
> `proposal.md`.
>
> What remains below is what shipped and what we still believe.

## ADDED Requirements

### Requirement: Providers registered as ADK models

The system SHALL expose the `llm.Provider` implementations (including Bedrock) to
ADK by registering them as ADK `model.LLM` implementations, so agent/workflow
nodes use the same providers and classified error contract as direct callers.

#### Scenario: ADK node uses the configured provider

- **WHEN** an ADK agent node performs a generation
- **THEN** it uses the configured `llm.Provider` (api-key, vertex, or bedrock)
- **AND** provider errors surface with the same classified `ErrorKind`

### Requirement: ADK sessions are ephemeral per-unit scratch, not the system of record

The system SHALL treat an ADK session as scratch for one bounded unit of work.
Authoritative state SHALL live in domain tables, and operator-facing history
SHALL live in the run/step audit. A session SHALL NOT be the mechanism by which
a cycle's progress is recovered.

This bounds every session's event stream to one unit of work, which is what
keeps ADK's per-turn full-history reload from growing with the life of a cycle.

#### Scenario: Session is not consulted for cycle progress

- **WHEN** a cycle's position or outcome is read
- **THEN** it is read from domain tables
- **AND** no ADK event history is replayed to derive it

#### Scenario: A completed unit of work releases its session

- **WHEN** a bounded unit of work completes
- **THEN** its ADK session is eligible for expiry
- **AND** no later unit of work depends on that session's events

### Requirement: Session persistence survives restart within a unit of work

The system SHALL persist ADK session state so that a unit of work interrupted
by a server restart is not corrupted, and SHALL satisfy ADK's own
`session.Service` conformance suite so behaviour matches the reference
implementation.

#### Scenario: Conformance with ADK semantics

- **WHEN** the session store is exercised by ADK's `sessiontestsuite`
- **THEN** all conformance tests pass, including state scoping, event ordering,
  and `NumRecentEvents`/`After` filtering

#### Scenario: Restart during a unit of work

- **WHEN** the server restarts while a unit of work is in flight
- **THEN** the session and its events are readable after restart
- **AND** recovery of the enclosing cycle is driven by domain state, not by
  replaying those events

### Requirement: Tool results are not persisted as session events by default

The system SHALL NOT write tool results into ADK session history by default.
Large payloads SHALL be stored externally with a reference retained in the
run/step audit.

Tool results are the largest payloads in an agent system, and ADK's per-turn
cost tracks total bytes of history rather than event count. Persisting them by
default is what converts a small session into a multi-megabyte one.

#### Scenario: A tool returns a large payload

- **WHEN** a tool produces output above the configured size cap
- **THEN** the payload is stored externally
- **AND** the audit record retains a reference, not the payload
- **AND** the session event stream does not grow by the payload size
