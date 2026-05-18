# The Ripple Coherence Engine: LLM-Driven Consistency Maintenance for Strategy Graphs

**Draft — May 2026**

---

## Abstract

We present the Ripple Coherence Engine, a system for detecting and resolving
misalignments in interconnected strategy artifacts modeled as a semantic graph.
Strategy management tools increasingly represent organizational strategy as a
network of interdependent artifacts — vision statements, strategic formulas,
feature definitions, value models, and roadmaps — connected by typed
relationships (contributes_to, depends_on, tests_assumption). Changes to any
artifact can silently invalidate assumptions held by connected artifacts,
creating strategic drift that is difficult to detect manually.

The Ripple Coherence Engine addresses this through a novel synthesis of
Truth Maintenance Systems, Change Impact Analysis, constraint propagation, and
feedback control theory, with one key departure: it uses a Large Language Model
(LLM) as the resolution operator. Where traditional systems rely on
deterministic constraint solvers, our engine reasons about strategic alignment
in natural language — the native representation of strategy artifacts. This
introduces fundamental non-determinism into the convergence loop, which we
address through a four-layer damping architecture that bounds autonomous
behavior while preserving the LLM's ability to reason about meaning.

We evaluate the engine against a production strategy instance containing 174
artifacts and 361 relationships. The engine detects 21 misalignment signals
(14 structural, 7 semantic), auto-resolves 7 low-risk orphan signals, and
reaches equilibrium (score 0.82, threshold 0.70) in a single convergence
iteration. Cross-track tension detection correctly identifies 6 inter-track
divergences while accounting for natural baseline tensions between
organizational tracks.

---

## 1. Introduction

### 1.1 The Problem: Strategic Drift in Connected Artifacts

Modern product strategy is not a single document but a network of
interdependent artifacts. A typical strategy instance in the Emergent Product
Framework (EPF) contains:

- A **North Star** vision that anchors all downstream decisions
- **Strategy foundations** defining target personas, competitive positioning,
  and ideal customer profiles
- A **strategy formula** expressing strategic bets and objectives
- **Value models** decomposing value delivery across product, commercial,
  organizational, and strategy tracks
- **Feature definitions** specifying what will be built, each linked to value
  model paths via `contributes_to` relationships
- A **roadmap recipe** phasing feature delivery
- **Assumptions** that features explicitly test via `tests_assumption` edges

These artifacts are connected by typed relationships that encode strategic
intent: a feature *contributes to* a value path, *depends on* another feature,
and *tests* a strategic assumption. The graph structure ensures that every
implementation decision is traceable to strategic objectives.

The problem is **coherence maintenance**. When a team revises the North Star
(e.g., shifting from "enterprise-first" to "product-led growth"), the change
should propagate: the strategy formula needs updating, value models may need
rebalancing, features may lose their strategic justification, and roadmap
priorities may shift. In practice, teams make upstream changes and forget —
or don't realize — that downstream artifacts are now misaligned. This
*strategic drift* accumulates silently until the gap between stated strategy
and actual execution becomes too large to ignore.

Manual coherence checking doesn't scale. A strategy instance with 100+
features, 4 value model tracks, and hundreds of relationships has a
combinatorial number of potential misalignments. Some misalignments are
structural (a value path has no contributing features), but the most
important ones are *semantic* (a feature's description no longer aligns with
the value path it claims to contribute to).

### 1.2 Contribution

We introduce the Ripple Coherence Engine, a system that:

1. **Detects misalignments** through both structural graph analysis and
   semantic embedding comparison, classifying them into a six-type signal
   taxonomy
2. **Classifies changes** by semantic magnitude using embedding similarity
   scores, assigning authority tiers that determine whether resolution can
   be autonomous, requires approval, or requires escalation
3. **Converges toward equilibrium** through an iterative feedback loop that
   detects, classifies, and optionally resolves signals — bounded by a
   four-layer damping architecture
