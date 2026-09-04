# agent-runtime

> Deltas from `harden-aim-execution`. These address the layer-2 gap described in
> `docs/UNIFIED_AGENT_ARCHITECTURE.md` §2.1: AIM currently uses the agent-runtime
> layer to provide durable execution, which gives it park/wake but not step
> memoization, durable timers, or dynamic control flow.
>
> These requirements are deliberately **engine-neutral**. They state what the
> execution layer must guarantee, not which engine provides it. That is the
> decision `harden-aim-execution` Part A1 makes.

## ADDED Requirements

### Requirement: A retried run resumes from the first uncompleted step

The system SHALL NOT re-execute steps that completed successfully in a prior
attempt of the same run.

AIM steps cost 127K–230K LLM tokens each and stage mutation batches. Re-running a
completed step on retry is not merely wasteful — it would stage a duplicate batch
for work a human may already have reviewed.

#### Scenario: Retry after a mid-cycle failure

- **GIVEN** a run whose first two steps completed and whose third step failed
- **WHEN** the run is retried
- **THEN** steps one and two are not executed again
- **AND** their recorded results remain available to later steps
- **AND** execution begins at the third step

#### Scenario: Retry does not duplicate a staged batch

- **GIVEN** a completed step that staged a mutation batch
- **WHEN** the run is retried after a later step failed
- **THEN** no second batch is staged for that step

#### Scenario: Retry is observable

- **GIVEN** a run that has been retried
- **WHEN** an operator inspects the run
- **THEN** the retry is distinguishable from the original attempt
- **AND** steps carried forward are distinguishable from steps newly executed

### Requirement: Terminated runs' sessions are reclaimed

The system SHALL delete the agent session belonging to a run in a terminal state
after a configurable retention window, and SHALL NOT delete the session of a run
that may still be resumed.

One session exists per cycle and is disposable once the cycle terminates. Without
this, `adk_sessions` grows without bound.

#### Scenario: A terminal run's session is reclaimed

- **GIVEN** a run in a terminal state, older than the retention window
- **WHEN** the retention sweep runs
- **THEN** its session and the session's events are deleted
- **AND** the run's metadata record is retained, because cross-run history does not
  live in the session

#### Scenario: An open gate is never reclaimed

- **GIVEN** a run awaiting human input, older than the retention window
- **WHEN** the retention sweep runs
- **THEN** its session is not deleted
- **AND** the run remains resumable

A gate open for months is a slow review, not an abandoned run. The abandoned-gate
sweep — a separate mechanism with its own, much longer threshold — is what ends
those.

#### Scenario: Reclamation is observable

- **GIVEN** the retention sweep has run
- **WHEN** an operator inspects the logs
- **THEN** the number of sessions reclaimed is recorded

### Requirement: The AIM cycle definition stays engine-neutral

The package defining AIM's steps SHALL NOT import any execution-engine package.

This is what makes the execution layer replaceable. `domain/aim` currently imports
no engine package at all — not even `pkg/orchestration` — and the engine recovers
its steps through a structural cast. Any change that puts engine types into the
domain layer removes the ability to make this decision again.

#### Scenario: Step definitions carry no engine types

- **GIVEN** the package defining the AIM cycle's steps
- **WHEN** its imports are inspected
- **THEN** no execution-engine package appears
- **AND** the step input and output types are defined in domain terms

#### Scenario: Changing the execution engine does not change the steps

- **GIVEN** a change of execution engine
- **WHEN** the change is complete
- **THEN** the step bodies are unmodified
