## MODIFIED Requirements

### Requirement: Strategy Context Aggregation

The system SHALL provide aggregated strategy context combining multiple
artifact types into coherent response objects suitable for AI agent consumption.
The system SHALL include a ripple signal summary and equilibrium score in the
health check response.

#### Scenario: Full strategic context

- **WHEN** a caller requests strategic context for an instance
- **THEN** the system returns a combined object containing: vision, mission, product position, top personas, and roadmap summary
- **AND** all fields are derived from the latest committed mutations

#### Scenario: Competitive position

- **WHEN** a caller requests competitive positioning
- **THEN** the system returns the competitive analysis from the strategy_foundations artifact
- **AND** returns HTTP 404 if no strategy_foundations mutation exists

#### Scenario: Strategy health summary with equilibrium

- **WHEN** a caller requests instance health
- **THEN** the system returns: artifact counts, lifecycle mode, schema status, validation issues, a `ripple_signals` section with active signal count by severity and the top 3 most critical signals, and an `equilibrium` section with the current coherence score, threshold, and whether the graph is in equilibrium
- **AND** this is a read-only operation -- no state is modified

---

## ADDED Requirements

### Requirement: Equilibrium Status

The system SHALL expose the current equilibrium status of an instance,
including the coherence score, the configured threshold, and a breakdown
of what is preventing equilibrium if the threshold is not met.

#### Scenario: Instance in equilibrium

- **WHEN** a caller requests equilibrium status for an instance whose coherence score is at or above the threshold
- **THEN** the system returns `in_equilibrium: true`, the coherence score, and a breakdown of active signal counts

#### Scenario: Instance not in equilibrium

- **WHEN** a caller requests equilibrium status for an instance whose coherence score is below the threshold
- **THEN** the system returns `in_equilibrium: false`, the coherence score, the deficit from the threshold, and a categorized list of signals contributing to the deficit (autonomous-resolvable, gated, and dismissed)

#### Scenario: Equilibrium with natural tension

- **WHEN** an instance has active tension signals that are within the natural baseline for their track pair
- **THEN** those signals are annotated as `within_baseline: true` in the equilibrium breakdown
- **AND** they contribute zero penalty to the coherence score

---

### Requirement: Convergence History

The system SHALL expose the convergence history for an instance, showing
past convergence loop runs with their iteration counts, auto-resolutions,
damping reasons, and equilibrium scores.

#### Scenario: List convergence runs

- **WHEN** a caller requests convergence history for an instance
- **THEN** the system returns recent convergence loop runs in reverse chronological order
- **AND** each run includes: triggering batch ID, iteration count, auto-committed mutations, damping reason (if any), starting and ending equilibrium scores

#### Scenario: Filter by damping reason

- **WHEN** a caller requests convergence history filtered by `damping_reason='emergency_brake'`
- **THEN** only convergence runs that were stopped by the emergency brake are returned

---

### Requirement: Version Metadata Enrichment

The system SHALL enrich version snapshots with convergence and equilibrium
metadata. Auto-published versions SHALL be distinguishable from manual
versions by their `source` field.

#### Scenario: List versions with source metadata

- **WHEN** a caller lists versions for an instance
- **THEN** each version includes a `source` field (`manual` or `convergence`) and an optional `equilibrium_score` field
- **AND** auto-published equilibrium versions are interleaved chronologically with manual versions

#### Scenario: Get version with convergence metadata

- **WHEN** a caller requests a specific auto-published version
- **THEN** the version metadata includes: `source='convergence'`, `equilibrium_score`, `convergence_summary`, and `triggering_batch_id`

#### Scenario: Diff includes convergence context

- **WHEN** a caller diffs two versions where the target version is auto-published
- **THEN** the diff result includes the convergence summary from the target version's metadata
- **AND** the artifact changes reflect both human edits and auto-committed convergence fixes