4. **Uses an LLM as the resolution operator** — operating directly on
   natural-language strategy content rather than formal constraints

The key novelty is the combination of formal consistency maintenance
infrastructure (TMS-style justification tracking, control-theoretic damping)
with a non-deterministic natural-language reasoner. This synthesis is
necessary because strategy artifacts are inherently linguistic: their
alignment cannot be verified by type checking or constraint satisfaction
alone.

### 1.3 Paper Organization

Section 2 surveys related work across six relevant fields. Section 3 presents
the system architecture. Section 4 details the detection subsystem. Section 5
describes the convergence loop and damping architecture. Section 6 covers
authority classification and the LLM resolver. Section 7 presents evaluation
results. Section 8 discusses limitations and future work.

---

## 2. Related Work

The Ripple Coherence Engine draws from and extends several established fields.

### 2.1 Truth Maintenance Systems

Doyle's justification-based TMS (JTMS) [1] and de Kleer's assumption-based
TMS (ATMS) [2] maintain a set of beliefs and their justifications. When a
justification is invalidated, dependent beliefs are retracted or flagged for
review. The strategy graph maps directly to this formalism: artifacts are
beliefs, relationships are justifications, and ripple signals are nogoods.

Our engine differs from classical TMS in two important ways. First, beliefs
(artifacts) are natural-language documents, not propositional symbols —
inconsistency detection requires semantic analysis rather than logical
contradiction checking. Second, belief revision is performed by an LLM rather
than a deterministic retraction algorithm, introducing non-determinism that
requires engineering safeguards.

We adopt the JTMS approach of dependency-directed analysis: when a signal is
detected, the engine traces the justification chain to identify affected
artifacts. We do not currently implement the ATMS's multiple-context mechanism,
though our scenario engine (which duplicates subgraphs for what-if analysis)
would benefit from it. This is discussed in Section 8.

### 2.2 Change Impact Analysis

The term "ripple effect" in software engineering was introduced by Haney [3]
to describe how modifications to one program component cascade through
dependent components. Bohner and Arnold's framework [4] distinguishes the
*Estimated Impact Set* (EIS) — all potentially affected components identified
by structural analysis — from the *Actual Impact Set* (AIS) — components that
truly require modification.

Our engine implements this two-phase approach. The `propose_change` tool
computes the EIS via relationship graph traversal (structural reachability).
The convergence loop's semantic analysis then narrows to the AIS by comparing
embedding similarity between connected artifacts, filtering out structurally
reachable artifacts that are semantically aligned.

Recent work on semantic change impact analysis [5] uses code embeddings to
improve impact prediction in software systems. Our approach extends this to
strategy artifacts, using document embeddings to measure alignment rather than
code similarity.

### 2.3 Constraint Propagation

Arc consistency algorithms (AC-3 [6], AC-4) propagate constraints through a
network: when a variable's domain is reduced, connected constraints are
rechecked, potentially reducing other domains. The process repeats until a
fixpoint (no further reductions) or failure (a domain becomes empty).

Our convergence loop is structurally analogous: detect constraint violations
(misaligned artifacts), resolve them (reduce the "misalignment domain"),
recheck connected artifacts, repeat until equilibrium (fixpoint) or damping
(controlled failure). The key difference is that our resolution operator (the
LLM) is non-monotonic — resolving one violation may introduce new ones,
violating the monotonicity property that guarantees CP termination. Our
four-layer damping addresses this gap (Section 5.2).

### 2.4 Belief Propagation and Message Passing

Pearl's belief propagation algorithm [7] achieves global consistency in
graphical models through local message passing. In tree-structured graphs,
BP converges in polynomial time. In loopy graphs, convergence is not
guaranteed, and damped updates (blending old and new beliefs) are used to
improve stability [8].

The analogy to our system is suggestive but imperfect. Our "messages" (ripple
signals) are discrete events rather than continuous probability distributions.
However, the convergence challenges are similar: in cyclic strategy graphs
(where A contributes_to B, B enables C, C depends_on A), resolving one signal
may create another, analogous to loopy BP oscillation. Our emergency brake
(Section 5.2.4) handles this case.

