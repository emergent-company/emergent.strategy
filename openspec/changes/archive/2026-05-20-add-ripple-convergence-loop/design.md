## Context

The Ripple Coherence Engine (Phase 1-3 of `add-ripple-coherence-engine`) provides
signal detection, lifecycle management, and AI-assisted resolution context. But
every resolution requires a human `commit_batch` cycle, the engine runs only once
per commit, and there is no definition of what "coherent" actually means.

This change transforms the engine from a passive observer into an active control
system with feedback, damping, and proportional response.

### Stakeholders

- **AI agents** (MCP clients): need to autonomously fix trivial misalignments
  without human friction, but must not be able to overwrite strategic direction
- **Strategy authors** (humans): need confidence that autonomous fixes are
  cosmetic, and that substantial changes always require their approval
- **Platform operators**: need safety guarantees against cascading auto-commits
  that drift the strategy graph away from its intended direction

### Constraints

- Server must not call LLMs — all content generation happens in the client
- Autonomous commits must be fully auditable and reversible
- Memory is optional — the convergence loop must function (with reduced
  capability) using structural signals alone when Memory is unavailable
- The existing `commit_batch` workflow must not change for human-gated commits
- Constitution compliance: all domain logic in `domain/ripple/`, zero
  infrastructure imports

## Goals / Non-Goals

### Goals

- Define a computable equilibrium state for the strategy graph that tolerates
  natural inter-track tension
- Classify every change by semantic magnitude using Memory embeddings when
  available, falling back to structural heuristics
- Enable AI agents to auto-commit trivial/minor alignment fixes without human
  staging review
- Prevent cascade wildfires through configurable damping (depth limits, change
  budgets, anchor drift guards)
- Provide a convergence loop that re-senses after each resolution and continues
  until equilibrium or damping limits
- Make all thresholds configurable per instance and per artifact type

### Non-Goals

- Server-side LLM content generation (client responsibility — unchanged)
- Real-time streaming of convergence progress (future web UI concern)
- Fully autonomous strategic pivots (major changes always require human gate)
- Replacing the existing batch workflow (augmenting it with an auto-commit path)

## Decisions

### Decision 1: Threshold-Based Equilibrium, Not Zero-Signal

**What:** Equilibrium is defined as an aggregate coherence score above a
configurable threshold, not as "zero active signals." The score accounts for
natural tension between strategic tracks.

**Why:** Strategic sub-domains (Product, Strategy, OrgOps, Commercial) are
concentric circles sharing a core direction but diverging at their functional
boundaries. A product track emphasizing developer experience and a commercial
track emphasizing enterprise sales are not contradictions — they are healthy
tension reflecting different audiences served by the same strategic core.

Requiring zero signals would either:
- Force artificial homogeneity across tracks (bad strategy), or
- Require humans to perpetually dismiss legitimate tensions (bad UX)

Instead, the equilibrium score:
- Weights critical signals heavily (must be zero for equilibrium)
- Weights warning signals moderately (must be below threshold or human-dismissed)
- Treats info signals as observations (no impact on equilibrium)
- Subtracts a "natural tension baseline" per track pair — if the measured
  tension between Product and Commercial is within the baseline, it contributes
  zero to the coherence deficit
- Treats dismissed signals as resolved (human explicitly accepted the state)

The threshold model:

```
coherence_score = 1.0 - weighted_signal_penalty

where:
  weighted_signal_penalty = sum over active signals of:
    critical:  0.20 per signal  (5 critical = fully incoherent)
    warning:   0.05 per signal  (20 warnings = fully incoherent)
    info:      0.00 per signal
    
  minus natural_tension_adjustment:
    for each track pair (A, B):
      if measured_tension(A, B) <= baseline_tension(A, B):
        subtract the tension signal's penalty (it's expected)

equilibrium := coherence_score >= instance.equilibrium_threshold (default 0.70)
```

**Alternatives considered:**
- Zero-signal equilibrium: rejected because it doesn't model reality —
  healthy strategy has intentional tensions between domains
- Per-signal-type thresholds: rejected as too complex to configure — a single
  score with per-type weights is simpler and captures the same semantics
