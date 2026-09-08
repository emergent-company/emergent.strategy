## ADDED Requirements

### Requirement: A model-planned chain is bounded

An agent whose next step is chosen by the model SHALL have an explicit upper bound on
the number of model turns in a single unit of work, and SHALL terminate cleanly when
that bound is reached.

A code-planned chain is bounded by its own step list. A model-planned chain has no
such bound unless one is imposed, and no agent runtime in the estate provides one:
ADK's flow loop iterates until the model stops emitting tool calls, and `RunConfig`
carries no call cap. An unbounded chain against a paid model is an availability and
cost incident, not merely a bug.

#### Scenario: A runaway chain terminates

- **GIVEN** an agent whose model returns a tool call on every turn
- **WHEN** the configured turn bound is reached
- **THEN** the chain stops
- **AND** the caller receives a result indicating the bound was reached, not a hang or
  a silent truncation

#### Scenario: Reaching the bound is observable

- **GIVEN** a chain that terminated because it hit its bound
- **WHEN** an operator inspects the run
- **THEN** that is distinguishable from a chain that completed normally

### Requirement: Tool results are not session history by default

An agent SHALL NOT place raw tool result payloads into the conversation record it
replays to the model. Where a tool returns a large payload, the session SHALL carry a
reference and a summary, and the payload SHALL be retrievable separately.

This is `AGENT_RUNTIME_PATTERN.md` invariant 4. It matters most for an artifact
authoring agent, whose tool results are whole artifact payloads and diffs — the
largest objects in the system. The failure mode is observed, not hypothetical: the
estate's reference chat runtime writes each tool result to its session events, its
tool-call audit table, its message table and its event replay log, then compacts
reactively by summarising a transcript that deliberately excludes tool calls — so the
payloads that caused the growth contribute nothing to the compressed form.

#### Scenario: A large tool result does not enter the conversation record

- **GIVEN** a tool that returns a whole artifact payload
- **WHEN** the agent calls it
- **THEN** the conversation record carries a reference and a summary
- **AND** the payload itself is retrievable through that reference

#### Scenario: The model can still act on the result

- **GIVEN** a tool result carried as a reference and a summary
- **WHEN** the agent needs the full payload to proceed
- **THEN** it can retrieve it without the payload becoming permanent conversation
  history

### Requirement: Context assembly has an enforced budget

Context assembled for an agent turn SHALL be bounded by an explicit ceiling enforced
where the context is built, and any dropping SHALL be recorded.

"Assemble everything relevant" is not a budget. The existing precedent in this
codebase is a single byte constant that drops one category of content and truncates
nothing else, alongside a declared per-skill budget field that no code reads — so a
new agent inheriting "the existing approach" would inherit almost nothing.

#### Scenario: Context exceeding the ceiling is reduced

- **GIVEN** candidate context larger than the configured ceiling
- **WHEN** the turn's context is assembled
- **THEN** it is reduced to fit before the model is called

#### Scenario: Dropping is recorded

- **GIVEN** context that was reduced to fit the ceiling
- **WHEN** an operator inspects the run
- **THEN** what was dropped is recorded, not silently discarded

### Requirement: Tool calling works across every supported provider

Where the system supports multiple model providers, tool declarations, tool calls and
tool results SHALL round-trip correctly on each of them, not only on the provider used
during development.

The three wire formats disagree structurally: one returns calls in a dedicated array
with arguments as a JSON string, one as typed content blocks with arguments as an
object, one as typed parts. A seam proven on one provider is not a seam.

#### Scenario: A tool round trip completes on each provider

- **GIVEN** a tool declaration and a model that chooses to call it
- **WHEN** the round trip runs against any supported provider
- **THEN** the call is received, executed, and its result accepted by that provider on
  the following turn

#### Scenario: Provider schema restrictions are handled

- **GIVEN** a tool whose parameter schema uses constructs a provider rejects
- **WHEN** the declaration is sent to that provider
- **THEN** the schema is adapted to that provider's accepted subset rather than
  rejected at call time

#### Scenario: An unanswered tool call does not poison a resumed conversation

- **GIVEN** a persisted conversation containing a tool call with no matching result,
  because the session ended between the call and its response
- **WHEN** that conversation is reloaded and sent to a provider that requires strict
  pairing
- **THEN** the request is accepted, with the unanswered call resolved explicitly rather
  than left dangling

## MODIFIED Requirements

### Requirement: Terminated runs' sessions are reclaimed

The system SHALL delete the persisted execution record belonging to a run in a
terminal state after a configurable retention window, and SHALL NOT delete the record
of a run that may still be resumed.

One record exists per unit of work and is disposable once that unit terminates.
Without this, the store grows without bound.

This requirement is deliberately engine-neutral. It was originally written against
`adk_sessions`, when AIM ran on an ADK session-backed engine. AIM has since moved to a
durable workflow engine whose equivalent concern is its own workflow-status store, and
`adk_sessions` has no writer — but those tables were retained for the model-planned
authoring agent, which will make them live again. The requirement holds for whichever
store backs a given agent; naming one was the error.

#### Scenario: A terminal run's session is reclaimed

- **GIVEN** a run in a terminal state, older than the retention window
- **WHEN** the retention sweep runs
- **THEN** its execution record and that record's events are deleted
- **AND** the run's own metadata row is retained, because cross-run history does not
  live in the execution record

#### Scenario: An open gate is never reclaimed

- **GIVEN** a run awaiting human input, older than the retention window
- **WHEN** the retention sweep runs
- **THEN** its record is not deleted
- **AND** the run remains resumable

A gate open for months is a slow review, not an abandoned run. The abandoned-gate
sweep — a separate mechanism with its own, much longer threshold — is what ends those.

#### Scenario: Reclamation is observable

- **GIVEN** the retention sweep has run
- **WHEN** an operator inspects the logs
- **THEN** the number of records reclaimed is recorded
