## ADDED Requirements

### Requirement: Cascade Depth Tracking

The system SHALL track the cascade generation depth of each skill-produced batch.
Direct skill runs SHALL have generation 0. Batches triggered by committing a
cascade-produced batch SHALL have generation N+1 where N is the triggering
batch's generation.

#### Scenario: First-order cascade
- **WHEN** committing an adapt-strategy batch (generation 0) triggers adapt-foundations
- **THEN** the adapt-foundations batch has cascade_generation 1

#### Scenario: Second-order cascade
- **WHEN** committing a generation-1 batch creates signals that would trigger further adaptation
- **THEN** the resulting batch has cascade_generation 2
- **AND** the batch is escalated to authority tier "escalated" with a warning

### Requirement: Cascade Escalation

The system SHALL escalate batches to authority tier "escalated" when the cascade
generation depth reaches the configurable escalation threshold (default: 2). The
batch description SHALL include a warning explaining the cascade depth.

#### Scenario: Escalation at depth threshold
- **WHEN** a skill run produces a batch with cascade_generation >= 2
- **THEN** the batch authority tier is set to "escalated"
- **AND** the batch description includes a cascade depth warning
- **AND** the review inbox shows a cascade generation badge

### Requirement: Cascade Hard Stop

The system SHALL refuse to auto-trigger adaptation skills when the cascade
generation depth reaches the configurable maximum depth (default: 3). The system
SHALL log a warning indicating that manual intervention is required.

#### Scenario: Hard stop at max depth
- **WHEN** committing a generation-2 batch would trigger a generation-3 cascade
- **THEN** the system does NOT enqueue the skill run
- **AND** a warning is logged explaining the cascade depth limit
- **AND** the user can manually trigger the skill if desired

### Requirement: Per-Instance Skill Cooldown

The system SHALL enforce a minimum time interval between auto-triggered runs of
the same skill for the same instance. The default cooldown SHALL be 5 minutes for
adapt-foundations and 10 minutes for adapt-strategy.

#### Scenario: Cooldown prevents rapid re-trigger
- **WHEN** adapt-foundations completed for an instance 2 minutes ago
- **AND** a new commit creates signals that would trigger adapt-foundations again
- **THEN** the trigger is skipped
- **AND** a log entry notes the cooldown

#### Scenario: Cooldown elapsed
- **WHEN** adapt-foundations completed for an instance 6 minutes ago
- **AND** a new commit creates signals that would trigger adapt-foundations
- **THEN** adapt-foundations is triggered normally

## MODIFIED Requirements

### Requirement: Post-Commit Ripple Pipeline

The post-commit ripple pipeline SHALL be implemented as a shared function
callable from both the MCP `commit_batch` tool and the web UI commit handler.
The pipeline SHALL include signal auto-resolution, structural analysis,
semantic classification, foundation draft enqueuing, and convergence loop
execution. The pipeline SHALL NOT be embedded in MCP-specific code.

#### Scenario: Pipeline called from MCP commit
- **WHEN** a batch is committed via the MCP `commit_batch` tool
- **THEN** the shared post-commit pipeline runs
- **AND** results are included in the MCP response (convergence_summary, validation_warnings)

#### Scenario: Pipeline called from web UI commit
- **WHEN** a batch is committed via the web UI draft review page
- **THEN** the same shared post-commit pipeline runs
- **AND** ripple signals are created and auto-resolved identically to the MCP path
- **AND** adapt-foundations is triggered when conditions are met

#### Scenario: Pipeline dependencies
- **WHEN** the pipeline runs
- **THEN** it receives explicit dependencies (ripple service, skill executor, orchestration engine, Memory client)
- **AND** does not depend on MCP-specific service bundles
