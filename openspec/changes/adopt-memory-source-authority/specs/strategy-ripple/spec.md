## ADDED Requirements

### Requirement: Revision-Bound Use of Memory Results

The system SHALL use a Memory-derived score in change classification only when
the indexed object it was computed against carries the `source_revision` of
the artifact's pre-change payload. Otherwise the system SHALL fall back to
text classification and SHALL NOT assign the autonomous authority tier.

#### Scenario: Matching revision
- **WHEN** a change is classified and the artifact's indexed object carries
  the revision of the pre-change payload
- **THEN** the Memory similarity score is used for class and authority tier
- **AND** the result records the Memory key, the expected revision and the
  observed revision

#### Scenario: Stale projection
- **WHEN** a change is classified and the indexed object carries a different
  revision than the pre-change payload
- **THEN** text fallback classification is used
- **AND** the authority tier is at most `gated`

#### Scenario: Object missing from Memory
- **WHEN** a change is classified and the artifact has no indexed object
- **THEN** text fallback classification is used
- **AND** the authority tier is at most `gated`

---

### Requirement: Origin of Memory-Derived Signals and Adoptions

Signals produced from Memory analysis SHALL record their origin: the analyzer,
the Memory object keys and scores used, and the source revisions those
objects carried. When a batch resolves such a signal, the resulting mutation
SHALL record which signals it adopted and their origin.

#### Scenario: Semantic signal records origin
- **WHEN** drift, tension, clustering or vertical alignment analysis emits a
  signal
- **THEN** the signal's metadata contains an `origin` with analyzer, Memory
  object keys, scores and source revisions

#### Scenario: Structural signal has no Memory origin
- **WHEN** structural analysis emits a signal
- **THEN** the signal's metadata contains no Memory `origin`

#### Scenario: Adoption is traceable
- **WHEN** `commit_batch` or the autonomous commit path resolves a signal with
  a Memory origin
- **THEN** the mutation's batch metadata lists the signal and its origin under
  `adopted_from`

#### Scenario: Origin is visible to clients
- **WHEN** `list_signals` is called
- **THEN** each Memory-derived signal includes its `origin`

---

### Requirement: Dismissed Memory-Derived Signals Stay Dismissed

When a Memory-derived signal is dismissed, the system SHALL NOT raise a new
signal of the same type for the same source and target artifacts while both
artifacts keep the source revisions they had at dismissal.

#### Scenario: Unchanged pair is not re-raised
- **WHEN** a drift signal between two artifacts is dismissed
- **AND** semantic analysis runs again with neither artifact changed
- **THEN** no new drift signal is raised for that pair

#### Scenario: Changed pair is re-evaluated
- **WHEN** a drift signal between two artifacts is dismissed
- **AND** either artifact's content changes
- **THEN** the next semantic analysis may raise a drift signal for that pair
