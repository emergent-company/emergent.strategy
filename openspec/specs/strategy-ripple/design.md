## Architecture

The Ripple Coherence Engine is a feedback control system embedded in the
strategy server's commit path. It operates as a post-commit hook: every
`commit_batch` triggers detection, classification, and optionally resolution.

```
commit_batch
  ├─ postCommitRippleAnalysis (structural signals, semantic classification)
  └─ RunConvergenceLoop
       ├─ ComputeEquilibrium (starting score)
       ├─ for iteration < maxIterations:
       │    ├─ AnalyzeCoherence (structural: orphans, staleness, assumptions)
       │    ├─ FullSemanticAnalysis (drift, clustering, tension, vertical)
       │    ├─ Tag signals with authority tiers
       │    ├─ Deduplicate against existing active signals
       │    ├─ [If Resolver] Resolve autonomous signals → CommitAuto → re-sense
       │    ├─ Emergency brake check
       │    ├─ Anchor drift check
       │    ├─ Equilibrium check → break if reached
       │    └─ Change budget check
       ├─ If equilibrium reached → auto-publish version
       └─ Save ConvergenceRun record
```

### Package layout

```
domain/ripple/
├── service.go        — Signal CRUD, config CRUD, convergence history
├── propagation.go    — Structural ripple: downstream/upstream/transitive walk
├── semantic.go       — Drift, clustering, full semantic analysis
├── tension.go        — Cross-track tension via Memory search
├── vertical.go       — Vertical alignment: North Star → formula → roadmap → features
├── convergence.go    — Convergence loop with damping
├── equilibrium.go    — Weighted coherence scoring
├── authority.go      — Authority tier classification
├── config.go         — RippleConfig, defaults, threshold lookup
├── resolver.go       — SignalResolver interface, ResolveResult
└── llm_resolver.go   — LLM-backed resolver implementation

internal/llm/
└── client.go         — OpenAI-compatible chat completions client
```

### Dual-mode operation

The engine supports two operational modes determined by whether a
`SignalResolver` is injected:

**Agent-orchestrated (MCP client drives):**
```
Human → commit_batch → convergence (detect + classify + score)
  → agent reads convergence_summary
  → agent generates fix (using its own LLM)
  → agent calls commit_batch with fix
  → convergence runs again → equilibrium?
```

**Server-orchestrated (LLM provider configured):**
```
Human → commit_batch → convergence (detect + classify + resolve)
  → resolver generates fix → CommitAuto → re-sense
  → loop until equilibrium or damping
  → auto-publish version
```

Both modes use identical detection, classification, equilibrium scoring, and
damping. Only the resolution step differs.

### Signal type taxonomy

| Type | Source | Authority mapping | What it means |
|------|--------|-------------------|---------------|
| `propagation` | Structural | severity-based | Downstream artifact stale after upstream change |
| `orphan` | Structural | warning/info → autonomous | Value model path with no contributing features |
| `staleness` | Structural | warning/info → autonomous | Assumption with no testing features |
| `drift` | Semantic | severity-based | Artifact content diverged from declared relationships |
| `tension` | Semantic | severity-based | Cross-track embedding divergence exceeding baseline |
| `clustering` | Semantic | autonomous | Similar artifacts lacking structural connection |

### Equilibrium scoring model

```
score = 1.0 - Σ(signal_penalty)

where signal_penalty for each active signal:
  critical semantic (drift, tension, propagation): 0.15
  critical structural (orphan, staleness):         0.05
  warning semantic:                                0.04
  warning structural:                              0.02
  info (any type):                                 0.00

adjustments:
  - tension signals within natural baseline: penalty reversed (net zero)
  - dismissed signals: excluded entirely

equilibrium := score >= threshold (default 0.70)
```

This model ensures:
- A fresh instance with WIP gaps (orphans, untested assumptions) scores ~0.70-0.90
- Semantic misalignment (drift, tension) has higher impact than structural gaps
- Natural inter-track tension doesn't penalize the score
- Dismissed signals don't block equilibrium

### Damping layers

| Layer | Default | What it prevents |
|-------|---------|------------------|
| Max iterations | 5 | Infinite loops from circular dependencies |
| Change budget | 0.50 cumulative distance | Death-by-a-thousand-cuts drift |
| Anchor drift | 0.10 similarity drop | North Star / formula drifting through transitive fixes |
| Emergency brake | 2 consecutive increases | Divergent positive feedback loops |

