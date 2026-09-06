## ADDED Requirements

### Requirement: Deterministic Portfolio Alignment

The system SHALL provide a deterministic portfolio alignment operation that
activates value model components across all four tracks based on roadmap KR
`value_model_target` references. The operation MUST NOT use an LLM. The
operation MUST only modify `active` flags and `activation_notes` — all other
fields (structure, IDs, names, descriptions, UVPs, maturity data) MUST be
preserved. The operation MUST auto-commit its mutations (no human review gate).

#### Scenario: AIM cycle auto-alignment

- **WHEN** the AIM orchestrated cycle runs
- **AND** the `adapt_strategy` step has committed changes to the roadmap_recipe
- **THEN** the `align_portfolio` step runs automatically after `adapt_strategy`
- **AND** reads the newly committed roadmap KRs
- **AND** for each track with KR targets (including Product), sets `active: true` on L3 sub-components referenced by at least one KR
- **AND** sets `active: false` on L3 sub-components not referenced by any KR
- **AND** propagates activation upward (L2 active if any child L3 active; L1 active if any child L2 active)
- **AND** writes `activation_notes` on each activated L3 citing the KR ID and description
- **AND** preserves all non-activation fields (layers, components, IDs, names, descriptions, UVPs, maturity)
- **AND** auto-commits the value model mutations
- **AND** the cycle continues to `snapshot_cycle`

#### Scenario: No-op skipped

- **WHEN** the alignment operation computes activation state for a track
- **AND** the computed activation state is identical to the current committed state
- **THEN** no mutation is created for that track

#### Scenario: No KR targets populated

- **WHEN** the alignment operation runs
- **AND** no KRs in the roadmap have `value_model_target` fields
- **THEN** no mutations are created
- **AND** the operation completes without error

#### Scenario: Structural preservation

- **WHEN** the alignment operation processes any value model (including Product)
- **THEN** only the `active` flag on L1, L2, and L3 entries and `activation_notes` on L3 entries are modified
- **AND** all other fields (layer names, component IDs, descriptions, UVPs, maturity data, high_level_model, track_maturity) are preserved unchanged

#### Scenario: Unresolvable component path

- **WHEN** a KR has a `value_model_target.component_path` that does not match any L3 sub-component in the value model
- **THEN** the system logs a warning
- **AND** includes the unresolvable path in the alignment summary
- **AND** continues processing other KR targets

### Requirement: Periodic Instance Consistency Check

The system SHALL run a periodic consistency check for each strategy instance,
triggered by the heartbeat ticker. The check MUST be idempotent — running it
on a healthy instance produces no mutations. Each sub-check MUST be independent
so that a failure in one does not block others.

#### Scenario: Consistency check runs on heartbeat

- **WHEN** the heartbeat ticker evaluates instances
- **THEN** for each instance, the system runs the consistency check
- **AND** the check includes value model alignment, missing definition backfill, stale run cleanup, and orphaned batch detection
- **AND** results are recorded in the activity log

#### Scenario: Value model alignment drift detected

- **WHEN** the consistency check runs
- **AND** the value model `active` flags do not match current KR targets
- **THEN** the system runs `AlignPortfolio` to correct the drift
- **AND** auto-commits the corrective mutations

#### Scenario: Missing canonical definitions detected

- **WHEN** the consistency check runs
- **AND** one or more non-product tracks have zero canonical definitions installed
- **THEN** the system installs the missing definitions from embedded templates
- **AND** auto-commits the definition mutations

#### Scenario: Stale skill run detected

- **WHEN** the consistency check runs
- **AND** a skill run has been in `running` status for more than 10 minutes
- **THEN** the system marks the run as `failed` with error "stale run: exceeded 10 minute timeout"

#### Scenario: Orphaned staged mutation detected

- **WHEN** the consistency check runs
- **AND** a staged mutation batch has been pending for more than 24 hours
- **THEN** the system logs a warning with the batch ID and age
- **AND** does not auto-discard the batch (human decision required)

### Requirement: FIRE Dashboard Alignment Status

The FIRE dashboard SHALL display per-track alignment status showing how many
value model components are active and which KRs drive them. There SHALL be
no manual alignment button — alignment is automatic.

#### Scenario: Alignment status visible

- **WHEN** the user views the FIRE dashboard
- **THEN** each track shows the count of active L3 sub-components and total L3 sub-components

#### Scenario: Missing KR targets warning

- **WHEN** the user views the FIRE dashboard
- **AND** the roadmap has KRs without `value_model_target` fields
- **THEN** the dashboard shows a warning indicating the number of KRs lacking target references

## REMOVED Requirements

### Requirement: LLM-Based Portfolio Alignment

**Reason:** The `align-portfolio` LLM skill generates wholesale replacement payloads
that destroy domain-specific value model content and produce non-deterministic
results. Portfolio alignment is a deterministic operation based on KR target
references, not a generative task. The manual FIRE button is removed — alignment
happens automatically via the AIM cycle and periodic consistency check.

**Migration:** The canonical `align-portfolio` skill remains in `epf-canonical` for
potential future use (e.g. Product value model genesis via a different entry point),
but the server no longer invokes it. The `value_models` array handling in
`stageMutationsFromOutput` is retained for backward compatibility.