- Percentage-based ("90% of artifacts aligned"): rejected because it doesn't
  account for severity — 10 info signals are noise, 1 critical is a real problem

### Decision 2: Three-Tier Authority Model

**What:** Every change is classified into one of three authority tiers based on
semantic magnitude:

| Tier | Semantic Distance | Approval | Example |
|------|------------------|----------|---------|
| Autonomous | trivial + minor (< 0.15) | Auto-commit, logged | Tightening UVP wording to match value path |
| Gated | significant (0.15 - 0.30) | Human `commit_batch` | Changing feature scope or target persona |
| Escalated | major (> 0.30) | Human + blast radius ack | North Star pivot, strategic formula rewrite |

**Why:** Proportional response prevents both workflow friction (trivial changes
blocking on human approval) and dangerous autonomy (strategic pivots committed
without oversight). The tiers map directly to the existing semantic change
classification.

**Structural fallback:** When Memory is unavailable, authority classification
falls back to structural heuristics:
- Autonomous: same-artifact-only changes with no new relationship edges
- Gated: changes affecting 1-3 downstream artifacts
- Escalated: changes affecting 4+ artifacts or touching North Star / strategy formula

**Why these thresholds (0.15 / 0.30):**
- Below 0.15 captures synonym substitution, grammar fixes, clarification
  additions — changes that preserve semantic direction
- 0.15-0.30 captures scope shifts, emphasis changes, persona adjustments —
  changes that alter strategy within the existing direction
- Above 0.30 captures direction changes, pivots, fundamental reframes —
  changes that redefine the strategy itself

These are defaults — configurable per instance and per artifact type. North
Star and strategy formula artifacts have lower thresholds (more sensitive):
- North Star: autonomous < 0.08, gated 0.08-0.20, escalated > 0.20
- Features: autonomous < 0.20, gated 0.20-0.35, escalated > 0.35

### Decision 3: Auto-Commit as Separate Path, Not Modified Batch

**What:** Autonomous commits use a new `commit_auto` internal function, not
the existing `commit_batch`. Auto-commits:
- Bypass the staging step (no `batch_id` visible to human)
- Write directly to `strategy_mutations` with `status='committed'` and
  `source='ripple_auto'`
- Are tagged with `authority_tier='autonomous'` in mutation metadata
- Trigger the same post-commit hooks (ingestion, ripple re-analysis)
- Are fully visible in `list_mutations` and audit log

**Why:** The existing `commit_batch` workflow is designed around human review —
it creates a staging batch, returns a `batch_id` for the human to inspect, and
waits for explicit confirmation. Forcing autonomous commits through this path
would either require auto-confirming batches (confusing audit trail) or
creating invisible batches (violates the design principle that all batches are
human-reviewable).

A separate path makes the intent explicit: this commit was made autonomously by
the convergence loop, not by a human through the staging workflow.

**Alternatives considered:**
- Auto-confirming batches: rejected because `batch_id` semantics imply human
  review — an auto-confirmed batch is misleading
- Silent mutations: rejected because they must be auditable and visible in
  mutation history
- Flag on `commit_batch`: rejected because it conflates two different approval
  workflows in one code path

### Decision 4: Convergence Loop Runs Synchronously, Returns Summary

**What:** The convergence loop runs as a synchronous function after
`commit_batch` completes. It blocks the commit response until equilibrium is
reached or damping limits are hit. The commit response includes a
`convergence_summary` showing what the loop did.

