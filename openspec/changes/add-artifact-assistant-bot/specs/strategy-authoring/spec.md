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

#### Scenario: Patch set recorded for diff

- **WHEN** a patch batch is staged
- **THEN** the applied patches with before/after values are recorded in the batch
  metadata so a per-field diff can be rendered at review time

#### Scenario: Identity-based path resolution

- **WHEN** a sub-object of a known type has a stable identity field and a patch
  references it by identity
- **THEN** the service resolves the identity to the correct payload location before
  applying the patch

### Requirement: Patch Staging Uses the Human Gate

Patches staged via the sub-object primitive SHALL never auto-commit. They SHALL be
committed or discarded through the existing batch review and commit flow.

#### Scenario: Patch is staged, not committed

- **WHEN** `StagePatch` succeeds
- **THEN** the resulting mutation has staged status and appears in pending batches
- **AND** the change is only applied to current state after an explicit commit
