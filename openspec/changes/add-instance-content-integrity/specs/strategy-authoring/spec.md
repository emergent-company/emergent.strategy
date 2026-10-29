## ADDED Requirements

### Requirement: Scaffolding Does Not Present Framework Content As Strategy

`scaffold_instance` and the canonical definitions installer SHALL leave the
instance in a state where the seeded framework content is classified, indexed
and excluded from answer-facing reads, in the same way as imported content.

`scaffold_instance` SHALL index the artifacts it seeds, so the instance is
consistent with one created by import. Its response and `next_steps` SHALL state
that the seeded artifacts are templates to be filled in, and which are
unmodified.

#### Scenario: Scaffold, then ask

- **WHEN** an instance is scaffolded and a client then reads its roadmap
- **THEN** the read reports that the roadmap is not defined yet
- **AND** the template's example objectives are not returned

#### Scenario: Definitions installed on request

- **WHEN** a user installs the canonical definitions from the web interface
- **THEN** the definitions are classified as canonical reference
- **AND** answer-facing reads do not return them as the instance's strategy

#### Scenario: Template is filled in

- **WHEN** an author replaces a seeded template with content that differs from
  every canonical item
- **THEN** its class is cleared on the next index derivation
- **AND** it is served as the instance's own strategy
