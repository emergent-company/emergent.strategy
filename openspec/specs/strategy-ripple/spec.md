# Capability: strategy-ripple

## Purpose

The Ripple Coherence Engine detects, classifies, and resolves misalignments in
the strategy graph. It treats the graph as a living system — changes propagate
through connected artifacts, and the engine maintains coherence through a
feedback loop with configurable autonomy.

The engine operates in two modes:
- **Agent-orchestrated** (MCP clients drive resolution): detection-only convergence;
  the AI agent sees signals and drives fixes via subsequent MCP calls.
- **Server-orchestrated** (LLM provider configured): the convergence loop
  autonomously resolves low-authority signals via a pluggable `SignalResolver`.

## Theoretical Basis

The engine synthesizes concepts from several established fields:

- **Truth Maintenance Systems** (Doyle 1979, de Kleer 1986): The strategy graph
  is a belief network with justification chains. Signals are nogoods —
  inconsistencies detected by dependency tracking.
- **Change Impact Analysis** (Bohner & Arnold 1996): `propose_change` computes
  the Estimated Impact Set via structural reachability; semantic analysis
  narrows to the Actual Impact Set.
- **Constraint Propagation** (Mackworth 1977): The convergence loop is a
  fixpoint iteration with arc-consistency-style violation detection and damping
  to handle non-monotonic resolution.
- **Feedback Control Systems** (Åström & Murray 2008): The loop is a
  discrete-time controller with setpoint (equilibrium threshold), error signal
  (score deficit), and rate limiting (change budget, emergency brake).

The key novelty is using an LLM as the resolution operator — replacing
deterministic constraint solvers with natural-language reasoning over strategic
content. This requires the multi-layered damping approach to compensate for
non-deterministic resolution. See `design.md` for the full theoretical mapping.

---

## Requirements

### Requirement: Signal Detection

The system SHALL detect misalignments between connected strategy artifacts and
represent them as typed, severity-classified ripple signals. Signals are
ephemeral observations stored in `ripple_signals`, not versioned artifacts.

#### Scenario: Structural coherence check

- **WHEN** `coherence_check` is called for an instance
- **THEN** the system walks the relationship graph to detect orphaned value model
  paths (no `contributes_to` edges), untested assumptions (no `tests_assumption`
  edges), and stale downstream artifacts (updated before their upstream dependency)
- **AND** returns signals grouped by type and severity

#### Scenario: Blast radius preview

- **WHEN** `propose_change` is called with an artifact key
- **THEN** the system walks downstream, upstream, and transitive relationships to
  identify all artifacts that may need review
- **AND** returns the affected artifact list with staleness duration and relationship type

#### Scenario: Post-commit signal generation

- **WHEN** a batch is committed via `commit_batch`
- **THEN** the system automatically runs structural ripple analysis on each
  committed artifact, auto-resolves signals for updated targets, creates new
  signals for detected misalignments, and returns a `ripple_signals` summary
  in the commit response

---

### Requirement: Semantic Analysis

The system SHALL perform embedding-based coherence analysis using the Memory
semantic graph when available, gracefully degrading to structural-only when
Memory is unavailable.

#### Scenario: Semantic drift detection

- **WHEN** the semantic analyzer runs with Memory available
- **THEN** it compares each feature's content embedding against its declared
  `contributes_to` value paths and emits `drift` signals when the feature is
  semantically closer to an undeclared path than its declared one

#### Scenario: Cross-track tension detection

- **WHEN** the semantic analyzer runs with Memory available
- **THEN** it measures semantic divergence between tracks by searching Memory
  with one track's content and checking similarity to other tracks' artifacts
- **AND** generates `tension` signals only for divergence exceeding the
  configured natural tension baseline for that track pair

#### Scenario: Vertical alignment detection

- **WHEN** the semantic analyzer runs with Memory available
- **THEN** it checks that downstream artifacts (features, roadmap, formula)
  appear in the semantic neighborhood of their upstream anchors (North Star,
  strategy formula) and emits `drift` signals for misaligned pairs

#### Scenario: Clustering detection

- **WHEN** the semantic analyzer runs with Memory available
- **THEN** it identifies pairs of artifacts with high embedding similarity
  (> 0.75) that lack structural relationships, suggesting missing connections

#### Scenario: Graceful degradation

- **WHEN** Memory is unavailable
- **THEN** semantic analysis is skipped entirely, structural signals are still
  generated, and responses include a note that semantic analysis is unavailable

---

### Requirement: Change Classification

The system SHALL classify every artifact change by semantic magnitude using
Memory embedding scores as the primary classifier, with text-overlap and
structural heuristics as fallbacks.

#### Scenario: Embedding-based classification

- **WHEN** an artifact is committed and Memory is available
- **THEN** the system searches Memory using the new content, finds the
  artifact's own key in results (which still holds the old indexed content),
  and uses the search score as a similarity measure
