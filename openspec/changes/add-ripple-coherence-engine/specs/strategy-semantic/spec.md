## ADDED Requirements

### Requirement: Semantic Change Classification

The system SHALL classify the semantic magnitude of artifact changes by
computing embedding cosine distance between old and new content. Changes
SHALL be classified as trivial (< 0.05), minor (0.05-0.15), significant
(0.15-0.30), or major (> 0.30). Classification thresholds SHALL be
configurable per artifact type.

#### Scenario: Trivial change skips ripple analysis

- **WHEN** an artifact is committed and the semantic distance between old and new content is below the trivial threshold
- **THEN** no ripple analysis is triggered and no signals are emitted for that artifact

#### Scenario: Major change triggers full graph ripple

- **WHEN** an artifact is committed and the semantic distance exceeds the major threshold
- **THEN** full graph ripple analysis is triggered, walking the entire connected subgraph for misalignment

### Requirement: Semantic Drift Detection

The system SHALL detect when an artifact's content has semantically drifted
from its declared structural relationships. Drift is measured by comparing
the artifact's content embedding against the embeddings of its declared
`contributes_to` value model paths.

#### Scenario: Feature drifts from declared value path

- **WHEN** a feature's content embedding has lower cosine similarity to its declared value path than to another value path in the model
- **THEN** a `drift` signal is created suggesting the value path mapping may need updating

#### Scenario: No drift detected

- **WHEN** a feature's content embedding is closest to its declared value paths
- **THEN** no drift signal is created

### Requirement: Cross-Track Tension Detection

The system SHALL detect strategic tension between tracks by comparing
per-track embedding centroids. Tracks that should be strategically aligned
but show high semantic divergence SHALL generate tension signals.

#### Scenario: Product and commercial tracks diverging

- **WHEN** the embedding centroid of product track artifacts diverges significantly from commercial track artifacts
- **THEN** a `tension` signal is created identifying the specific areas of divergence

### Requirement: Emergent Clustering Detection

The system SHALL detect semantically similar artifacts that lack structural
relationships, suggesting missing connections in the strategy graph.

#### Scenario: Similar artifacts without relationship

- **WHEN** two artifacts in different tracks have embedding similarity above 0.85 but no `strategy_relationship` connecting them
- **THEN** a `clustering` signal is created suggesting a relationship should be added

### Requirement: Coherence Check

The system SHALL provide an on-demand full-graph coherence analysis that
combines structural and semantic signals into an actionable report. The
check SHALL gracefully degrade to structural-only analysis when Memory
is unavailable.

#### Scenario: Full coherence check with Memory

- **WHEN** `coherence_check` is called and Memory is available
- **THEN** the system returns structural signals (orphaned paths, untested assumptions, staleness) enriched with semantic signals (drift, tension, clustering)

#### Scenario: Coherence check without Memory

- **WHEN** `coherence_check` is called and Memory is unavailable
- **THEN** the system returns structural signals only with a note that semantic analysis is unavailable