Residual belief propagation [9], which prioritizes messages by expected
information gain, suggests a signal ordering strategy: resolve highest-severity
signals first within each iteration, as they carry the most "information" about
the graph's misalignment state.

### 2.5 Feedback Control Systems

The convergence loop maps naturally to a discrete-time feedback controller
[10]:

| Control concept | Engine equivalent |
|-----------------|-------------------|
| Plant | Strategy graph state |
| Sensor | Structural + semantic analysis |
| Controller | Authority classification + resolver |
| Actuator | CommitAuto |
| Setpoint | Equilibrium threshold (0.70) |
| Error signal | 1.0 − equilibrium score |

The change budget acts as integral windup prevention (bounding cumulative
correction), the emergency brake acts as a rate limiter (halting on positive
feedback), and the anchor drift limit acts as plant saturation protection
(preventing foundational artifacts from shifting).

This framing suggests that formal stability analysis techniques (Bode plots,
Nyquist criteria) could be adapted to analyze the convergence loop's behavior
under different resolver configurations, though the non-linearity of LLM-based
resolution makes this non-trivial.

### 2.6 Incremental Maintenance and Reactive Dataflow

Materialized view maintenance in databases [11] addresses the problem of
efficiently updating derived data when base data changes. Our equilibrium
score and signal set are materialized views over the artifact state.

Reactive programming systems [12] propagate changes through dependency
graphs using topological ordering to avoid redundant recomputation. Our
convergence loop does not currently impose topological ordering on signal
resolution, which means resolving a downstream signal before its upstream
dependency can produce unnecessary work. This is discussed in Section 8.

---

## 3. System Architecture

### 3.1 Overview

The Ripple Coherence Engine is embedded in the strategy server's commit path
as a post-commit feedback loop. Every `commit_batch` operation triggers the
engine, which proceeds through four phases:

```
commit_batch
  |
  v
Phase 1: Post-commit analysis
  - Auto-resolve signals for updated targets
  - Structural ripple analysis per changed artifact
  - Semantic change classification (if Memory available)
  |
  v
Phase 2: Convergence loop (iterative)
  - SENSE: structural coherence + semantic analysis
  - CLASSIFY: authority tiers per signal
  - DEDUPLICATE: skip existing active signals
  - RESOLVE: (if server-orchestrated) fix autonomous signals
  - DAMP: check 4 safety layers
  |
  v
Phase 3: Equilibrium evaluation
  - Compute weighted coherence score
  - Publish version snapshot if equilibrium reached
  |
  v
Phase 4: Reporting
  - Return convergence summary to caller
```

### 3.2 Dual-Mode Operation

The engine supports two operational modes, determined by whether a
`SignalResolver` implementation is injected at startup:

**Agent-orchestrated mode** (resolver = nil): The convergence loop performs
detection, classification, and scoring only. It returns a `convergence_summary`
to the calling AI agent, which reads the signals and drives resolution through
subsequent MCP tool calls. The loop runs for a single iteration (no resolution
step, no re-sensing needed).

**Server-orchestrated mode** (resolver = LLMResolver): The convergence loop
includes a resolution step that calls the LLM for each autonomous-tier signal.
Fixes are applied via `CommitAuto`, the engine re-senses the graph state, and
the loop continues until equilibrium or damping. This mode enables fully
autonomous coherence maintenance for low-risk changes.

Both modes use identical detection, classification, equilibrium scoring, and
damping logic. Only the resolution step differs.

### 3.3 Signal Type Taxonomy

Signals are classified into six types across two categories:

**Structural signals** (derived from graph topology):

| Type | Trigger | Severity mapping |
|------|---------|------------------|
| `propagation` | Downstream artifact not updated after upstream change | Days stale: >30 = critical, >7 = warning, else info |
| `orphan` | Value model path with no `contributes_to` edges | Always warning |
| `staleness` | Assumption with no `tests_assumption` edges | Always warning |