### Configuration hierarchy

```
Per-instance config (ripple_config table)
  └─ overrides DefaultRippleConfig()
       ├─ authority_thresholds (per artifact type)
       ├─ equilibrium_threshold
       ├─ damping (max_iterations, change_budget, anchor_drift_limit)
       └─ natural_tension_baselines (per track pair)
```

---

## Integration points for future phases

### Phase 3: Web UI

The web UI should consume the ripple engine through existing MCP tools. Key
integration points:

**Strategy canvas view:**
- Call `coherence_check` on page load to populate signal indicators
- Call `get_equilibrium_status` to show the coherence score badge
- Color-code nodes by signal severity (red = critical, yellow = warning)
- Click a signal indicator → navigate to signal detail

**Artifact editor:**
- Call `propose_change` on save/preview to show blast radius in a sidebar panel
- Debounce semantic classification on edit (500ms) to preview the authority tier
  before committing
- Show the `convergence_summary` after commit in a notification toast

**Signal dashboard:**
- Call `list_signals` with filters for the main list
- Implement acknowledge/resolve/dismiss actions via the corresponding MCP tools
- Show `get_convergence_history` for trend analysis
- Show `get_equilibrium_status` as a gauge/chart

**Configuration panel:**
- Call `get_ripple_config` to show current thresholds
- Call `update_ripple_config` to save changes
- Provide presets (product-led growth, enterprise, etc.)

**SSE streaming (future):**
- The convergence loop currently runs synchronously (~1-3s for structural,
  ~40s with Memory semantic analysis)
- For the web UI, consider streaming convergence progress via SSE:
  structural signals → semantic signals → resolver progress → equilibrium
- This requires refactoring `RunConvergenceLoop` to accept a progress callback

### Phase 4: Inline AI

The web UI's AI chat panel can leverage ripple tools directly:

**Proactive suggestions:**
- After `commit_batch`, the AI reads `convergence_summary` and proactively
  offers to fix autonomous-tier signals
- The AI can call `generate_ripple_batch` to get context for all active signals
  and draft fixes in a single conversation turn

**Guided resolution flow:**
- AI reads `list_signals`, groups by priority, and walks the user through
  each signal with context and suggested action
- For autonomous signals: AI generates fix, stages it, user confirms
- For gated/escalated signals: AI explains the blast radius and asks for direction

**Configuration assistance:**
- AI can read equilibrium score trends (`get_convergence_history`) and suggest
  threshold adjustments
- "Your last 5 convergence runs all hit change_budget — consider increasing from
  0.50 to 0.75"

### Server-orchestrated mode (LLM provider)

When `LLM_PROVIDER_URL` is configured:

**Autonomous resolution:**
- The convergence loop calls the `LLMResolver` for each autonomous-tier signal
- The resolver builds a prompt with: signal description, target artifact payload,
  upstream artifact payload (source of truth)
- System prompt enforces conservative fixes: preserve direction, smallest change,
  same JSON structure
- Self-assessed distance (0.0-1.0) feeds into change budget tracking

**Provider compatibility:**
- OpenAI: `LLM_PROVIDER_URL=https://api.openai.com`
- Ollama (local): `LLM_PROVIDER_URL=http://localhost:11434`
- Anthropic via proxy: any OpenAI-compatible proxy
- Temperature: 0.3 (conservative, consistent fixes)

**Safety properties:**
- Server-side LLM calls never touch foundational artifacts (North Star,
  strategy formula) — these are always escalated
- Change budget caps cumulative semantic distance per cycle
- Anchor drift detection stops if foundational content shifts
- All auto-commits are tagged `source='ripple_auto'` and fully reversible

### Memory integration requirements

The semantic analysis layer requires artifacts to be ingested into Memory.
Key requirements for future phases:

- **Ingestion must be synchronous before semantic analysis**: the convergence
  loop assumes Memory has current embeddings. If ingestion is async, the
  semantic analysis may use stale data.
- **Track inference**: the tension detector infers track membership from
  artifact keys, value model paths, and `contributes_to` relationships — not
  from a `track` column (which is rarely populated). Future phases should
  maintain this inference pattern.