- **AND** classifies the change as trivial, minor, significant, or major
  based on configurable per-artifact-type thresholds

#### Scenario: Structural fallback

- **WHEN** an artifact is committed and Memory is unavailable
- **THEN** the system classifies using structural heuristics (downstream
  artifact count and artifact type sensitivity)
- **AND** never assigns `autonomous` authority without semantic verification

#### Scenario: Authority tier assignment

- **WHEN** a change is classified
- **THEN** it is assigned an authority tier: `autonomous` (trivial/minor),
  `gated` (significant), or `escalated` (major)
- **AND** foundational artifacts (North Star, strategy formula) have tighter
  thresholds than features

---

### Requirement: Equilibrium Scoring

The system SHALL compute a coherence score (0.0-1.0) for an instance that
quantifies strategic alignment. The score accounts for signal severity,
signal type (structural vs semantic), and natural inter-track tension.

#### Scenario: Score computation

- **WHEN** equilibrium is computed for an instance
- **THEN** the score equals 1.0 minus the weighted sum of active signal penalties
- **AND** structural signals (orphan, staleness) carry lower penalties than
  semantic signals (drift, tension, propagation)
- **AND** tension signals within their natural baseline contribute zero penalty
- **AND** dismissed signals are excluded from the calculation

#### Scenario: Equilibrium threshold

- **WHEN** the score is at or above the instance's configured threshold (default 0.70)
- **THEN** the system reports the graph as in equilibrium

#### Scenario: Penalty weights

- **WHEN** a signal contributes to the penalty
- **THEN** critical semantic signals contribute 0.15, critical structural signals 0.05,
  warning semantic signals 0.04, warning structural signals 0.02, info signals 0.00

---

### Requirement: Convergence Loop

The system SHALL run a convergence loop after every `commit_batch` that
iteratively detects misalignments and optionally auto-resolves low-authority
signals until equilibrium is reached or damping limits are hit.

#### Scenario: Detection-only mode (agent-orchestrated)

- **WHEN** the convergence loop runs without a `SignalResolver`
- **THEN** it detects signals, classifies authority tiers, computes equilibrium,
  and returns the result without modifying any artifacts
- **AND** the `convergence_summary` in the commit response tells the agent
  what needs attention

#### Scenario: Resolution mode (server-orchestrated)

- **WHEN** the convergence loop runs with a `SignalResolver`
- **THEN** it calls the resolver for each autonomous-tier signal, commits
  fixes via `CommitAuto`, resolves the signal, tracks cumulative change
  distance, and re-senses
- **AND** the loop continues until equilibrium or damping

#### Scenario: Signal authority classification

- **WHEN** the loop classifies signals for the resolver
- **THEN** structural signals (orphan, staleness, clustering) at warning or
  info severity are classified as `autonomous`
- **AND** semantic signals (drift, tension, propagation) use severity-based
  escalation: info → autonomous, warning → gated, critical → escalated

#### Scenario: Signal deduplication

- **WHEN** the loop creates new signals
- **THEN** it checks for existing active signals with the same (source_key,
  target_key, signal_type) and skips duplicates
- **AND** this prevents signal accumulation across iterations

---

### Requirement: Damping

The system SHALL prevent cascading auto-commits through four damping layers
that limit the convergence loop's autonomous behavior.

#### Scenario: Max iteration depth

- **WHEN** the loop reaches the configured maximum iterations (default 5)
- **THEN** it stops with `damping_reason: max_iterations`

#### Scenario: Change budget

- **WHEN** the cumulative semantic distance of auto-committed fixes exceeds
  the configured budget (default 0.50)
- **THEN** subsequent auto-commits are skipped and the loop stops with
  `damping_reason: change_budget_exceeded`

#### Scenario: Anchor drift

- **WHEN** the North Star or strategy formula content drifts beyond the
  configured limit (default 0.10) from its pre-cycle state
- **THEN** the loop stops with `damping_reason: anchor_drift`

#### Scenario: Emergency brake

- **WHEN** the active signal count increases for 2 consecutive iterations
- **THEN** the loop stops with `damping_reason: emergency_brake`

---

### Requirement: Autonomous Commit Path

The system SHALL provide a `CommitAuto` function for the convergence loop to
commit fixes without staging. Autonomous commits are fully auditable and
reversible.

#### Scenario: Auto-commit a fix

- **WHEN** the resolver generates a fix and damping checks pass
- **THEN** the fix is committed with `status='committed'` and
  `source='ripple_auto'` and the originating signal ID in batch_metadata
- **AND** the strategic index is derived and an audit entry is created

#### Scenario: Auto-commit visibility

- **WHEN** a user lists mutations for an instance
- **THEN** auto-committed mutations appear with `source='ripple_auto'` and are
  filterable by this source