**Semantic signals** (derived from embedding analysis):

| Type | Trigger | Severity mapping |
|------|---------|------------------|
| `drift` | Artifact content diverged from declared relationships | Score delta: >0.20 = critical, >0.10 = warning |
| `tension` | Cross-track embedding divergence exceeds natural baseline | Excess: >0.15 = critical, >0.05 = warning |
| `clustering` | High similarity (>0.75) between unconnected artifacts | Always info |

### 3.4 Equilibrium Model

The coherence score is computed as:

```
score = max(0, 1.0 - sum(penalty(s) for s in active_signals))
```

Penalty weights are asymmetric, deliberately weighting semantic signals higher
than structural signals:

| Severity | Semantic signal penalty | Structural signal penalty |
|----------|------------------------|--------------------------|
| critical | 0.15 | 0.05 |
| warning  | 0.04 | 0.02 |
| info     | 0.00 | 0.00 |

This asymmetry reflects a design judgment: structural gaps (orphaned value
paths, untested assumptions) are normal work-in-progress states, while
semantic misalignment (a feature that drifts from its value path) indicates
active incoherence requiring attention.

Adjustments:
- Tension signals within their natural baseline (e.g., product-commercial
  divergence < 0.25) contribute zero penalty
- Dismissed signals are excluded entirely

An instance is "in equilibrium" when the score meets or exceeds the configured
threshold (default 0.70). This threshold is deliberately set below 1.0 to
accommodate normal WIP states — a score of 1.0 is not expected or required.

---

## 4. Detection Subsystem

### 4.1 Structural Analysis

Structural analysis operates on the relationship graph without requiring
embedding infrastructure. It detects three signal types:

**Propagation detection** (`AnalyzeStructuralRipple`): Given a changed
artifact, the engine walks three directions through the relationship graph:
- *Downstream:* artifacts where `target_key = changed_key` (artifacts that
  reference the changed artifact)
- *Upstream:* artifacts where `source_key = changed_key` (artifacts the
  changed artifact references)
- *Transitive:* artifacts that co-reference the same intermediate nodes
  (e.g., two features that both contribute to the same value path)

For each reachable artifact, staleness is computed as the duration since the
artifact was last updated relative to the triggering change.

**Orphan detection:** Scans all value model paths and checks for at least one
`contributes_to` edge from a feature. Paths with no contributing features
generate `orphan` signals.

**Assumption gap detection:** Scans all declared assumptions and checks for
at least one `tests_assumption` edge from a feature. Untested assumptions
generate `staleness` signals.

### 4.2 Semantic Analysis

Semantic analysis requires artifact embeddings in a vector database (Memory).
It detects three signal types through four analysis passes:

**Pass 1: Drift detection.** For each feature with `contributes_to`
relationships, the engine searches Memory using the feature's content as a
query. If the declared value path does not appear in top results, or if an
undeclared path scores 20%+ higher, a `drift` signal is emitted. This detects
features whose content has evolved away from their declared strategic alignment.

**Pass 2: Clustering detection.** The engine identifies pairs of artifacts
with embedding similarity > 0.75 that lack structural relationships. These
represent potential missing connections — artifacts that are semantically
related but not formally linked in the strategy graph.

**Pass 3: Cross-track tension detection.** The engine measures semantic
divergence between organizational tracks (Product, Commercial, Strategy,
Org Ops). For each track pair, it builds representative queries from one
track's artifacts and searches Memory filtered to the other track's artifact
types. The raw divergence score is adjusted by a natural tension baseline —
expected divergence that reflects healthy specialization rather than
misalignment. Only excess divergence above the baseline generates signals.

**Pass 4: Vertical alignment detection.** The engine checks that downstream
artifacts appear in the semantic neighborhood of their upstream anchors
through the EPF layer hierarchy: North Star -> Strategy Formula -> Roadmap
Recipe -> Features. For each layer pair, the engine searches Memory using
upstream content and checks whether downstream artifacts appear in results
with adequate similarity scores.