- **Type filtering**: Memory search should be filtered by artifact types
  relevant to the check (e.g., tension detection filters by the target track's
  types to avoid results dominated by the source track).

### Database schema

```
ripple_signals        — Signal detection and lifecycle
ripple_config         — Per-instance configuration (JSONB)
convergence_runs      — Convergence loop execution history
strategy_versions     — Extended with source, equilibrium_score, convergence_meta
strategy_mutations    — Extended with source='ripple_auto' for auto-commits
```

---

## Theoretical Foundations

The Ripple Coherence Engine draws from — and synthesizes — several established
fields in computer science. This section maps each component to its theoretical
roots and identifies opportunities from the literature.

### Truth Maintenance Systems (TMS)

**Reference:** Doyle (1979) "A Truth Maintenance System"; de Kleer (1986)
"An Assumption-based TMS"

The ripple engine is, at its core, a domain-specific Truth Maintenance System.
The strategy graph is a belief network: the North Star is an assumption, the
strategy formula is a belief justified by the North Star, features are beliefs
justified by their value model paths. When a justification changes (e.g., the
North Star is revised), downstream beliefs must be revisited.

| TMS concept | Ripple engine equivalent |
|-------------|-------------------------|
| Belief | Strategy artifact (feature, formula, roadmap) |
| Assumption | North Star, strategy foundations, assumptions |
| Justification | `contributes_to`, `depends_on`, `tests_assumption` edges |
| Nogood | Ripple signal (drift, tension, propagation) |
| Dependency-directed backtracking | `AnalyzeStructuralRipple` traversal |

**Opportunities from TMS literature:**
- *Dependency-directed root cause analysis:* JTMS traces contradictions back to
  the minimal set of assumptions that cause them. Our `StructuralRippleReport`
  reports affected artifacts but doesn't formally identify the root cause
  assumption. A TMS-style justification chain would allow the UI to show "this
  drift signal exists because of *this specific* North Star change."
- *ATMS for efficient what-if:* Our scenario engine duplicates parts of the graph
  for what-if exploration. An Assumption-based TMS natively supports multiple
  assumption sets (contexts), computing which beliefs hold under each without
  duplicating the graph. This could make the scenario engine more efficient.

### Change Impact Analysis (CIA)

**Reference:** Bohner & Arnold (1996) *Software Change Impact Analysis*;
Haney (1972) "A Ripple Effect Model of Software Maintenance"

The term "ripple effect" itself originates from Haney's 1972 paper on software
maintenance. CIA studies how changes to one component affect others through
dependency chains.

| CIA concept | Ripple engine equivalent |
|-------------|-------------------------|
| Estimated Impact Set (EIS) | `propose_change` blast radius |
| Actual Impact Set (AIS) | Signals after semantic classification |
| Dependency graph | Strategy relationship graph |
| Change propagation rule | Signal type taxonomy |

Our `propose_change` tool computes the EIS (structural reachability). The
convergence loop's semantic analysis narrows this to the AIS — artifacts that
are *actually* misaligned, not merely reachable. This two-phase approach (fast
structural over-approximation + expensive semantic precision) aligns with best
practices in CIA literature.

**Opportunities from CIA literature:**
- *Edge-weighted coupling:* CIA research shows that weighted dependency graphs
  (where edge weights represent coupling strength) improve impact prediction
  accuracy. Our relationship edges are currently unweighted. Adding coupling
  scores derived from semantic similarity or co-change frequency could improve
  signal prioritization.
- *Historical impact learning:* Some CIA systems learn from past changes which
  dependencies are "hot" (frequently cause cascading changes). The
  `convergence_runs` table provides the data for this — past runs reveal which
  artifact pairs frequently generate signals together.

### Constraint Propagation (CP) / Arc Consistency

**Reference:** Mackworth (1977) "Consistency in Networks of Relations";
AC-3 algorithm; Waltz (1975) filtering

The convergence loop is a constraint propagation loop: detect constraint
violations (inconsistent arcs), resolve them, check if resolution creates new
violations, repeat until fixpoint or resource limit.

| CP concept | Ripple engine equivalent |
|------------|-------------------------|
| Variable | Strategy artifact |
| Domain | Valid content space for an artifact |
| Constraint | Alignment relationship (contributes_to, etc.) |
| Arc inconsistency | Ripple signal |
| Fixpoint | Equilibrium state |
| Domain wipe-out | Emergency brake (signal count diverging) |

