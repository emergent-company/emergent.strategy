## ADDED Requirements

### Requirement: Context-aware Artifact Authoring Agent

The web UI SHALL provide a conversational agent, available on artifact and phase
pages, that is aware of the current artifact and can prepare changes for human review.
The agent SHALL NOT commit changes.

#### Scenario: The agent is grounded in the current artifact

- **WHEN** a user opens the agent on an artifact page and asks about that artifact
- **THEN** the agent's answer reflects the current artifact, its sub-objects, its
  linked evidence and its open signals

#### Scenario: Grounding respects a budget

- **WHEN** the material relevant to a turn exceeds the configured context ceiling
- **THEN** the context is reduced to fit before the model is called
- **AND** what was dropped is recorded

#### Scenario: The agent prepares a reviewable change

- **WHEN** a user asks the agent to change something and the agent acts
- **THEN** a change is staged and the conversation shows a link to review it
- **AND** nothing is applied to current state until the user commits

#### Scenario: The user can see what the agent is doing

- **WHEN** the agent is working through a multi-step turn
- **THEN** progress is visible in the UI as it happens, rather than only on completion

#### Scenario: Council review is visible as its own activity

- **WHEN** the agent is consulting the coherence council on a significant edit
- **THEN** the UI shows this distinctly from ordinary tool-call progress, so a
  multi-second parallel review does not appear as a stalled request

#### Scenario: Conversations persist across restarts

- **WHEN** the server restarts
- **THEN** an existing conversation's messages are still available to the same user

#### Scenario: Conversations are isolated per user and organisation

- **WHEN** a user opens the agent
- **THEN** they see only their own conversations within their own organisation

#### Scenario: Graceful degradation without a language model

- **WHEN** the server is running with no LLM provider configured
- **THEN** the agent falls back to a deterministic mock
- **AND** manual sub-object editing continues to function

### Requirement: Agent-prepared Changes Are Attributed at Review

The review surface SHALL show that a change was prepared by an agent, and on whose
behalf, so that a reviewer can distinguish it from a change a human made directly.

#### Scenario: An agent-prepared batch is labelled

- **WHEN** a reviewer opens a batch staged by the authoring agent
- **THEN** the review surface identifies the agent as its source and the human it acted
  for

#### Scenario: A council-reviewed batch shows per-expert reasoning

- **WHEN** a reviewer opens a batch that resulted from coherence council review
- **THEN** the review surface shows which expert raised which point, rather than a
  single merged rationale

### Requirement: External Research Is Visibly Distinguished From the User's Own Content

Where the agent uses external web research in a conversation, the UI SHALL make clear
which parts of its answer came from external sources rather than from the user's own
strategy content.

#### Scenario: A research-informed answer names its sources

- **WHEN** the agent's answer draws on externally retrieved content
- **THEN** the UI shows that the information came from external research, distinct
  from the user's own artifacts and evidence
