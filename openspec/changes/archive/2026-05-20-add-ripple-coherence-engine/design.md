## Context

EPF's white paper describes strategy as a living graph with bidirectional
emergence. The strategy-server currently treats artifacts as independent
documents connected by cross-references. This change adds infrastructure to
detect, surface, and resolve misalignments that propagate through the graph
when any artifact changes.

### Stakeholders

- **Strategy authors** (humans): need to understand ripple effects of their edits
- **AI agents** (LLM clients via MCP): need structured signals to guide authoring
- **Web UI** (Phase 3-4): needs server-side ripple data for real-time visualization

### Constraints

- Server must not call LLMs — all AI reasoning happens in the client
- Memory is optional — structural ripple must work without it
- Existing batch workflow must not break — ripple is additive
- Constitution compliance: `domain/ripple/` must have zero infrastructure imports

## Goals / Non-Goals

### Goals

- Detect structural misalignment when artifacts change (staleness, broken paths)
- Detect semantic drift when Memory embeddings are available (content vs declared relationships)
- Surface signals as actionable items with severity, suggested action, and affected tracks
- Enable ripple-aware batch workflow (root cause → consequences as single commit)
- Provide foundation for web UI ripple visualization
- Graceful degradation: full value without Memory, richer signals with it

### Non-Goals

- Server-side LLM calls for generating draft updates (client responsibility)
- Real-time keystroke-level ripple preview (too expensive; debounced/on-demand)
- Automated signal resolution (human-in-the-loop always)
- Full web UI implementation (this change specifies screens; Phase 3-4 implements)
- Replacing existing validation tools (ripple complements schema validation)

## Decisions

### Decision 1: Two-Layer Ripple Architecture

**What:** Structural ripple (graph traversal, timestamp comparison) runs without
Memory. Semantic ripple (embedding comparison, drift detection) requires Memory.
Both produce signals in the same format.

**Why:** Memory is optional infrastructure. Structural signals alone provide
significant value — "feature X hasn't been updated since the North Star changed
3 weeks ago" is useful without embeddings. Semantic signals add depth — "feature
X's content has drifted from its declared value path" — but shouldn't be a
prerequisite.

**Alternatives considered:**
- Semantic-only: rejected because it makes the feature unavailable without Memory
- Structural-only: rejected because it misses the most valuable signals (semantic drift, cross-track tension)

### Decision 2: Signals Are Ephemeral Observations, Not Artifacts

**What:** Ripple signals live in a `ripple_signals` table, not in the
`strategy_artifacts` / `strategy_mutations` system. They have a lifecycle
(active → resolved/dismissed) but are not versioned, not included in
`publish_version` snapshots, and not synced to GitHub.

**Why:** Signals are meta-observations about graph health. They're useful in
the moment but don't belong in the immutable strategy ledger. A signal saying
"fd-003 is stale" becomes meaningless once fd-003 is updated. Including them
in version snapshots would add noise.

**Alternatives considered:**
- Signals as strategy artifacts: rejected because they'd pollute the artifact graph
- Signals as audit log entries: rejected because they need lifecycle management (acknowledge/resolve/dismiss) which audit logs don't support

### Decision 3: Semantic Change Classification via Embedding Distance

**What:** When an artifact is committed, compute cosine distance between its
old and new embeddings. Classify the change:
- Trivial (< 0.05): no ripple analysis
- Minor (0.05–0.15): check immediate graph neighbors
- Significant (0.15–0.30): check full subgraph
- Major (> 0.30): full graph ripple

**Why:** Prevents expensive ripple analysis on trivial edits. A typo fix
shouldn't trigger downstream staleness signals. A vision pivot should.

**Alternatives considered:**
- Text diff size: rejected because a one-word change ("SMB" → "enterprise") is small by character count but semantically massive
- Always full analysis: rejected because it's expensive and generates noise
- Manual classification by user: rejected because it adds friction and users can't reliably assess semantic impact

**Thresholds are configurable** per artifact type (North Star changes are more impactful per unit of distance than feature changes). Default thresholds will be calibrated through testing.

### Decision 4: Ripple Batches via Existing Batch Infrastructure