#### Scenario: Auto-commit reversibility

- **WHEN** a user calls `restore_version`
- **THEN** auto-committed mutations are reverted along with all other state

---

### Requirement: Pluggable Signal Resolver

The system SHALL accept an optional `SignalResolver` interface that generates
fixes for autonomous-tier signals. When nil (agent-orchestrated mode), the
convergence loop is detection-only.

#### Scenario: LLM-backed resolver

- **WHEN** `LLM_PROVIDER_URL` is configured
- **THEN** the server creates an LLM-backed resolver that calls an
  OpenAI-compatible chat completions API to generate alignment fixes
- **AND** the resolver receives both the signal context and the upstream
  artifact's content so it can align the target with the source of truth
- **AND** the system prompt instructs minimal, conservative changes that
  preserve strategic direction

#### Scenario: No resolver configured

- **WHEN** `LLM_PROVIDER_URL` is not set
- **THEN** the convergence loop runs in detection-only mode and the
  `convergence_summary` reports signals for the agent to handle

---

### Requirement: Equilibrium-Triggered Versioning

The system SHALL auto-publish a version snapshot when the convergence loop
reaches equilibrium and at least one meaningful change occurred during the
cycle.

#### Scenario: Auto-publish on equilibrium

- **WHEN** equilibrium is reached AND (auto-commits were made OR the starting
  score was below threshold and the commit brought it above)
- **THEN** a version is published with `source='convergence'`, the equilibrium
  score, and the convergence summary in metadata

#### Scenario: No auto-publish on damping

- **WHEN** the convergence loop stops due to damping
- **THEN** no version is auto-published

#### Scenario: Version metadata enrichment

- **WHEN** `list_versions` or `get_version` is called
- **THEN** convergence-published versions include `source`, `equilibrium_score`,
  and `convergence_meta` fields distinguishing them from manual versions

---

### Requirement: Configuration

The system SHALL expose per-instance ripple configuration including authority
thresholds, equilibrium threshold, damping parameters, and natural tension
baselines.

#### Scenario: Default configuration

- **WHEN** no custom config exists for an instance
- **THEN** conservative defaults are used: equilibrium threshold 0.70,
  max iterations 5, change budget 0.50, anchor drift limit 0.10

#### Scenario: Per-artifact-type thresholds

- **WHEN** authority is classified for a North Star or strategy formula change
- **THEN** tighter thresholds are applied (autonomous > 0.92 vs default > 0.85)

#### Scenario: Natural tension baselines

- **WHEN** cross-track tension is measured
- **THEN** expected divergence per track pair is subtracted
  (e.g., product-commercial baseline 0.25, product-strategy baseline 0.15)
- **AND** baselines are configurable per instance

---

### Requirement: Signal Lifecycle

The system SHALL manage ripple signal lifecycle through four states with
corresponding MCP tools.

#### Scenario: List active signals

- **WHEN** `list_signals` is called
- **THEN** active signals are returned sorted by severity (critical first),
  filterable by type, severity, status, and target artifact

#### Scenario: Acknowledge signal

- **WHEN** `acknowledge_signal` is called
- **THEN** the signal status changes to `acknowledged` (seen but not fixing now)

#### Scenario: Resolve signal

- **WHEN** `resolve_signal` is called with an optional batch ID
- **THEN** the signal status changes to `resolved` and is linked to the
  resolving batch

#### Scenario: Dismiss signal

- **WHEN** `dismiss_signal` is called with a reason
- **THEN** the signal status changes to `dismissed` with the reason in metadata
- **AND** dismissed signals are excluded from equilibrium scoring

#### Scenario: Auto-resolve on update

- **WHEN** an artifact is updated via `commit_batch`
- **THEN** all active signals targeting that artifact are auto-resolved

---

### Requirement: MCP Tool Inventory

The system SHALL expose the following MCP tools for ripple coherence operations.

| Tool | Type | Description |
|------|------|-------------|
| `propose_change` | read | Preview blast radius before committing |
| `coherence_check` | read | Full-graph coherence analysis |
| `list_signals` | read | Active ripple signals with filters |
| `acknowledge_signal` | write | Mark signal as seen |
| `resolve_signal` | write | Mark signal as addressed |
| `dismiss_signal` | write | Mark signal as intentional |
| `generate_ripple_batch` | read | Context for AI-assisted resolution |
| `get_equilibrium_status` | read | Current coherence score and breakdown |
| `get_convergence_history` | read | Past convergence runs and outcomes |
| `get_ripple_config` | read | Current thresholds and baselines |
| `update_ripple_config` | write | Adjust thresholds and baselines |

#### Scenario: Health check integration

- **WHEN** `health_check` is called
- **THEN** the response includes a `ripple_signals` section with active signal
  counts by severity and top 3 critical signals, and an `equilibrium` section
  with the current score, threshold, and equilibrium status