### 4.3 Graceful Degradation

When Memory is unavailable, the engine operates in structural-only mode:
semantic signals are not generated, structural signals are produced normally,
and responses include a note that semantic analysis is unavailable. This
ensures the engine provides value even without embedding infrastructure.

---

## 5. Convergence Loop

### 5.1 Algorithm

The convergence loop runs after every `commit_batch`. In pseudocode:

```
function RunConvergenceLoop(instance, resolver):
    snapshot_anchors()  // capture North Star, formula text
    starting_score = compute_equilibrium()
    cumulative_distance = 0.0
    prev_signal_counts = []

    for iteration in 1..max_iterations:
        // SENSE
        structural_signals = analyze_coherence(instance)
        semantic_signals = full_semantic_analysis(instance)  // if Memory available
        all_signals = structural_signals + semantic_signals

        // CLASSIFY
        for signal in all_signals:
            signal.authority = classify_authority(signal)

        // DEDUPLICATE + PERSIST
        new_signals = deduplicate(all_signals, existing_active_signals)
        persist(new_signals)

        // RESOLVE (server-orchestrated only)
        if resolver != nil:
            for signal in new_signals where signal.authority == "autonomous":
                result = resolver.resolve(signal)
                if cumulative_distance + result.distance > change_budget:
                    break  // budget exceeded
                commit_auto(result.payload)
                cumulative_distance += result.distance
                resolve_signal(signal)

        // DAMPING CHECKS
        if emergency_brake(prev_signal_counts):
            return summary(damping_reason="emergency_brake")
        if anchor_drift_exceeded(snapshot):
            return summary(damping_reason="anchor_drift")
        score = compute_equilibrium()
        if score >= threshold:
            maybe_publish_version()
            return summary(equilibrium_reached=true)
        if cumulative_distance >= change_budget:
            return summary(damping_reason="change_budget_exceeded")

        prev_signal_counts.append(count_active_signals())

    return summary(damping_reason="max_iterations")
```

### 5.2 Four-Layer Damping Architecture

The LLM resolver is a non-deterministic operator: given the same signal, it
may produce different fixes on different calls. A fix may resolve one
misalignment while introducing another. Without safeguards, this could lead
to infinite loops, cascading drift, or oscillation.

We address this with four independent damping layers, each protecting against
a different failure mode:

#### 5.2.1 Layer 1: Maximum Iteration Depth (default: 5)

A hard cap on loop iterations. Prevents infinite loops from circular
dependencies in the relationship graph. This is the bluntest safeguard and
the last line of defense.

**Analogy:** Bounded model checking — limit the search depth to ensure
termination regardless of graph structure.

#### 5.2.2 Layer 2: Change Budget (default: 0.50 cumulative semantic distance)

Each auto-committed fix has a self-assessed semantic distance (0.0 = no change,
1.0 = complete rewrite). The engine tracks cumulative distance across a
convergence cycle and halts when the budget is exceeded.

**Analogy:** Integral windup prevention in PID controllers — bounding the
cumulative correction prevents the system from over-correcting through many
small changes that individually seem reasonable but collectively transform
the strategic content.

#### 5.2.3 Layer 3: Anchor Drift Limit (default: 0.10 word-overlap drop)

Foundational artifacts (North Star, strategy formula) must not drift from
their pre-cycle state. Before the loop begins, the engine snapshots the text
of these anchors. If any anchor's word-overlap ratio with its snapshot drops
below the limit, the loop halts.

**Analogy:** Plant saturation protection — preventing the controlled system
(strategy graph) from being driven outside its valid operating range by
protecting the invariants that all other artifacts depend on.

This check uses word-overlap ratio (Jaccard similarity on word sets) rather
than embedding similarity, making it independent of Memory availability. This
is deliberate: anchor drift detection must work even when the semantic
infrastructure is down.

