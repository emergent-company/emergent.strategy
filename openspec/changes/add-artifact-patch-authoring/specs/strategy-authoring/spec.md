## ADDED Requirements

### Requirement: Sub-object Patch Primitive

The strategy service SHALL provide a sub-object editing primitive that applies a set
of JSON Pointer (RFC 6901) patches to an artifact's committed payload and stages the
re-validated result as a normal whole-payload mutation. The payload SHALL remain the
unit of persistence; patches are the unit of authoring.

#### Scenario: Apply a set patch to a sub-object

- **WHEN** `StagePatch` is called with `{op: set, path: "/beliefs/2/statement", value: "..."}`
- **THEN** the service loads the current committed payload, applies the patch in memory,
  re-validates the full payload against the canonical schema, and stages an `update`
  mutation containing the modified payload
- **AND** a `batchID` is returned for human review

#### Scenario: Reject patch producing an invalid payload

- **WHEN** a patch would make the payload fail canonical schema validation
- **THEN** no mutation is staged and a validation error is returned

#### Scenario: Unresolvable path

- **WHEN** a patch path does not resolve in the current payload
- **THEN** no mutation is staged and a path-resolution error is returned

#### Scenario: Patches apply in order and atomically

- **WHEN** a patch set contains multiple patches and one of them fails
- **THEN** no mutation is staged and none of the earlier patches in the set is persisted

#### Scenario: List operations address array positions

- **WHEN** a patch uses `append`, `insert` or `remove` against a list-typed sub-object
- **THEN** the array is modified at the addressed position and the resulting payload is
  re-validated before staging

#### Scenario: Patch set recorded for diff

- **WHEN** a patch batch is staged
- **THEN** the applied patches with before/after values are recorded in the batch
  metadata so a per-field diff can be rendered at review time

#### Scenario: Identity-based path resolution

- **WHEN** a sub-object of a known type has a stable identity field and a patch
  references it by identity
- **THEN** the service resolves the identity to the correct payload location before
  applying the patch

#### Scenario: Identity resolution survives reordering

- **WHEN** a list of sub-objects has been reordered since the client read it, and a
  patch addresses a sub-object by identity
- **THEN** the patch is applied to the sub-object bearing that identity, not to the
  position it previously occupied

#### Scenario: Raw pointers work for artifact types without a decomposer

- **WHEN** a patch addresses an artifact type that has no structural decomposer
- **THEN** raw JSON Pointer addressing resolves and the patch applies normally

### Requirement: Patch Staging Uses the Human Gate

Patches staged via the sub-object primitive SHALL never auto-commit. They SHALL be
committed or discarded through the existing batch review and commit flow.

#### Scenario: Patch is staged, not committed

- **WHEN** `StagePatch` succeeds
- **THEN** the resulting mutation has staged status and appears in pending batches
- **AND** the change is only applied to current state after an explicit commit

#### Scenario: Committed patch batch runs the post-commit pipeline

- **WHEN** a patch batch is committed
- **THEN** the same post-commit pipeline that runs for any other batch runs for this
  one, so ripple analysis and convergence are not bypassed by the editing surface

### Requirement: Editability Is Declared and Enforced at Every Write Surface

The service SHALL declare which artifact types and sub-object paths are editable, and
SHALL enforce that declaration at every surface that can write, not only in the view
that renders the affordance.

#### Scenario: Canonical-derived structure is read-only

- **WHEN** a patch targets a path declared read-only, such as canonical-derived
  value-model layer structure
- **THEN** the patch is refused and no mutation is staged

#### Scenario: Enforcement is independent of the UI

- **WHEN** a read-only path is patched by calling the write surface directly, without
  going through the rendered form
- **THEN** the patch is still refused

### Requirement: Staged Batches Declare Their Provenance

Pending batches SHALL identify what produced them, so a reviewer can distinguish a
human edit from a skill-generated draft from a background cascade.

#### Scenario: Skill-generated batch is attributable

- **WHEN** a batch produced by a skill run is listed as pending
- **THEN** the originating skill and its run identifier are available on the listing

#### Scenario: Human patch batch is attributable

- **WHEN** a batch produced by the sub-object patch primitive is listed as pending
- **THEN** it is distinguishable from a skill-generated batch
