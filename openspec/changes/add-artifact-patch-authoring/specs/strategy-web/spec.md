## ADDED Requirements

### Requirement: Manual Sub-object Editing

The web UI SHALL allow users to edit individual sub-objects of an artifact (for
example a belief, a value-model component, a KR) through scoped inline forms, without
regenerating the whole artifact via AI. Editability SHALL be per-type and
per-sub-object; canonical-derived structure SHALL remain read-only.

#### Scenario: Edit an editable sub-object

- **WHEN** a user edits a sub-object through its inline form and submits
- **THEN** a patch set is staged and the user is taken to the draft review screen
- **AND** no change is applied to current state until the batch is committed

#### Scenario: Read-only sub-object exposes no edit affordance

- **WHEN** a sub-object is declared read-only
- **THEN** no Edit affordance is rendered for it

#### Scenario: List sub-objects can be added, removed and reordered

- **WHEN** a user adds, removes or reorders items in a list-typed sub-object
- **THEN** the corresponding `append`, `remove` or `insert` patches are staged

#### Scenario: Field-level diff at review

- **WHEN** a patch batch is reviewed
- **THEN** the review screen renders which fields changed, with their before and after
  values, rather than a whole-payload dump

#### Scenario: Review screen shows what produced the batch

- **WHEN** a pending batch is reviewed
- **THEN** the reviewer can see whether it came from a human edit, a named skill run,
  or a background cascade

#### Scenario: Editing works with no LLM configured

- **WHEN** the server is running with no LLM provider configured
- **THEN** manual sub-object editing, staging, review and commit all function normally