#### 5.2.4 Layer 4: Emergency Brake (2 consecutive signal count increases)

If the number of active signals increases for two consecutive iterations, the
loop halts. This detects positive feedback loops where fixing one signal
creates more signals than it resolves — the non-monotonic behavior that
distinguishes LLM-based resolution from deterministic constraint propagation.

**Analogy:** Loopy belief propagation divergence detection — in cyclic
graphical models, BP can oscillate rather than converge. The standard
mitigation is to detect oscillation and halt.

### 5.3 Signal Deduplication

Signals are deduplicated by the tuple (source_key, target_key, signal_type).
This provides idempotency: running the same analysis twice produces the same
signals without accumulation. Deduplication occurs both in-memory within a
single convergence run and against the database for existing active/
acknowledged signals.

This is analogous to the idempotency requirement in CRDTs [13] — applying the
same operation multiple times has the same effect as applying it once.

---

## 6. Authority Classification and Resolution

### 6.1 Three-Tier Authority Model

Every change and signal is classified into one of three authority tiers:

| Tier | Meaning | Resolution path |
|------|---------|-----------------|
| `autonomous` | Trivial/minor change | Auto-resolvable, no human approval |
| `gated` | Significant change | Requires human `commit_batch` approval |
| `escalated` | Major change | Requires human review with blast radius |

### 6.2 Semantic Classification

When Memory is available, changes are classified by embedding similarity
between old and new content. The engine searches Memory using the new content
and checks the similarity score of the artifact's existing (old) indexed entry.

Per-artifact-type thresholds control the tier boundaries:

| Artifact type | Autonomous above | Gated above |
|---------------|------------------|-------------|
| `north_star` | 0.92 | 0.80 |
| `strategy_formula` | 0.92 | 0.80 |
| `strategy_foundations` | 0.90 | 0.78 |
| `feature` | 0.80 | 0.65 |
| Default | 0.85 | 0.70 |

Foundational artifacts have tighter thresholds, reflecting their higher
impact on downstream coherence.

### 6.3 Structural Fallback

Without Memory, classification falls back to structural heuristics:
- Foundational artifacts: always `escalated`
- 4+ downstream relationships: `escalated`
- Everything else: `gated` (never `autonomous` without semantic verification)

This is deliberately conservative: without semantic evidence that a change is
minor, the engine does not grant autonomous authority.

### 6.4 LLM Resolver

The LLM-backed resolver generates alignment fixes for autonomous-tier signals.
Key design properties:

**Conservatism:** The system prompt instructs minimal, conservative changes
that preserve strategic direction. The resolver is told to never add new
capabilities, personas, or strategic directions — only to tighten alignment
between the target artifact and its upstream source of truth.

**Self-assessment:** The resolver self-assesses the semantic distance of its
proposed fix (0.0-1.0). This feeds into the change budget (Section 5.2.2).
Guidelines: 0.02 for typo-level fixes, 0.05-0.10 for wording adjustments,
above 0.15 indicates too much change.

**Reproducibility:** Temperature is set to 0.3 for consistent, non-creative
fixes. The system prompt + user prompt together provide full context: the
signal description, the target artifact's payload, and the upstream artifact's
content.

**Provider compatibility:** Any OpenAI-compatible chat completions API:
OpenAI, Ollama (local), Anthropic via proxy.

---

## 7. Evaluation

### 7.1 Production Instance

We evaluate against the Emergent company's EPF strategy instance, containing
174 artifacts and 361 relationships across 4 organizational tracks (Product,
Commercial, Strategy, Org Ops).

### 7.2 Results

| Metric | Value |
|--------|-------|
| Structural signals detected | 14 |
| Semantic signals detected | 7 |
| Initial equilibrium score | 0.68 |
| Equilibrium threshold | 0.70 |
| Auto-resolved (autonomous) | 7 (orphaned value models) |
| Escalated to human | 6 (cross-track tensions) |
| Correctly skipped | 7 (untested assumptions — target is text, not artifact) |
| Final equilibrium score | 0.82 |
| Convergence iterations | 1 |

