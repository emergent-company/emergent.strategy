## ADDED Requirements

### Requirement: Manual Sub-object Editing

The web UI SHALL allow users to edit individual sub-objects of an artifact (e.g. a
belief, a value-model component, a KR) through scoped inline forms, without
regenerating the whole artifact via AI. Editability SHALL be per-type and
per-sub-object; canonical-derived structure SHALL remain read-only.

#### Scenario: Edit an editable sub-object

- **WHEN** a user opens the Edit affordance on an editable sub-object and submits changes
- **THEN** the system builds a patch set and stages it via the sub-object patch primitive
- **AND** the user is taken to the draft review screen to commit or discard

#### Scenario: Read-only sub-object has no edit affordance

- **WHEN** a sub-object is canonical-derived or otherwise marked read-only
- **THEN** no Edit affordance is shown for it

#### Scenario: List sub-object add/remove/reorder

- **WHEN** a user adds, removes, or reorders an item in a list-typed sub-object
- **THEN** the corresponding append/remove/insert patches are staged for review

#### Scenario: Field-level diff at review

- **WHEN** a patch batch reaches the draft review screen
- **THEN** the screen shows a precise per-field diff derived from the batch metadata

### Requirement: Context-aware Artifact Assistant

The web UI SHALL provide a conversational assistant, available on artifact and phase
pages, that is aware of the current artifact and can prepare changes for human review.
The assistant SHALL NOT commit changes.

#### Scenario: Assistant answers with artifact context

- **WHEN** a user asks a question with an artifact open
- **THEN** the assistant's response is grounded in the current artifact, its sub-objects,
  linked evidence, and open signals injected into the system prompt

#### Scenario: Assistant prepares a change

- **WHEN** the user asks the assistant to modify the artifact
- **THEN** the assistant stages a patch batch and returns an inline "Review change" link
- **AND** the change is only applied after the user commits it

#### Scenario: Assistant has no commit capability

- **WHEN** the assistant attempts any tool
- **THEN** only allowlisted read and propose (staging) tools are available; no commit
  tool exists for the assistant

#### Scenario: Conversation persists across restarts

- **WHEN** the server restarts
- **THEN** an existing conversation's messages are still available to the same user

#### Scenario: Graceful degradation without an LLM

- **WHEN** no LLM is configured
- **THEN** the assistant falls back to a deterministic keyword-routed mock, and the
  manual sub-object editing UI continues to function
