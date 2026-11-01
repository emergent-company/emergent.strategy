## ADDED Requirements

### Requirement: Strategy Definition Source of Truth

A strategy instance's definition SHALL be authoritative only in released form:
the set of EPF artifacts committed to the instance's linked git repository, or,
for an instance without a linked repository, a release the server stores in
the same form. Unreleased edits in the server's database SHALL be treated as a
workspace and SHALL NOT be presented as the instance's released strategy.

#### Scenario: Released and workspace states are distinguishable
- **WHEN** an instance has edits that have not been released
- **THEN** reads can tell the released version from the workspace state
- **AND** the web UI and MCP tools indicate which one they show

#### Scenario: Instance without a repository keeps releases
- **WHEN** an instance has no linked repository and an author releases
- **THEN** the server stores the release as the full artifact set with a
  version identifier
- **AND** linking a repository later exports that release history without
  conversion

---

### Requirement: Only Validated Releases Are Loaded Into the Runtime

The system SHALL load into the strategy runtime only releases that pass the
release gate: every artifact validates against its canonical JSON Schema,
every reference resolves under the canonical ontology's identity rules, and
decomposition produces only types and relations declared in the canonical
ontology. Workspace edits MAY be invalid.

#### Scenario: Invalid workspace edit is allowed
- **WHEN** an author stages an edit that fails schema validation
- **THEN** the edit is kept in the workspace with validation warnings

#### Scenario: Invalid release is refused
- **WHEN** an author releases a workspace that fails any gate check
- **THEN** the release is refused with the failing checks listed
- **AND** the runtime keeps running the previous release

#### Scenario: Runtime state references its release
- **WHEN** the runtime records a signal, evidence item or assessment
- **THEN** the record identifies the release it was produced against

---

### Requirement: Persisted Data Is Classified by Layer

Every entity type and relation type the system persists or projects SHALL be
classified as definition, runtime or synthesis, as declared by the canonical
ontology. Runtime and synthesis data SHALL NOT be written into definition
artifacts except by adoption through the workspace, and synthesis SHALL NOT be
presented as definition.

#### Scenario: Runtime state stays out of definitions
- **WHEN** ripple, AIM or evidence tools record their results
- **THEN** no definition artifact is modified by recording them

#### Scenario: Synthesis is labelled
- **WHEN** a client reads graph data that includes inferred or
  embedding-based relations
- **THEN** each such relation is identified as synthesis

---

### Requirement: One Adoption Path for Proposed Changes

Every change to a definition that does not originate as an author's own edit
in the workspace — including edits made directly in git, ripple fixes,
accepted link suggestions, adopted Memory synthesis and AIM recommendations —
SHALL enter the workspace as a staged batch and SHALL record its origin: the
kind of proposal, its producer, and the inputs and input revisions it was
derived from.

#### Scenario: Accepted suggestion records origin
- **WHEN** an author accepts a suggested link
- **THEN** a staged batch writes the reference
- **AND** the batch records the suggestion's origin

#### Scenario: Git edit enters as a staged batch
- **WHEN** artifacts were changed directly in the linked repository
- **THEN** the change is brought into the workspace as a staged batch with
  origin `git` and the source commit
- **AND** it is not applied by overwriting the workspace