**What:** Ripple resolution uses the existing `strategy_mutations` batch
system. A ripple batch is a regular batch with additional metadata: `root_cause_key`
(the artifact that triggered the ripple) and `ripple_chain` (the propagation path).
These are stored in the batch description or a new `batch_metadata` JSONB column.

**Why:** Reusing the existing batch system means no new commit workflow, no new
review flow, no new MCP tools for committing. The human still reviews and
commits via `commit_batch`. The only addition is richer context about why
these changes are grouped.

**Alternatives considered:**
- Separate ripple commit mechanism: rejected because it fragments the workflow
- Auto-commit ripple changes: rejected because it violates human-in-the-loop principle

### Decision 5: Client-Side AI for Draft Generation

**What:** The `generate_ripple_batch` tool returns structured data (affected
artifacts, signal details, current payloads, relationship context) that the
client LLM uses to generate draft updates. The server does not call LLMs.

**Why:** Keeps the server thin and deterministic. The client LLM already has
the agent/skill prompts and conversation context. The server provides the
graph intelligence (what's affected); the client provides the language
intelligence (what the fix should say).

**Alternatives considered:**
- Server-side LLM calls: rejected because it adds infrastructure complexity, cost management, and latency. Also violates the "Agent as Writer, Tool as Linter" principle.
- Pure client-side analysis: rejected because the client doesn't have efficient access to the full graph topology and embedding distances

### Decision 6: Web UI Ripple Preview via Server-Sent Events

**What:** The artifact editor's ripple preview panel uses SSE (Server-Sent
Events) to stream ripple analysis results as they're computed. The client sends
the draft content; the server computes structural + semantic analysis and
streams results back progressively.

**Why:** Ripple analysis may take 1-5 seconds for significant changes (graph
traversal + Memory API calls). SSE allows the UI to show results
incrementally — structural signals appear immediately, semantic signals stream
in as Memory responds.

**Alternatives considered:**
- WebSocket: rejected as overkill for unidirectional streaming
- Polling: rejected because it adds latency and complexity
- Synchronous request: rejected because 1-5s blocking UX is unacceptable

## Risks / Trade-offs

### Risk: Semantic threshold calibration

The embedding distance thresholds (0.05/0.15/0.30) are theoretical. Real-world
calibration requires testing with actual EPF instances and Memory embeddings.

**Mitigation:** Make thresholds configurable per instance. Start with conservative
values (more signals). Provide a `calibrate_thresholds` tool that analyzes
historical changes and suggests optimal values.

### Risk: Signal fatigue

Too many signals become noise. If every commit produces 10 warnings, users
stop reading them.

**Mitigation:** Severity classification ensures only truly misaligned
artifacts get `critical` signals. `dismiss_signal` with reason prevents
repeat signaling for intentional tensions. Signal count feeds into lifecycle
mode detection — an instance with 20+ active signals gets `recalibration_needed`.

### Risk: Memory API latency

Embedding comparison requires Memory API calls. If Memory is slow or down,
ripple analysis could block commits.

**Mitigation:** Semantic ripple is always async and non-blocking. `commit_batch`
returns immediately with structural signals. Semantic signals are computed
asynchronously and stored when ready. The commit never waits for Memory.

### Trade-off: Signals are not diff-aware

Signals compare current state to current state. They don't know which specific
field changed in an artifact — only that the overall semantic distance shifted.
A signal saying "fd-003 is drifting from its value path" doesn't say "because
you changed the job_to_be_done field."

**Accepted because:** Field-level semantic analysis would require decomposing
artifacts into per-field embeddings, which is significantly more complex and
expensive. The current approach is good enough — the signal points the human
to the right artifact, and the human can see what changed.

## Open Questions

1. **Should signals persist across version publishes?** Currently proposed as
   not included in version snapshots. But there may be value in knowing "at
   version 5, there were 3 unresolved signals" for historical analysis.

2. **Should `propose_change` work with unstaged edits?** Currently it requires
   a payload. Should it also accept a natural language description of a change
   and use the client LLM to infer the semantic shift?

3. **How should the web UI handle conflicting signals?** If two signals suggest
   contradictory updates to the same artifact, how does the resolution flow
   present this to the human?