**Why:** The convergence loop is bounded (max 5 iterations, ~100ms per
iteration for structural analysis, ~500ms with Memory). Total worst case is
~3 seconds, well within acceptable MCP response time. Running asynchronously
would make the commit response misleading ("0 new signals" when the loop
hasn't finished yet).

**Alternatives considered:**
- Async with polling: rejected because the loop is fast enough to run inline
  and the response should reflect the final state
- Async with SSE: premature — this is a Phase 4 web UI concern. MCP clients
  can handle a 2-3 second response.
- Background worker: rejected because it introduces eventual consistency in
  signal state — an agent calling `list_signals` immediately after commit
  might see stale data

### Decision 5: Embedding-Based Classification via Memory Search Score

**What:** Replace `textSimilarityRatio` (word-overlap) in `ClassifyChange` with
a Memory search-based approach:

1. Before commit: the artifact's current content is already indexed in Memory
2. After commit: search Memory using the NEW content as query
3. The search score of the artifact's OWN key in results measures how similar
   the new content is to what Memory had indexed (the old content)
4. High score (> 0.95) = trivial change, low score (< 0.70) = major change

**Why:** This captures true semantic distance. "SMB" to "enterprise" would
score low (different market segments have different embeddings) despite being
a small text edit. A paragraph of typo fixes would score high (semantically
identical content).

The approach works within Memory's API constraints — no raw embedding access
needed, just the search score which is a cosine similarity proxy.

**Fallback when Memory is unavailable:** Keep the structural heuristics (see
Decision 2) as the fallback classifier. The word-overlap ratio is retained as
a third fallback but never used as primary when Memory is available.

**Alternatives considered:**
- Raw embedding cosine distance: not available in Memory's current API without
  adding an endpoint
- Text diff analysis: rejected — doesn't capture semantic magnitude
- LLM-based classification: rejected — server must not call LLMs (constraint)

### Decision 6: Natural Tension Baselines Per Track Pair

**What:** Each instance can configure expected tension baselines between track
pairs. The equilibrium scorer subtracts baseline tension from measured tension,
so only excess tension generates warning signals.

Default baselines (semantic distance between track embedding centroids):

| Track A | Track B | Default Baseline |
|---------|---------|-----------------|
| Product | Commercial | 0.25 |
| Product | OrgOps | 0.20 |
| Product | Strategy | 0.15 |
| Strategy | Commercial | 0.20 |
| Strategy | OrgOps | 0.15 |
| Commercial | OrgOps | 0.25 |

**Why:** Product and Commercial tracks naturally diverge — one focuses on user
value, the other on revenue models. OrgOps and Commercial naturally diverge —
one focuses on team capabilities, the other on market positioning. Flagging
these natural divergences as tension signals is noise.

The baselines are calibrated from the "concentric circles" model: tracks
sharing more of the strategic core (Product-Strategy, Strategy-OrgOps) have
lower natural tension. Tracks with less overlap (Product-Commercial,
OrgOps-Commercial) have higher natural tension.

Baselines are configurable because different organizations have different
strategic structures — a product-led growth company has low Product-Commercial
tension (the product IS the sales channel), while an enterprise sales company
has higher natural tension.

### Decision 7: Damping as a Multi-Layer Safety Net

**What:** Four damping mechanisms prevent wildfire cascades:

1. **Max iteration depth** (default 5): the convergence loop runs at most N
   iterations regardless of signal state
2. **Per-cycle change budget** (default 0.50 cumulative semantic distance):
   the total semantic distance of all auto-committed changes in one convergence
   cycle must not exceed the budget — prevents many small changes that
   collectively drift the strategy
3. **Strategy anchor check**: after each auto-commit, compare the North Star
   and strategy formula embeddings against their pre-cycle state — if drift
   exceeds 0.10, stop the loop and escalate
4. **Emergency brake**: if active signal count increases for 2 consecutive
   iterations, stop — the loop is creating more problems than it solves

**Why:** Each layer catches a different failure mode:
- Depth limit: prevents infinite loops from circular dependencies
- Change budget: prevents death-by-a-thousand-cuts semantic drift
- Anchor check: prevents foundational artifacts from drifting through
  transitive adjustments
- Emergency brake: detects divergent behavior (positive feedback loop)

**Alternatives considered:**
- Single depth limit only: insufficient — 5 iterations of large changes can
  still cascade
- Rollback on budget exceeded: rejected because partial progress is valuable —
  better to stop and surface remaining signals to human than to undo valid fixes
- Exponential backoff: rejected as overengineered — the loop is bounded and
  fast, backoff adds complexity without benefit

## Risks / Trade-offs

### Risk: Autonomous commits produce undesired changes

An AI agent auto-commits a "trivial" alignment fix that a human would have
phrased differently.

**Mitigation:** All auto-commits are:
- Tagged with `source='ripple_auto'` — visible and filterable in mutation history
- Included in the `convergence_summary` returned by the commit that triggered them
- Reversible via version restore (`restore_version`)
- Bounded by conservative default thresholds (autonomous < 0.15 semantic distance)

### Risk: Natural tension baselines are wrong

Default baselines may not match an organization's actual strategic structure,
causing false negatives (missing real tension) or false positives (flagging
intentional divergence).

**Mitigation:** Baselines are configurable per instance. A `calibrate_baselines`
tool (future) can analyze historical signal patterns and suggest optimal
baselines. The defaults are conservative — they allow more tension than most
organizations will have, meaning false positives (too many signals) are more
likely than false negatives (missed tensions).

### Risk: Convergence loop is too slow for large graphs

An instance with hundreds of artifacts might take many seconds per iteration.

**Mitigation:** Structural analysis is O(edges) per changed artifact, not
O(artifacts^2). Semantic analysis (Memory search) is bounded by `limit`
parameter. Worst case: 5 iterations * (structural ~100ms + semantic ~500ms) =
~3 seconds. For graphs with 1000+ artifacts, iteration limit can be lowered.

### Trade-off: Equilibrium threshold is subjective

What counts as "coherent enough" (default 0.70) is a judgment call, not a
mathematical truth.

**Accepted because:** Any threshold is better than no threshold. The default
is deliberately permissive — it allows a moderate amount of warning-level
signals. Organizations can tighten it as they develop intuition about their
graph's natural coherence level.

### Decision 8: Equilibrium-Triggered Version Snapshots

**What:** When the convergence loop reaches equilibrium after a commit cycle,
the system automatically publishes a version snapshot. Intermediate commits —
both human-initiated batches and auto-committed tweaks — do NOT create
versions. Only the moment when the graph settles into a coherent state
triggers a snapshot.

**Why:** The versioning system (`publish_version`) is currently 100% manual —
a user or agent must explicitly call it. This is fine for ad-hoc checkpoints,
but it misses the most meaningful versioning moment: the point at which the
strategy graph has been edited, rippled, converged, and stabilized. That
equilibrium state represents a "known-good" strategy configuration worth
preserving.

Without this, the version timeline is either empty (users forget to publish)
or cluttered with arbitrary checkpoints that may represent mid-edit states
with unresolved signals.

The convergence-triggered snapshot captures:
- All artifacts in their coherent-state payloads (including auto-committed
  tweaks)
- All relationships (including any added/modified during convergence)
- The equilibrium score and convergence summary as version metadata
- A label that identifies it as convergence-generated (e.g.
  `"Equilibrium after batch <short-id>"`)

**Relationship to manual versioning:** Manual `publish_version` remains
unchanged. Users can still publish at any time, including mid-edit states.
Auto-published equilibrium versions coexist with manual versions in the
version timeline. Auto-published versions are tagged with
`source='convergence'` in their metadata so they can be distinguished from
manual snapshots.

**When NOT to auto-publish:**
- When the convergence loop stops due to damping (budget exceeded, anchor
  drift, emergency brake) — the graph is NOT in equilibrium and should not
  be snapshotted
- When convergence completes but nothing changed (no auto-commits made, no
  signals resolved) — the previous version already represents this state
- When equilibrium was already at or above threshold before the convergence
  loop ran — no new version needed for a no-op convergence

This means auto-publish only fires when: (a) convergence reached equilibrium,
AND (b) at least one auto-commit or signal resolution occurred during the
cycle.

**Snapshot enrichment:** The version snapshot metadata is extended with:
- `equilibrium_score`: the coherence score at time of publish
- `convergence_summary`: iterations, auto-resolved count, damping reason
- `source`: `"convergence"` vs `"manual"` to distinguish provenance
- `triggering_batch_id`: the human commit that initiated the convergence cycle

This enables "coherence over time" analysis by querying version snapshots
and plotting their equilibrium scores.

**Alternatives considered:**
- Version on every commit: rejected because it creates noise — most commits
  are intermediate edits, not meaningful strategy states
- Version only when user asks: current behavior, but misses the most
  meaningful moment (equilibrium)
- Version at fixed intervals (daily/weekly): rejected because strategy edits
  are bursty, not regular — a daily snapshot might capture mid-edit or
  completely idle states

### Decision 9: Pluggable Resolver Interface — Dual-Mode Operation

**What:** The convergence loop accepts an optional `SignalResolver` interface.
When present (server-orchestrated mode), the loop calls it to generate fixes
for autonomous-tier signals. When nil (agent-orchestrated mode), the loop
detects and classifies only — the client agent drives resolution via
subsequent MCP calls.

```go
type SignalResolver interface {
    Resolve(ctx context.Context, signal *RippleSignal, currentPayload json.RawMessage) (*ResolveResult, error)
}

type ResolveResult struct {
    Updated     bool            // true if a fix was generated
    NewPayload  json.RawMessage // the fixed artifact content
    Explanation string          // human-readable description of the fix
    Distance    float64         // semantic distance of the fix (for change budget)
}
```

**Why:** The server must work in two modes:

1. **Agent-orchestrated** (MCP client drives): An external AI agent connects
   via MCP, commits changes, sees the `convergence_summary` in the response,
   and decides what to do with remaining signals. The agent generates content
   using its own LLM. The server is the graph intelligence; the agent is the
   language intelligence. This is the current OpenCode/Cursor workflow.

2. **Server-orchestrated** (web UI / API triggers): A web user commits
   changes through the UI. The server autonomously resolves low-authority
   signals by calling an LLM provider directly (via the `SignalResolver`
   implementation). The human sees the result after the fact. This is the
   future web UI workflow.

Both modes use the same convergence loop, same damping, same equilibrium
scoring, same version auto-publish. The only difference is who generates
the fix content.

**The interface is minimal by design.** One method, one input (signal +
current payload), one output (new payload + metadata). The implementation
can be:
- An LLM client that calls OpenAI/Anthropic/Ollama (future `internal/llm/`)
- A tiered reasoner that routes by model tier (replicating epf-cli's pattern)
- A mock for testing
- nil (agent-orchestrated mode — no server-side resolution)

**Mode selection:** Determined by whether a `SignalResolver` is injected into
`ConvergenceServices`. The server wires this at startup based on LLM config:
- `LLM_PROVIDER_URL` set → create LLM-backed resolver, inject into convergence
- Not set → resolver is nil, convergence loop is detection-only

**Version auto-publish gate update:** With the resolver interface, the
`changedThisCycle` gate works correctly in both modes:
- Server-orchestrated: resolver generates fix → `CommitAuto` → `changedThisCycle = true` → version published
- Agent-orchestrated: no resolver → `changedThisCycle = false` → no auto-publish from the loop (the agent's own commit will trigger the next loop iteration)

**Alternatives considered:**
- Always require LLM (server-orchestrated only): rejected because the MCP
  workflow is the primary use case today and should work without LLM config
- Always delegate to agent (agent-orchestrated only): rejected because the
  web UI needs server-side autonomy
- Separate convergence implementations: rejected — the detection, damping,
  and equilibrium logic is identical in both modes; only resolution differs

## Open Questions

1. **Should auto-commits be groupable?** If the convergence loop auto-commits
   3 trivial fixes, should they share a batch ID for easier rollback? Or is
   individual mutation tracking sufficient?

2. **Should the convergence loop respect dismissed signals when computing
   equilibrium?** Current proposal: dismissed signals are excluded from the
   score (they represent intentional state). But this means a human can game
   the score by dismissing everything.

3. **Should there be a minimum convergence interval?** If an agent makes 10
   commits in rapid succession, should each trigger a full convergence loop,
   or should the system debounce and run one loop after a quiet period?

4. **Should auto-published versions be purgeable?** If the system generates
   many equilibrium snapshots over time, should there be a retention policy
   (e.g. keep the last 10 auto-published, keep all manual)?
