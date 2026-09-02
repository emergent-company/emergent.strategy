# agent-runtime

> **Scope history.** Three requirements below — the ADK graph as the AIM
> workflow runtime, human gates as ADK `RequestInput` pauses, and run resume
> via ADK session reconstruction — were briefly withdrawn on the reasoning that
> ADK's unbounded per-turn session reload made a session unsafe as the unit of
> work for an AIM cycle. That reasoning over-generalised: it applies to a
> session whose events *are* accumulating LLM/tool content, which is not AIM's
> shape. AIM's steps are plain `FunctionNode`s that call into `domain/aim` and
> return a compact result; the LLM work never becomes session content. A
> complete cycle's session would hold on the order of 10-20 small events
> regardless of gate duration. See the scope history in `proposal.md` and
> `openspec/AGENT_RUNTIME_PATTERN.md`.
>
> The three requirements are restored. One requirement below — session as
> system of record — is revised rather than restored verbatim: ADK session
> reconstruction is the correct mechanism for recovering *execution state*
> within a cycle (which node is paused, what is pending), which is exactly why
> ADK's HITL machinery is worth adopting instead of hand-rolling it. A separate,
> lightweight run-metadata record still exists for what ADK does not provide:
> binding a staged batch to its run, listing and querying across runs, and the
> gate-duration audit this project needed real data for before it could answer
> whether a gate should pause a cycle or end one. See
> `openspec/changes/instrument-cycle-gates/`.

## ADDED Requirements

### Requirement: ADK graph engine as the AIM cycle runtime

The system SHALL run the AIM cycle on ADK's workflow graph engine, representing
each cycle step as a graph node, so orchestration and human-in-the-loop use one
production-grade runtime instead of a bespoke engine.

One ADK session corresponds to one AIM cycle, not to an instance's entire
lifetime. This is what keeps the session bounded: a cycle's session accumulates
a step's compact result and its gate events, never the LLM content a step
produces internally, so the per-turn cost stays a few KB regardless of how many
steps a gate is open.

#### Scenario: AIM cycle runs on ADK

- **WHEN** an AIM cycle is started for an instance
- **THEN** the cycle executes as an ADK graph of its ordered steps
- **AND** the external HTTP/SSE and MCP behaviour is unchanged from the bespoke
  engine

#### Scenario: One active cycle per instance

- **WHEN** a second AIM cycle is requested for an instance that already has an
  active cycle
- **THEN** the runtime enforces a single active cycle per instance
  (concurrency key = instance id)

#### Scenario: A step body does not become session content

- **WHEN** a step performs an LLM generation as part of its work
- **THEN** the prompt and completion are not recorded as ADK session events
- **AND** only the step's compact result (name, staged batch id, metadata) is
  recorded

### Requirement: Human-in-the-loop gates via ADK RequestInput

The system SHALL implement AIM human-review gates using ADK's
`RequestInput`/Resume, so a step pauses for human review and resumes on the
user's approval without a bespoke gate mechanism.

A gate's wait adds no session events — only the instant it opens and the
instant it clears do — so a review that takes minutes and a review that takes
weeks cost the same to the session, which is what makes ADK's native pause
mechanism safe to use here even though a review's duration is unbounded.

#### Scenario: Step pauses for review

- **WHEN** a human-gated step produces a staged batch
- **THEN** the run pauses emitting `RequestInput`
- **AND** the existing approve/commit action resumes the run

#### Scenario: Empty gated step auto-advances

- **WHEN** a gated step produces no staged changes
- **THEN** the node completes without requesting input and the run auto-advances

#### Scenario: A long-open gate does not grow the session

- **WHEN** a gate has been open for an extended period
- **THEN** the session's event count and byte size are unchanged from the
  instant the gate opened

### Requirement: Providers registered as ADK models

The system SHALL expose the `llm.Provider` implementations (including Bedrock) to
ADK by registering them as ADK `model.LLM` implementations, so agent/workflow
nodes use the same providers and classified error contract as direct callers.

#### Scenario: ADK node uses the configured provider

- **WHEN** an ADK agent node performs a generation
- **THEN** it uses the configured `llm.Provider` (api-key, vertex, or bedrock)
- **AND** provider errors surface with the same classified `ErrorKind`

### Requirement: Execution state resumes from the ADK session; cross-run concerns live in a run-metadata record

The system SHALL recover a paused cycle's execution state — which node is
waiting, what input it is waiting on — from ADK's own session reconstruction
after a restart. The system SHALL additionally maintain a run-metadata record
for what a single session cannot provide: binding a staged batch to the run
that produced it, listing and querying runs across an instance, and auditing
how long a gate was open.

This is a division of responsibility, not a duplication. ADK's session is the
right tool for resuming *this run's* paused position, because that is what its
HITL/session-reconstruction machinery is built for. It is the wrong tool for
"find the run that staged this batch" or "how many runs has this instance had,"
because those questions span runs and a session's lifetime is one run.

#### Scenario: Restart after a gate opened

- **WHEN** the server restarts while an AIM cycle is paused at a human gate
- **THEN** ADK session reconstruction recovers the paused node
- **AND** the pending human approval resumes the same run (idempotent — a
  duplicate approval is a no-op)

#### Scenario: Finding the run for a batch

- **WHEN** a staged batch is committed or discarded
- **THEN** the run awaiting that batch is found from the run-metadata record,
  not by scanning ADK sessions

#### Scenario: Gate duration is measurable

- **WHEN** a gate opens and later clears
- **THEN** the run-metadata record carries when it opened, when it cleared, and
  how — independent of whether the ADK session itself is later expired

### Requirement: Tool results are not persisted as session events by default

The system SHALL NOT write tool results into ADK session history by default.
Large payloads SHALL be stored externally with a reference retained in the
run-metadata record.

Tool results are the largest payloads in an agent system, and ADK's per-turn
cost tracks total bytes of history rather than event count. Persisting them by
default is what converts a small session into a multi-megabyte one — this is
the property that keeps a workflow-graph session (AIM's shape) cheap and would
make a chat-style agent session (a harness coding session) expensive if adopted
the same way. See `openspec/AGENT_RUNTIME_PATTERN.md`.

#### Scenario: A tool returns a large payload

- **WHEN** a tool produces output above the configured size cap
- **THEN** the payload is stored externally
- **AND** the run-metadata record retains a reference, not the payload
- **AND** the session event stream does not grow by the payload size
