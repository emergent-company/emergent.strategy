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