### 7.3 Cross-Track Tension Analysis

The tension detector measures inter-track divergence and applies natural
baseline adjustments:

| Track pair | Raw similarity | Baseline | Excess | Signal? |
|-----------|---------------|----------|--------|---------|
| commercial <-> org_ops | 0.19 | 0.25 | 0.00 | No (within baseline) |
| commercial <-> product | 0.18 | 0.25 | 0.00 | No |
| commercial <-> strategy | 0.26 | 0.20 | 0.06 | Yes (warning) |
| org_ops <-> product | 0.17 | 0.20 | 0.00 | No |
| org_ops <-> strategy | 0.31 | 0.15 | 0.16 | Yes (critical) |
| product <-> strategy | 0.16 | 0.15 | 0.01 | Yes (info) |

The natural tension baselines correctly suppress false positives for track
pairs with expected specialization divergence (commercial vs. product,
commercial vs. org_ops) while flagging genuine strategic misalignment
(org_ops vs. strategy).

### 7.4 Observations

1. **Single-iteration convergence:** The engine reached equilibrium in one
   iteration, suggesting that the production instance's misalignments were
   independent (no cascading effects from resolution). Multi-iteration
   convergence is expected for instances with denser dependency graphs.

2. **Correct skip behavior:** The engine correctly did not generate signals
   for untested assumptions where the target was a text string rather than a
   graph artifact, demonstrating appropriate structural boundary checking.

3. **Asymmetric penalty effectiveness:** The semantic-vs-structural penalty
   asymmetry worked as designed — 7 orphaned value models (structural, each
   0.02 penalty = 0.14 total) had less impact on equilibrium than 6 tension
   signals (semantic, mixed severity = ~0.50 total), correctly prioritizing
   semantic misalignment.

---

## 8. Discussion and Future Work

### 8.1 Convergence Guarantees

The fundamental theoretical tension in the system is that LLM-based resolution
is non-deterministic and non-monotonic, while convergence guarantees in
constraint propagation and belief propagation require determinism or
monotonicity (or both). Our four-layer damping is a pragmatic engineering
response that bounds behavior without guaranteeing convergence.

A more principled approach would be to formally model the resolver's effect on
equilibrium as a transfer function and apply stability analysis from control
theory. The non-linearity of LLM output makes this challenging, but
linearization around the operating point (equilibrium threshold) may yield
useful approximations.

### 8.2 Topological Signal Ordering

The convergence loop currently processes signals without regard to their
position in the dependency graph. Adopting topological ordering — resolving
upstream signals before downstream ones — would reduce unnecessary iterations,
following the "glitch-free" propagation approach from reactive programming
[12]. This is a straightforward engineering improvement.

### 8.3 ATMS for Efficient Scenarios

The current scenario engine duplicates subgraphs for what-if exploration. An
Assumption-based TMS [2] natively supports multiple assumption sets (contexts),
computing which beliefs hold under each without graph duplication. Integrating
ATMS techniques could make scenarios significantly more efficient, particularly
for instances with many shared intermediate artifacts.

### 8.4 Edge-Weighted Impact Analysis

CIA literature [4, 5] shows that weighted dependency graphs improve impact
prediction accuracy. Our relationship edges are currently unweighted. Adding
coupling scores — derived from embedding similarity, co-change frequency
(from `convergence_runs` history), or explicit annotation — would improve
signal prioritization and reduce false positives in the estimated impact set.

### 8.5 Monotonic Resolution Strategies

If the resolver could be constrained to produce monotonically improving
fixes (each fix strictly increases equilibrium score), the convergence loop
would have formal termination guarantees without needing the emergency brake.
This could be achieved through a post-resolution verification step: compute
equilibrium *before* committing the fix and reject fixes that don't improve
the score. The cost is additional computation per resolution step.