**Opportunities from CP literature:**
- *Monotonicity for convergence guarantees:* CP theory gives formal convergence
  guarantees when each step monotonically reduces the solution space. If we
  could prove that each resolution monotonically improves the equilibrium
  score, we would get stronger termination guarantees than the 4-layer damping
  provides. Currently the LLM resolver is non-monotonic (a fix can introduce
  new misalignments), which is why the emergency brake exists.
- *Variable ordering heuristics:* CP solvers process the most-constrained
  variable first (fail-first heuristic). Resolving signals with the highest
  downstream fan-out first could reduce total convergence iterations.

### Belief Propagation / Message Passing

**Reference:** Pearl (1988) *Probabilistic Reasoning in Intelligent Systems*;
Yedidia et al. (2003) "Understanding Belief Propagation"

In probabilistic graphical models, belief propagation passes messages between
nodes to achieve global consistency from local interactions. Each node's
"belief" is a probability distribution; messages carry evidence between
neighbors.

| BP concept | Ripple engine equivalent |
|------------|-------------------------|
| Node belief | Artifact's semantic embedding |
| Message | Signal between source and target |
| Marginal consistency | Equilibrium |
| Loopy BP oscillation | Emergency brake scenario |
| Damped updates | Change budget limiting |

**Opportunities from BP literature:**
- *Damped belief updates:* Loopy BP uses damped updates (α·old + (1-α)·new)
  to prevent oscillation. The LLM resolver could blend its suggestion with the
  original content (using embedding interpolation) rather than doing full
  replacement, providing smoother convergence.
- *Message scheduling:* Residual BP (Elidan et al., 2006) prioritizes messages
  by their expected impact. This directly maps to resolving the highest-severity
  signals first within each iteration.

### Incremental View Maintenance (IVM)

**Reference:** Gupta & Mumick (1995) "Maintenance of Materialized Views";
Blakeley et al. (1986) "Efficiently Updating Materialized Views"

The equilibrium score is a materialized view over the signal state. The
post-commit hook that auto-resolves signals for updated targets is a form of
delta maintenance.

| IVM concept | Ripple engine equivalent |
|-------------|-------------------------|
| Base table | Strategy artifacts |
| Materialized view | Equilibrium score, signal set |
| Delta maintenance | Post-commit auto-resolution |
| Full recomputation | `coherence_check` |

**Opportunities from IVM literature:**
- *Counting-based maintenance:* IVM uses reference counting to efficiently
  track derived aggregates. Orphan detection could maintain a contribution
  count per value model path rather than scanning all paths each time.
- *Self-maintainable views:* Some views can be maintained using only the delta.
  Our structural signals (orphan, staleness) are self-maintainable; our semantic
  signals are not (they require re-embedding). Recognizing this distinction
  could optimize which signal types are rechecked after each resolution.

### Eventual Consistency and CRDTs

**Reference:** Shapiro et al. (2011) "Conflict-Free Replicated Data Types";
Bailis & Ghodsi (2013) "Eventual Consistency Today"

The equilibrium concept — a coherence score that the system converges toward —
is analogous to eventual consistency in distributed systems.

| EC concept | Ripple engine equivalent |
|------------|-------------------------|
| Convergence guarantee | Equilibrium reachability |
| Conflict resolution | Signal resolution (LLM or agent) |
| Idempotency | Signal deduplication (source_key, target_key, signal_type) |
| Causal ordering | Staleness detection (days since update) |
| Anti-entropy | Periodic `coherence_check` |

**Key tension:** Signal deduplication provides idempotency, but the LLM resolver
is inherently non-deterministic — calling it twice on the same signal may
produce different fixes. This breaks the mathematical properties that guarantee
convergence in CRDT systems. Our 4-layer damping is the pragmatic engineering
answer to a fundamentally non-deterministic resolution operator.

### Reactive Dataflow / Incremental Computation

**Reference:** Bainomugisha et al. (2013) "A Survey on Reactive Programming";
Salvaneschi et al. (2014) "REScala"

Reactive systems (spreadsheets, MobX, Solid.js signals) propagate changes
through a dependency graph automatically, recomputing dependents when sources
change.

