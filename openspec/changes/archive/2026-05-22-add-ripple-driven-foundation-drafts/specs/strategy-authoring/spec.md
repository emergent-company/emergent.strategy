## ADDED Requirements

### Requirement: adapt-foundations Skill

The system SHALL provide an embedded skill `adapt-foundations` that rewrites the
READY-layer foundation artifacts (`north_star`, `strategy_foundations`,
`insight_analyses`, `insight_opportunity`) using the same chunked execution pattern
as `adapt-strategy`.

The skill SHALL execute four sequential chunks, each scoped to one artifact, with
prior chunk outputs propagated via `ContextBundle.PriorOutputs`. Each chunk prompt
SHALL distinguish between formulation tightening (gated-tier signal) and directional
reframing (escalated-tier signal) and SHALL instruct the LLM to make the smallest
change that achieves coherence with the updated execution layer.

The skill SHALL accept `triggered_signals` in the context — a list of ripple signal
descriptions and authority tiers — and render them in each chunk prompt so the LLM
understands what changed and why the draft was requested.

#### Scenario: Foundation draft produced for gated signal

- **WHEN** a `propagation` signal with severity `warning` (gated tier) targets `north_star`
- **AND** `adapt-foundations` is run with that signal as context
- **THEN** chunk 1 produces a `north_star` payload with only minor formulation changes
- **AND** the chunk prompt instructed the LLM to tighten wording, not reframe direction
- **AND** the output passes schema validation against `north_star_schema.json`

#### Scenario: Foundation draft produced for escalated signal

- **WHEN** a `propagation` signal with severity `critical` (escalated tier) targets `north_star`
- **AND** `adapt-foundations` is run with that signal as context
- **THEN** chunk 1 produces a `north_star` payload that may reframe the vision
- **AND** the chunk prompt instructed the LLM to reframe coherently with the updated formula
- **AND** the output passes schema validation against `north_star_schema.json`

#### Scenario: All four chunks share one batch

- **WHEN** `adapt-foundations` completes all four chunks successfully
- **THEN** all staged mutations share a single `batch_id`
- **AND** the batch contains up to 4 artifact mutations
- **AND** no chunk is auto-committed — the batch remains staged for human review

#### Scenario: Chunk failure preserves prior chunks

- **WHEN** chunk 3 (`insight_analyses`) fails after exhausting retries
- **THEN** chunks 1 and 2 (`north_star`, `strategy_foundations`) remain staged in the partial batch
- **AND** the `RunChunked` call returns an error describing which chunk failed
- **AND** the human can still commit the partial batch

### Requirement: Ripple Post-Commit Foundation Trigger

The system SHALL check, after every `commit_batch` that includes `strategy_formula` or
`roadmap_recipe` mutations, whether any active `gated` or `escalated` ripple signals target
foundation artifacts (`north_star`, `strategy_foundations`, `insight_analyses`,
`insight_opportunity`). If such signals exist, the system SHALL asynchronously enqueue
an `adapt-foundations` skill run on the same instance.

The skill run SHALL produce a staged batch in the human review inbox. The batch
description SHALL include the count of triggering signals, the highest authority tier
present, and a plain-English summary of what prompted the draft. The enqueue MUST be
non-blocking — the `commit_batch` response MUST return immediately without waiting for
the skill run to complete.

#### Scenario: Foundation draft auto-enqueued after adapt-strategy commit

- **WHEN** the human commits the adapt-strategy batch on an instance
- **AND** postCommitRippleAnalysis creates a `propagation` signal targeting `north_star`
- **AND** that signal is classified as `gated` or `escalated`
- **THEN** an `adapt-foundations` skill run is enqueued asynchronously
- **AND** within ~4 minutes a staged batch appears in the human's pending batches
- **AND** the batch description references the triggering signal(s) and authority tier

#### Scenario: No draft when only autonomous signals exist

- **WHEN** the human commits a batch that produces only `autonomous`-tier signals
- **THEN** no `adapt-foundations` run is enqueued
- **AND** the autonomous signals are resolved by the convergence loop as usual

#### Scenario: No draft when SkillExecutor unavailable

- **WHEN** the server starts without an LLM provider configured
- **AND** a commit produces gated signals targeting foundation artifacts
- **THEN** the signals are created and classified as usual
- **AND** no `adapt-foundations` run is enqueued (executor is nil)
- **AND** a log warning is emitted: "adapt-foundations not enqueued: skill executor unavailable"

### Requirement: Signal-to-Batch Linkage

The system SHALL, when a foundation draft batch is committed by the human,
automatically resolve the ripple signals that triggered the draft. The batch metadata
SHALL record the triggering signal IDs so that `commit_batch` can resolve them.

#### Scenario: Commit resolves triggering signals

- **WHEN** the human commits the adapt-foundations batch
- **THEN** all signals listed in the batch's `triggered_by_signals` metadata are resolved
- **AND** each signal's `status` transitions to `resolved` with `batch_id` set
- **AND** `list_signals` no longer returns those signals in the active set

#### Scenario: Discard does not resolve signals

- **WHEN** the human discards the adapt-foundations batch
- **THEN** the triggering signals remain `active`
- **AND** the next adapt-strategy commit may trigger a new draft

### Requirement: Authority Tier in Human Inbox

The batch description for an adapt-foundations draft SHALL communicate urgency to the
human strategy manager in plain English. The description SHALL be calibrated to the
highest authority tier among the triggering signals.

#### Scenario: Gated-tier description

- **WHEN** all triggering signals are `gated` tier
- **THEN** the batch description contains "Formulation alignment"
- **AND** does not use alarming language suggesting directional change

#### Scenario: Escalated-tier description

- **WHEN** any triggering signal is `escalated` tier
- **THEN** the batch description contains "Strategic realignment"
- **AND** includes language indicating the human should review carefully
