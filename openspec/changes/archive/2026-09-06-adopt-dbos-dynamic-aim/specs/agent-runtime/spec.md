# agent-runtime

> Deltas from `adopt-dbos-dynamic-aim`. The retry and session-retention
> requirements added by `harden-aim-execution` are engine-neutral as written
> and are not modified here — they describe guarantees, and this change
> replaces the mechanism that provides them, not the guarantees themselves.
> This file adds only what is genuinely new: dynamic step planning.

## ADDED Requirements

### Requirement: A cycle's step sequence may depend on the instance running it

The system SHALL allow different instances to run different steps, or the
same steps in a different order, decided at cycle start.

This is the "cheap" half of dynamic AIM per the design cost analysis: known
at cycle-start time, not requiring anything mid-flight to change.

#### Scenario: Two instances run different step sets

- **GIVEN** two instances at different maturity levels
- **WHEN** each starts an AIM cycle
- **THEN** the set or order of steps executed may differ between them
- **AND** each instance's run log reflects the steps it actually ran, not a
  fixed template

### Requirement: A running cycle may be re-planned mid-execution

The system SHALL support a signal, delivered while a cycle is running, that
causes the next step to be chosen with updated information rather than the
plan decided at cycle start.

This is deliberately narrower than a reconciler (baseline open question 9,
still unanswered): it changes what happens next within an already-running
cycle. It does not replace the discrete-cycle model, and it does not decide
whether a cycle should start or stop independent of this mechanism.

#### Scenario: A signal between steps changes what runs next

- **GIVEN** a cycle that has completed one step and not yet started the next
- **WHEN** a re-plan signal arrives carrying updated domain state
- **THEN** the next step chosen reflects that updated state
- **AND** the step that already completed is not re-executed or reverted

#### Scenario: A signal does not interrupt an in-flight step

- **GIVEN** a cycle with a step currently executing
- **WHEN** a re-plan signal arrives
- **THEN** the in-flight step completes normally
- **AND** the signal is applied only when the next step is chosen

### Requirement: The step-planning contract stays engine-neutral

The package defining how AIM's next step is chosen SHALL NOT import any
execution-engine package, carrying forward `harden-aim-execution`'s kill
criterion 5 unchanged.

#### Scenario: Dynamic planning does not compromise engine neutrality

- **GIVEN** the package that decides an AIM cycle's next step
- **WHEN** its imports are inspected
- **THEN** no execution-engine package appears
- **AND** this holds identically to the fixed-step case this requirement
  replaces