### 8.6 Incremental Detection

Currently, `coherence_check` scans the entire graph. For large instances,
incremental detection — maintaining contribution counts for orphan detection,
causal dependency tracking for staleness — would reduce per-iteration cost
from O(|V| + |E|) to O(delta), following IVM techniques [11].

### 8.7 Natural Tension Baseline Learning

Natural tension baselines are currently configured manually per track pair.
These could be learned from historical equilibrium data: track pairs that
consistently show divergence without generating human-escalated signals
have higher natural baselines. This is analogous to anomaly detection
threshold learning in monitoring systems.

---

## 9. Conclusion

The Ripple Coherence Engine demonstrates that formal consistency maintenance
techniques — originally developed for propositional logic (TMS), constraint
networks (CP), and probabilistic models (BP) — can be adapted to maintain
coherence in natural-language artifact graphs when combined with LLM-based
resolution. The key insight is that strategy artifacts exist in a space where
formal methods identify *what* is misaligned (through graph structure and
embedding similarity), but only a language model can determine *how* to
realign them (through natural language reasoning about strategic intent).

The four-layer damping architecture provides the engineering foundation that
makes this combination practical: it bounds the non-deterministic resolver's
behavior while preserving its ability to reason about meaning. The result is
a system that detects misalignments no human team could track manually,
resolves low-risk misalignments autonomously, and escalates high-risk changes
with full blast radius context.

---

## References

[1] J. Doyle, "A Truth Maintenance System," *Artificial Intelligence*,
vol. 12, no. 3, pp. 231-272, 1979.

[2] J. de Kleer, "An Assumption-based TMS," *Artificial Intelligence*,
vol. 28, no. 2, pp. 127-162, 1986.

[3] F. M. Haney, "Module Connection Analysis — A Tool for Scheduling
Software Debugging Activities," in *Proc. AFIPS Fall Joint Computer
Conference*, 1972, pp. 173-179.

[4] S. A. Bohner and R. S. Arnold, *Software Change Impact Analysis*,
IEEE Computer Society Press, 1996.

[5] M. Dit, M. Wagner, S. Wen, W. Wang, M. Linares-Vasquez, D. Poshyvanyk,
and H. Kagdi, "ImpactMiner: A Tool for Change Impact Analysis," in
*Companion Proc. ICSE*, 2014, pp. 540-543.

[6] A. K. Mackworth, "Consistency in Networks of Relations," *Artificial
Intelligence*, vol. 8, no. 1, pp. 99-118, 1977.

[7] J. Pearl, *Probabilistic Reasoning in Intelligent Systems: Networks
of Plausible Inference*, Morgan Kaufmann, 1988.

[8] K. P. Murphy, Y. Weiss, and M. I. Jordan, "Loopy Belief Propagation
for Approximate Inference: An Empirical Study," in *Proc. UAI*, 1999,
pp. 467-475.

[9] G. Elidan, I. McGraw, and D. Koller, "Residual Belief Propagation:
Informed Scheduling for Asynchronous Message Passing," in *Proc. UAI*,
2006, pp. 165-173.

[10] K. J. Astrom and R. M. Murray, *Feedback Systems: An Introduction
for Scientists and Engineers*, Princeton University Press, 2008.

[11] A. Gupta and I. S. Mumick, "Maintenance of Materialized Views:
Problems, Techniques, and Applications," *IEEE Data Engineering Bulletin*,
vol. 18, no. 2, pp. 3-18, 1995.

[12] E. Bainomugisha, A. L. Carreton, T. van Cutsem, S. Mostinckx, and
W. de Meuter, "A Survey on Reactive Programming," *ACM Computing Surveys*,
vol. 45, no. 4, article 52, 2013.

[13] M. Shapiro, N. Preguica, C. Baquero, and M. Zawirski, "Conflict-Free
Replicated Data Types," in *Proc. SSS*, 2011, pp. 386-400.