| Reactive concept | Ripple engine equivalent |
|------------------|-------------------------|
| Signal/Observable | Strategy artifact |
| Derived/Computed | Equilibrium score, signal set |
| Subscription | Post-commit hook |
| Glitch | Intermediate inconsistency during convergence |
| Topological sort | (Not currently implemented — see opportunity) |

**Opportunities from reactive programming:**
- *Topological signal ordering:* Reactive engines sort updates topologically to
  avoid redundant recomputation. If A depends on B depends on C, and C changes,
  update B first, then A. Our convergence loop resolves signals without
  topological ordering — resolving a downstream signal first may produce a fix
  that becomes invalid when the upstream signal is resolved. Processing signals
  in dependency order (upstream before downstream) within each iteration would
  reduce wasted iterations.
- *Glitch freedom:* A glitch occurs when a node observes an inconsistent
  intermediate state. Our iteration-based loop inherently avoids most glitches,
  but topological ordering would eliminate them entirely.

### Control Theory (Feedback Systems)

**Reference:** Åström & Murray (2008) *Feedback Systems: An Introduction for
Scientists and Engineers*

The convergence loop is a discrete-time feedback controller:

```
Plant:        Strategy graph state
Sensor:       Structural + semantic analysis (detect misalignments)
Controller:   Authority classification + signal resolver
Actuator:     CommitAuto (apply fixes)
Setpoint:     Equilibrium threshold (default 0.70)
Error signal: 1.0 - equilibrium_score (deficit)
```

| Control theory concept | Ripple engine equivalent |
|------------------------|-------------------------|
| Setpoint | Equilibrium threshold |
| Error signal | Score deficit |
| Proportional control | Signal severity weighting |
| Integral windup | Change budget (prevents over-correction) |
| Rate limiting | Max iterations, emergency brake |
| Plant saturation | Anchor drift limit |

**Opportunities from control theory:**
- *PID tuning:* The current system is essentially a proportional controller
  (signal severity determines response magnitude). Adding integral (cumulative
  deficit over convergence runs) and derivative (rate of equilibrium change)
  terms could improve steady-state behavior, particularly for slowly drifting
  strategy instances.
- *Stability analysis:* Control theory provides formal tools to analyze whether
  a feedback system is stable (converges) or unstable (oscillates/diverges).
  Modeling the resolver's effect on equilibrium as a transfer function would
  allow stability analysis without running the loop.

### Summary: positioning in the literature

The Ripple Coherence Engine is a novel synthesis that does not map cleanly to
any single existing system. It combines:

1. **TMS-style belief maintenance** (justification tracking, nogood detection)
2. **CIA-style impact analysis** (structural reachability + semantic precision)
3. **CP-style constraint propagation** (iterative fixpoint loop with damping)
4. **Control-theoretic feedback** (setpoint, error signal, rate limiting)
5. **An LLM as the resolution operator** (non-deterministic, language-native)

The key novelty is point 5: replacing deterministic constraint solvers or
probabilistic message passing with an LLM that operates directly on natural
language artifacts. This is both the engine's greatest strength (it can reason
about strategic alignment in ways no formal system could) and its greatest
challenge (non-determinism breaks convergence guarantees, requiring the
multi-layered damping approach).

---

### Observed behavior (from real-world testing)

Tested against the Emergent EPF instance (174 artifacts, 361 relationships):

| Metric | Value |
|--------|-------|
| Structural signals | 14 (7 orphaned value models, 7 untested assumptions) |
| Semantic signals | 7 (6 cross-track tensions, 1 vertical drift) |
| Initial equilibrium | 0.68 (threshold 0.70) |
| Auto-resolved | 7 orphaned value models |
| Final equilibrium | 0.82 (reached in 1 iteration) |
| Escalated to human | 6 cross-track tensions |
| Correctly skipped | 7 untested assumptions (target is text, not an artifact) |

Cross-track tension scores:
| Track pair | Similarity | Baseline |
|-----------|-----------|----------|
| commercial ↔ org_ops | 0.19 | 0.25 |
| commercial ↔ product | 0.18 | 0.25 |
| commercial ↔ strategy | 0.26 | 0.20 |
| org_ops ↔ product | 0.17 | 0.20 |
| org_ops ↔ strategy | 0.31 | 0.15 |
| product ↔ strategy | 0.16 | 0.15 |
