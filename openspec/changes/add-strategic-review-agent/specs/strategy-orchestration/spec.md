## ADDED Requirements

### Requirement: Tier 3 Strategic Review Triage

The orchestrator SHALL run the Tier 3 strategic review agent only on changes
whose Tier 2 attention rank exceeds a configurable threshold, so that the
expensive dialogue is reserved for contested changes.

#### Scenario: Aligned changes skip the dialogue

- **WHEN** a change's Tier 2 scorecard has no tensions and a low attention rank
- **THEN** the Tier 3 agent does not run for that change
- **AND** the change proceeds with its Tier 2 scorecard alone

#### Scenario: Contested changes get a dialogue

- **WHEN** a change's Tier 2 attention rank exceeds the configured threshold
- **THEN** the Tier 3 agent runs a dialogue for that change

### Requirement: Grounded Dialogue Agent

The Tier 3 agent SHALL reason about a contested change over multiple turns by
querying strategy-server, and SHALL produce a structured judgment containing a
recommendation, a reasoning chain with cited evidence, a confidence level, and a
residual risk.

#### Scenario: Multi-turn reasoning over the strategy graph

- **WHEN** the agent reviews a contested change
- **THEN** it may ask strategy-server several questions in sequence
- **AND** each question may depend on the previous answer
- **AND** the dialogue stops when the agent reaches a judgment or the turn budget is exhausted

#### Scenario: Structured judgment output

- **WHEN** the agent completes a review
- **THEN** it returns a recommendation of `proceed`, `proceed-with-changes`, `hold`, or `re-scope`
- **AND** the judgment includes the reasoning chain, cited graph evidence, a confidence level, and a residual risk

### Requirement: Read-Only Tool Constraint

The Tier 3 agent SHALL be given only read-only strategy-server tools. Write
tools SHALL be absent from the agent's toolset so that the agent cannot mutate
strategy.

#### Scenario: Agent has no write capability

- **WHEN** the agent's toolset is constructed
- **THEN** it contains only read-only tools (search, neighbors, contradictions, roadmap, artifact reads)
- **AND** no tool that mutates strategy is present

#### Scenario: Bounded turn budget

- **WHEN** the agent runs a dialogue
- **THEN** the number of turns is bounded by a configured budget
- **AND** the agent returns its best judgment when the budget is reached

### Requirement: Strict Review Mode

In strict mode the agent's judgment SHALL be presented to a human as a
recommendation, and only a human decision SHALL advance the change.

#### Scenario: Human decides in strict mode

- **WHEN** the orchestrator runs in strict mode
- **THEN** each judgment is rendered to the human gate as a recommendation
- **AND** the human approves, modifies, or rejects it
- **AND** only an approved change is dispatched to execution

### Requirement: Bounded Auto Review Mode

In auto mode the agent's judgment SHALL become a decision only when all
configured safety guardrails pass, and SHALL otherwise escalate to a human.

#### Scenario: Auto-decide when safe

- **WHEN** running in auto mode for a permitted risk class
- **AND** the judgment confidence meets the threshold, residual risk is low, the recommendation is `proceed` or `proceed-with-changes`, and there is no hard-stop tension
- **THEN** the change is decided automatically and dispatched to execution

#### Scenario: Escalate when not safe

- **WHEN** running in auto mode
- **AND** any safety guardrail fails (low confidence, non-low residual risk, a hold/re-scope recommendation, or a hard-stop tension)
- **THEN** the change is escalated to a human as in strict mode

#### Scenario: High-risk change classes are always strict

- **WHEN** a change touches a footprint in a high-risk class
- **THEN** it is reviewed in strict mode regardless of the configured mode or confidence

#### Scenario: Auto decisions are fully logged

- **WHEN** a change is decided automatically
- **THEN** the same judgment artifact a strict recommendation would produce is recorded
- **AND** it is marked `auto-decided` with its reasoning chain
- **AND** it remains reviewable after the fact

#### Scenario: Merge gate remains human in auto mode

- **WHEN** an auto-decided change is dispatched to execution
- **THEN** the resulting pull request still passes through a human merge gate

### Requirement: Tier 3 Does Not Affect Scheduling

The Tier 3 agent SHALL NOT influence the deterministic wave plan in any way.

#### Scenario: Scheduling is independent of review

- **WHEN** the Tier 3 agent runs
- **THEN** the wave plan is identical to the plan computed without Tier 3
