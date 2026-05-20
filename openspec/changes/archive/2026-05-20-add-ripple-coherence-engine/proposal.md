# Change: Add Ripple Coherence Engine for Living Strategy Authoring

## Why

EPF treats strategy as a living, interconnected graph — not a collection of
independent documents. The white paper describes **bidirectional emergence**:
constraints flow downward (North Star to Features), learning flows upward
(AIM evidence to Strategy). A change at any layer can ripple through every
other layer. The four tracks (Product, Strategy, OrgOps, Commercial) braid
through all layers, creating cross-track dependencies.

The current strategy-server treats artifacts as independent units. You stage
one, commit it, stage another. Nothing in the system understands that:

1. **Changing the North Star may invalidate dozens of downstream artifacts** —
   features, value models, roadmap OKRs that reference the old direction
2. **A discovery in AIM can propagate inward** — a refuted assumption should
   trigger review of the roadmap, strategy formula, and dependent features
3. **Cross-track tensions are invisible** — a product track emphasizing
   self-service while the commercial track plans enterprise sales creates
   strategic incoherence that no current tool detects
4. **A single word change can shift semantics** — changing "SMB" to
   "enterprise" in the North Star is a trivial edit but a seismic strategic
   shift, while fixing a typo is not

This proposal adds a **Ripple Coherence Engine** — infrastructure that detects
when changes to one part of the strategy graph affect other parts, surfaces
those misalignments as actionable signals, and supports AI-assisted resolution.
It also lays the foundation for the web UI's authoring experience (Phase 3-4)
where humans interact with strategy as a living organism rather than a file
editor.

## What Changes

### 1. Ripple Signal Domain

New `domain/ripple/` package with signal types, severity classification, and
lifecycle management. Signals represent detected misalignments between
connected artifacts — not broken references (we have validation for that) but
semantic drift, staleness propagation, cross-track tensions, and orphaned
value paths.

- `ripple_signals` table (new migration) storing active/acknowledged/resolved/dismissed signals
- Signal types: `drift`, `propagation`, `tension`, `staleness`, `clustering`, `orphan`
- Severity levels: `critical`, `warning`, `info`
- Signal lifecycle: `active` → `acknowledged` → `resolved` or `dismissed`

### 2. Structural Ripple Analysis

Graph traversal that walks `strategy_relationships` and `strategy_artifacts`
to detect structural misalignment without requiring Memory/embeddings.

- `propose_change` MCP tool: preview the blast radius of a change before committing
- Downstream staleness detection: which artifacts haven't been updated since their upstream dependency changed
- Reference integrity beyond schema validation: are declared value paths still semantically relevant
- Enhance `commit_batch` to compute and return structural ripple signals after commit

### 3. Semantic Ripple Analysis (requires Memory)

Embedding-based change detection and cross-artifact coherence analysis using
Memory's semantic graph.

- Semantic change classification: compute cosine distance between before/after embeddings to classify edits as trivial/minor/significant/major
- Semantic drift detection: compare artifact content embedding against its declared `contributes_to` value paths
- Cross-track tension detection: compare per-track embedding centroids for divergence
- Emergent clustering: find semantically similar but structurally unconnected artifacts
- Assumption staleness: compare assumption text against recent AIM evidence

### 4. Coherence Check Tool

Full-graph coherence analysis combining structural and semantic signals into
an actionable health report.

- `coherence_check` MCP tool: on-demand full-graph scan
- Integrates with existing `health_check` lifecycle detection (adds signal summary)
- Returns prioritized signals with suggested actions and affected tracks
- Graceful degradation: structural-only when Memory unavailable

### 5. Signal Management Tools

MCP tools for signal lifecycle management — listing, acknowledging, resolving,
and dismissing signals.

- `list_signals`: active signals for an instance, filterable by type/severity/track
- `acknowledge_signal`: mark a signal as seen (stops it from being highlighted but keeps it active)
- `resolve_signal`: mark as addressed (links to the batch that fixed it)
- `dismiss_signal`: mark as intentional (with reason — "this tension is deliberate")

### 6. Ripple-Aware Batch Workflow

Enhance the existing staged-batch workflow to support ripple resolution — where
a root change and its consequences form a single coherent batch.

- Ripple batches: batches tagged with root cause artifact and propagation chain
- `generate_ripple_batch`: given active signals, generate AI-ready draft updates for affected artifacts (returns payloads for client LLM to review/stage)
- Enhance `commit_batch` response to include new ripple signals triggered by the commit

### 7. Web UI Foundations for Ripple Visualization

Extend the Phase 3 web UI spec with ripple-aware authoring screens — not
implementing the full UI but specifying the navigation graph and interaction
patterns.

- Canvas view: concentric-circle visualization of strategy graph with signal indicators
- Artifact editor with ripple preview panel (debounced semantic comparison)
- Signal dashboard: live list of active signals with severity and suggested actions
- Ripple resolution flow: guided step-by-step or batch mode for addressing signals

## Impact

- **Affected specs:** `strategy-authoring`, `strategy-semantic`, `strategy-serving`, `strategy-mcp`, `strategy-web`
- **Affected code:**
  - New: `apps/strategy-server/domain/ripple/` (service, signals, propagation, semantic)
  - New: `apps/strategy-server/internal/mcpserver/register_ripple_tools.go`
  - Modified: `apps/strategy-server/internal/mcpserver/server.go` (register new tools)
  - Modified: `apps/strategy-server/internal/mcpserver/lifecycle.go` (signal summary in health_check)
  - Modified: `apps/strategy-server/internal/domain/models.go` (RippleSignal model)
  - New migration: `ripple_signals` table
- **Breaking changes:** None. All new capabilities; existing tools retain current behavior.
- **Dependencies:** Phase 2 semantic signals require Memory integration (existing `internal/memory/` client). Phase 4 web UI depends on Phase 3 completion.
