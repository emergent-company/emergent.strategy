## ADDED Requirements

### Requirement: Embedding-Based Change Classification

The system SHALL classify the semantic magnitude of artifact changes using
Memory's embedding-based search scores rather than text-overlap heuristics.
When Memory is unavailable, the system SHALL fall back to structural heuristics
(downstream artifact count and artifact type sensitivity).

#### Scenario: Classify change with Memory available

- **WHEN** an artifact is committed and Memory is available
- **THEN** the system searches Memory using the new content as query
- **AND** the search score of the artifact's own key measures similarity to its previously indexed (old) content
- **AND** the change is classified as trivial (score > 0.95), minor (0.85-0.95), significant (0.70-0.85), or major (< 0.70)

#### Scenario: Classify change without Memory

- **WHEN** an artifact is committed and Memory is unavailable
- **THEN** the system classifies the change using structural heuristics: downstream artifact count and artifact type sensitivity
- **AND** the classification is returned with a note that semantic classification is unavailable

#### Scenario: Artifact type sensitivity

- **WHEN** a North Star or strategy formula artifact is classified
- **THEN** the system applies tighter thresholds (trivial > 0.97, minor 0.92-0.97, significant 0.80-0.92, major < 0.80)
- **AND** the tighter thresholds reflect that foundational artifacts have disproportionate downstream impact

---

### Requirement: Cross-Track Tension Detection

The system SHALL detect strategic tension between EPF tracks by comparing
per-track embedding centroids via Memory search. Tension that exceeds the
configured natural baseline for a track pair SHALL generate signals.

#### Scenario: Detect excess tension between tracks

- **WHEN** the measured semantic divergence between two tracks exceeds the natural tension baseline configured for that track pair
- **THEN** a `tension` signal is created with severity proportional to the excess (warning if excess < 0.15, critical if excess >= 0.15)
- **AND** the signal description identifies the specific areas of divergence

#### Scenario: Natural tension within baseline

- **WHEN** the measured semantic divergence between two tracks is within the natural tension baseline
- **THEN** no tension signal is created for that track pair

#### Scenario: No Memory available

- **WHEN** cross-track tension detection is requested and Memory is unavailable
- **THEN** the system skips tension detection and logs that semantic analysis is unavailable

---

### Requirement: Equilibrium Scoring

The system SHALL compute a coherence score (0.0 to 1.0) for an instance that
quantifies how close the strategy graph is to equilibrium. The score SHALL
account for natural inter-track tension by subtracting configured baseline
tension from measured tension.

#### Scenario: Compute equilibrium score

- **WHEN** the system computes the equilibrium score for an instance
- **THEN** the score is calculated as: 1.0 minus the weighted sum of active signal penalties (critical: 0.20, warning: 0.05, info: 0.00)
- **AND** tension signals within natural baselines are excluded from the penalty
- **AND** dismissed signals are excluded from the penalty

#### Scenario: Equilibrium reached

- **WHEN** the coherence score is at or above the instance's configured equilibrium threshold (default 0.70)
- **THEN** the system reports the graph as "in equilibrium"
- **AND** no further convergence iterations are needed

#### Scenario: Equilibrium not reached but only gated signals remain

- **WHEN** the coherence score is below the equilibrium threshold and all remaining signals are above the autonomous authority threshold
- **THEN** the system reports the graph as "pending human review"
- **AND** lists the gated signals that require human attention

#### Scenario: Score accounts for natural tension

- **WHEN** two tracks have measured tension of 0.22 and the natural baseline for that pair is 0.25
- **THEN** the tension signal contributes zero penalty to the coherence score
- **AND** the signal is annotated as "within natural baseline"

## MODIFIED Requirements

### Requirement: Semantic Change Classification

The system SHALL classify the semantic magnitude of artifact changes by
computing embedding distance via Memory search scores. Changes SHALL be
classified as trivial (score > 0.95), minor (0.85-0.95), significant
(0.70-0.85), or major (< 0.70). Classification thresholds SHALL be
configurable per artifact type. When Memory is unavailable, the system
SHALL fall back to structural heuristics.

#### Scenario: Trivial change classified as autonomous

- **WHEN** an artifact is committed and the semantic distance is classified as trivial
- **THEN** the change is assigned authority tier `autonomous`
- **AND** downstream ripple signals generated from this change are eligible for auto-resolution

#### Scenario: Major change classified as escalated

- **WHEN** an artifact is committed and the semantic distance is classified as major
- **THEN** the change is assigned authority tier `escalated`
- **AND** all downstream ripple signals require human review before resolution

#### Scenario: Memory unavailable fallback

- **WHEN** an artifact is committed and Memory is unavailable
- **THEN** the system classifies the change using structural heuristics as a fallback
- **AND** all classifications default to at least `gated` authority tier (no autonomous commits without semantic verification)
