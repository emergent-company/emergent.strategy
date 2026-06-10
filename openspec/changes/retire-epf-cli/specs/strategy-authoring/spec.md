## ADDED Requirements

### Requirement: Local-Repo Authoring Loop

strategy-server SHALL, in `local` mode, persist committed artifacts from the
staged-batch authoring workflow (stage → review → commit) back to the git-tracked
instance directory as YAML, so that the repo remains the system of record. Reads
SHALL reflect the repo's current YAML, and writes SHALL produce a reviewable
`git diff`.

#### Scenario: Commit writes YAML back to the repo

- **GIVEN** a staged batch in `local` mode
- **WHEN** the user commits it
- **THEN** the committed artifacts are written to the instance directory as YAML,
  the derived index updates, and `git diff` shows the change.

### Requirement: File/DB Reconciliation

In `local` mode strategy-server SHALL reconcile hand-edited or git-pulled YAML
with its derived datastore. On reconciliation the repo YAML SHALL take precedence
for authored content, the derived state (index, ripple, versions) SHALL be
re-derived, and any staged-but-uncommitted batch that conflicts with the
reconciled content SHALL be surfaced to the user rather than silently discarded.

#### Scenario: Hand-edit then reconcile

- **GIVEN** a local instance with a derived datastore
- **WHEN** the user edits artifact YAML by hand and triggers reconciliation
- **THEN** the edited content becomes the authoritative state and the derived
  data is rebuilt to match.

#### Scenario: Conflicting staged batch is surfaced

- **GIVEN** an uncommitted staged batch and a conflicting hand-edit to the same
  artifact's YAML
- **WHEN** reconciliation runs
- **THEN** the conflict is reported to the user and the staged batch is not
  silently dropped.
