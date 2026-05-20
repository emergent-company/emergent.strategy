# Change: Add Convergence Loop, Authority Model, and Equilibrium Definition to the Ripple Coherence Engine

## Why

The Ripple Coherence Engine (shipped in `add-ripple-coherence-engine`) provides
the sensory layer: it detects misalignments after every commit and emits signals.
But it is a **one-shot observer** — it fires once, emits signals, and stops.
Every resolution requires a full human review-and-commit cycle, regardless of
whether the fix is a trivial alignment tweak or a strategic pivot.

This creates two problems:

1. **No convergence.** Resolving signal A may introduce signal B. The system
   never reaches equilibrium on its own — it depends on humans to repeatedly
   commit, inspect signals, resolve, commit again. For a graph with dozens of
   interconnected artifacts, this is exhausting.

2. **No proportional response.** A typo fix in a feature description and a
   North Star pivot both follow the same workflow: stage, review, commit. The
   system has no concept of change magnitude driving different levels of
   autonomy. AI agents should be able to tighten semantic alignment
   autonomously for trivial/minor adjustments, while substantial strategic
   changes must go through a human gate.

This proposal adds three interconnected capabilities:

- **Change Authority Model** — classifies every change by semantic magnitude
  and assigns it an authority tier (autonomous or human-gated)
- **Convergence Loop** — a re-entrant analysis loop that runs after each
  commit, auto-resolves low-authority signals, and continues until the graph
  reaches equilibrium
- **Equilibrium Definition** — a threshold-based definition of "coherent
  enough" that accounts for the fact that strategic sub-domains are concentric
  circles with natural tension at their boundaries, not perfectly overlapping
  layers

## What Changes

### 1. Embedding-Based Semantic Classification

Replace the current word-overlap text similarity heuristic in `ClassifyChange`
with Memory's embedding-based search to produce true semantic distance scores.
Use these scores as the foundation for the authority model.

### 2. Change Authority Model

Introduce a three-tier authority system that maps semantic change magnitude to
the level of approval required:

- **Autonomous** (trivial/minor): AI agents may commit directly via a new
  `commit_auto` path. Changes are logged and auditable but do not require
  human staging review.
- **Gated** (significant): AI agents draft changes, humans approve via the
  existing `commit_batch` workflow.
- **Escalated** (major): full human review required, with explicit
  acknowledgment of blast radius before commit is allowed.

Authority thresholds are configurable per artifact type (North Star has lower
thresholds than feature definitions — smaller changes are escalated sooner).

### 3. Convergence Loop with Damping

Add a server-side convergence loop that activates after any commit. The loop:

1. Senses — runs coherence analysis (structural + semantic)
2. Classifies — determines authority tier for each signal
3. Auto-resolves — generates and commits fixes for autonomous-tier signals
4. Re-senses — checks if resolutions introduced new signals
5. Repeats — until equilibrium is reached or damping limits are hit

Damping prevents wildfire cascades:
- Maximum iteration depth (configurable, default 5)
- Per-cycle change budget (maximum cumulative semantic distance)
- Strategy anchor check (North Star / strategy formula drift guard)
- Emergency brake (if signals increase for 2 consecutive iterations, stop)

### 4. Equilibrium Definition

Define equilibrium as a threshold-based state, not a zero-signal state.
Strategic sub-domains (Product, Strategy, OrgOps, Commercial) are concentric
circles — they share a core but diverge at their boundaries. Some tension
between tracks is healthy and intentional.

Equilibrium is reached when:
- Zero critical signals remain
- All warning signals are either below the autonomous threshold (and thus
  auto-resolved) or above the gated threshold (surfaced for human review)
- Info signals may persist indefinitely — they are observations, not issues
- The equilibrium score (a weighted aggregate) is above the instance's
  configured threshold
- Intentionally dismissed tensions do not count against the score

### 5. Cross-Track Tension Detection

Implement the previously spec'd but unbuilt `DetectCrossTrackTension` using
Memory's embedding centroids to measure inter-track semantic divergence. This
feeds into the equilibrium score as a "natural tension" factor.

### 6. Configurable Threshold System

Introduce per-instance, per-artifact-type configuration for:
- Authority tier boundaries (what semantic distance counts as trivial vs minor vs significant vs major)
- Equilibrium threshold (what score counts as "coherent enough")
- Damping parameters (max iterations, change budget, anchor drift limit)
- Natural tension baseline per track pair (expected divergence that doesn't generate warnings)

### 7. Equilibrium-Triggered Version Snapshots

Connect the convergence loop to the existing versioning system. When the
convergence loop reaches equilibrium AND at least one change was made during
the cycle (auto-commit or signal resolution), the system automatically
publishes a version snapshot. This captures the strategy in its "settled"
state — the moment after edits have rippled, tweaks have been auto-applied,
and the graph is coherent.

Intermediate commits — both human batches and auto-committed tweaks — do NOT
create versions. Only the equilibrium moment does. Manual `publish_version`
remains unchanged and coexists with auto-published versions.

Auto-published versions are enriched with convergence metadata: equilibrium
score, convergence summary, triggering batch ID, and `source='convergence'`
to distinguish them from manual snapshots. This enables "coherence over time"
analysis across version history.

## Impact

- **Affected specs:** `strategy-semantic`, `strategy-authoring`, `strategy-serving`, `strategy-mcp`
- **Affected code:**
  - Modified: `apps/strategy-server/domain/ripple/semantic.go` (embedding-based classification)
  - New: `apps/strategy-server/domain/ripple/authority.go` (authority model)
  - New: `apps/strategy-server/domain/ripple/convergence.go` (convergence loop + auto-publish)
  - New: `apps/strategy-server/domain/ripple/equilibrium.go` (equilibrium scoring)
  - New: `apps/strategy-server/domain/ripple/tension.go` (cross-track tension)
  - New: `apps/strategy-server/domain/ripple/config.go` (threshold configuration)
  - Modified: `apps/strategy-server/domain/version/service.go` (source metadata on versions)
  - Modified: `apps/strategy-server/internal/mcpserver/register_ripple_tools.go` (new tools)
  - Modified: `apps/strategy-server/internal/mcpserver/server.go` (convergence hook in commit_batch)
  - Modified: `apps/strategy-server/internal/domain/models.go` (RippleConfig model, version source field)
  - New migration: `ripple_config` table, `authority_tier` column on `ripple_signals`, `source` and `equilibrium_score` columns on `strategy_versions`
- **Breaking changes:** None. All new capabilities; existing tools retain current behavior.
  The `commit_batch` response gains additional fields but existing fields are unchanged.
  Existing versions are unaffected — new columns default to null/manual.
- **Dependencies:** Requires `add-ripple-coherence-engine` (already shipped). Semantic
  features require Memory integration (graceful degradation when unavailable).
