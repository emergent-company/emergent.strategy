## Phase 1: Structural Ripple Foundation

### 1. Data Model and Migration

- [ ] 1.1 Add `RippleSignal` model to `internal/domain/models.go` (ID, InstanceID, SignalType, Severity, Status, SourceKey, TargetKey, Description, Suggestion, Metadata JSONB, BatchID, CreatedAt, ResolvedAt, CreatedBy)
- [ ] 1.2 Create migration `015_ripple_signals.sql`: `ripple_signals` table with FK to `strategy_instances`, indexes on `(instance_id, status)` and `(instance_id, target_key)`
- [ ] 1.3 Add `batch_metadata` JSONB column to `strategy_mutations` table (for root_cause_key and ripple_chain on ripple batches)

### 2. Ripple Domain Service

- [ ] 2.1 Create `domain/ripple/service.go` with `RippleService` struct (depends on DB, strategy service, optional Memory client)
- [ ] 2.2 Implement `CreateSignal(ctx, signal)` — insert into `ripple_signals`
- [ ] 2.3 Implement `ListSignals(ctx, instanceID, opts)` — list active signals with filters (type, severity, status, target_key)
- [ ] 2.4 Implement `AcknowledgeSignal(ctx, signalID)` — set status to `acknowledged`
- [ ] 2.5 Implement `ResolveSignal(ctx, signalID, batchID)` — set status to `resolved`, link to resolving batch
- [ ] 2.6 Implement `DismissSignal(ctx, signalID, reason)` — set status to `dismissed` with reason in metadata
- [ ] 2.7 Implement `ResolveByTarget(ctx, instanceID, targetKey)` — auto-resolve active signals for a target when it's updated
- [ ] 2.8 Write unit tests for signal CRUD lifecycle (create, list, acknowledge, resolve, dismiss)

### 3. Structural Propagation Engine

- [ ] 3.1 Create `domain/ripple/propagation.go` with `AnalyzeStructuralRipple(ctx, instanceID, changedKey, changedType)` function
- [ ] 3.2 Implement downstream walk: given a changed artifact, find all artifacts that reference it via `strategy_relationships` (contributes_to, depends_on, tests_assumption, enables, in_tracks)
- [ ] 3.3 Implement upstream walk: given a changed artifact, find all artifacts it references (what does this artifact depend on / contribute to)
- [ ] 3.4 Implement staleness detection: for each connected artifact, compare `updated_at` timestamps — if downstream artifact is older than upstream change, mark as stale
- [ ] 3.5 Implement orphan detection: find value model paths with zero `contributes_to` incoming edges
- [ ] 3.6 Implement untested assumption detection: find assumptions with zero `tests_assumption` incoming edges
- [ ] 3.7 Implement cross-track gap detection: for each track in the roadmap, check if features exist in the corresponding value model
- [ ] 3.8 Return `StructuralRippleReport` struct: affected artifacts (with staleness duration, relationship type, track), orphaned paths, untested assumptions, cross-track gaps
- [ ] 3.9 Write unit tests for propagation (downstream walk, staleness, orphan detection, cross-track gaps)

### 4. Propose Change Tool

- [ ] 4.1 Create `internal/mcpserver/register_ripple_tools.go`
- [ ] 4.2 Implement `propose_change` MCP tool: accepts `instance_id`, `artifact_key`, `artifact_type`, `payload` (the proposed new content); runs `AnalyzeStructuralRipple`; returns impact report with affected artifacts, severity classification, and suggested actions
- [ ] 4.3 Implement `coherence_check` MCP tool: accepts `instance_id`; runs full structural analysis (no specific change — analyzes current state); returns all active misalignments
- [ ] 4.4 Write integration tests for both tools

### 5. Signal Management Tools

- [ ] 5.1 Implement `list_signals` MCP tool: accepts `instance_id`, optional `signal_type`, `severity`, `status` filters; returns paginated signal list
- [ ] 5.2 Implement `acknowledge_signal` MCP tool: accepts `signal_id`; returns updated signal
- [ ] 5.3 Implement `resolve_signal` MCP tool: accepts `signal_id`, optional `batch_id`; returns updated signal
- [ ] 5.4 Implement `dismiss_signal` MCP tool: accepts `signal_id`, `reason`; returns updated signal
- [ ] 5.5 Write integration tests for signal lifecycle tools

### 6. Commit Batch Enhancement

- [ ] 6.1 After `CommitBatch` in MCP handler, run `AnalyzeStructuralRipple` for each committed artifact
- [ ] 6.2 Auto-resolve any existing signals whose `target_key` matches a committed artifact
- [ ] 6.3 Create new signals for newly detected misalignments
- [ ] 6.4 Include signal summary in `commit_batch` response: `ripple_signals: {new: N, resolved: N, active_total: N}`
- [ ] 6.5 Write tests for post-commit signal generation and auto-resolution

### 7. Health Check Enhancement

- [ ] 7.1 Add signal summary to `health_check` response: active signal count by severity, most critical signals (top 3)
- [ ] 7.2 Feed signal count into lifecycle mode detection: 10+ active critical signals → `recalibration_needed`
- [ ] 7.3 Write tests for signal-aware lifecycle detection

---

## Phase 2: Semantic Ripple via Memory

### 8. Semantic Change Classification

- [ ] 8.1 Create `domain/ripple/semantic.go`
- [ ] 8.2 Implement `ClassifySemanticChange(ctx, instanceID, artifactKey, oldPayload, newPayload)`: compute embeddings via Memory for old and new content, return cosine distance and classification (trivial/minor/significant/major)
- [ ] 8.3 Define configurable thresholds per artifact type (north_star more sensitive than feature_definition)
- [ ] 8.4 Integrate with `commit_batch`: after commit, classify each mutation's semantic change; skip ripple analysis for trivial changes
- [ ] 8.5 Write tests with mock Memory client for classification logic

### 9. Semantic Drift Detection

- [ ] 9.1 Implement `DetectSemanticDrift(ctx, instanceID, artifactKey)`: compare artifact's content embedding against each of its declared `contributes_to` value path embeddings; emit `drift` signal if cosine similarity drops below threshold
- [ ] 9.2 Implement `DetectCrossTrackTension(ctx, instanceID)`: compute per-track embedding centroids from all artifacts in each track; emit `tension` signal if tracks that should be aligned show high divergence
- [ ] 9.3 Implement `DetectEmergentClustering(ctx, instanceID)`: find pairs of artifacts with high embedding similarity (> 0.85) that have no `strategy_relationship` connecting them; emit `clustering` signal suggesting relationship
- [ ] 9.4 Implement `DetectAssumptionStaleness(ctx, instanceID)`: compare assumption text embeddings against recent AIM evidence embeddings; emit `staleness` signal if recent evidence is semantically close but directionally different
- [ ] 9.5 Write tests for each semantic detection function with mock Memory responses

### 10. Full Semantic Ripple Integration

- [ ] 10.1 Integrate semantic analysis into `AnalyzeStructuralRipple` — when Memory is available, enrich structural signals with semantic distance data
- [ ] 10.2 Integrate semantic change classification into post-commit flow — semantic signals computed async, stored when ready
- [ ] 10.3 Add `semantic_distance` and `semantic_classification` fields to signal metadata
- [ ] 10.4 Enhance `coherence_check` to include semantic analysis when Memory available
- [ ] 10.5 Update `propose_change` to include semantic impact preview when Memory available
- [ ] 10.6 Write end-to-end tests: commit a North Star change → verify structural + semantic signals emitted

---

## Phase 3: AI-Assisted Ripple Resolution

### 11. Ripple Batch Generation

- [ ] 11.1 Implement `generate_ripple_batch` MCP tool: accepts `instance_id` and optional `signal_ids` (defaults to all active critical+warning signals); returns structured context for each affected artifact: current payload, signal details, relationship context, suggested focus areas
- [ ] 11.2 The tool does NOT generate draft content — it returns the context the client LLM needs to generate drafts
- [ ] 11.3 Include `root_cause` metadata so the client can tag the batch appropriately
- [ ] 11.4 Support `scope` parameter: `immediate` (direct neighbors only), `full` (entire subgraph)
- [ ] 11.5 Write tests for context assembly

### 12. Ripple Batch Metadata

- [ ] 12.1 Enhance `describe_batch` to accept optional `root_cause_key` and `ripple_chain` fields
- [ ] 12.2 Store ripple metadata in `batch_metadata` JSONB on `strategy_mutations`
- [ ] 12.3 Show ripple context in `list_pending_batches` response (root cause, chain length)
- [ ] 12.4 When a ripple batch is committed, auto-resolve signals whose target_key appears in the batch
- [ ] 12.5 Write tests for ripple batch lifecycle

### 13. Knowledge Base and Agent Prompt Updates

- [ ] 13.1 Update `internal/agent/knowledge.go` with ripple workflow topic: when to use `propose_change`, how to interpret signals, ripple batch workflow
- [ ] 13.2 Add ripple-related routing entries to `internal/agent/routing.go`: "check impact", "coherence", "ripple", "what does this affect" → `propose_change` or `coherence_check`
- [ ] 13.3 Update server instructions to mention ripple signals in the orientation checklist
- [ ] 13.4 Write routing test cases for ripple-related intents

---

## Phase 4: Web UI Ripple Screens

### 14. Canvas View (Strategy Graph Visualization)

- [ ] 14.1 Add `/instances/:id/canvas` route to navigation graph
- [ ] 14.2 Implement concentric-circle SVG layout: North Star at center, strategy foundations, roadmap, value models, features in outer rings
- [ ] 14.3 Color-code nodes by track (Product, Strategy, OrgOps, Commercial)
- [ ] 14.4 Show active signals as glow/pulse indicators on affected nodes
- [ ] 14.5 Click node → navigate to artifact detail or editor
- [ ] 14.6 Show relationship edges between nodes on hover

### 15. Ripple Preview Panel

- [ ] 15.1 Add SSE endpoint `/instances/:id/ripple/preview` that accepts draft content and streams ripple analysis results
- [ ] 15.2 Integrate preview panel into artifact edit screens (right sidebar)
- [ ] 15.3 Debounce: only trigger preview when user pauses editing (500ms) or clicks "Preview Impact"
- [ ] 15.4 Show structural signals immediately, stream semantic signals as they compute
- [ ] 15.5 Classify change as trivial/minor/significant/major with visual indicator

### 16. Signal Dashboard

- [ ] 16.1 Add `/instances/:id/signals` route
- [ ] 16.2 List active signals grouped by severity (critical → warning → info)
- [ ] 16.3 Each signal shows: source artifact, target artifact, description, suggested action, age
- [ ] 16.4 Action buttons: Acknowledge, Dismiss (with reason modal), Address (opens ripple resolution)
- [ ] 16.5 Filter by signal type, severity, track, status

### 17. Ripple Resolution Flow

- [ ] 17.1 Add `/instances/:id/ripple/resolve` route
- [ ] 17.2 Guided mode: step through affected artifacts one by one, showing current content, AI suggestion, accept/edit/skip controls
- [ ] 17.3 Batch mode: show all affected artifacts as a checklist with diff previews, select which to include in commit
- [ ] 17.4 Both modes stage changes into a single ripple batch
- [ ] 17.5 Show root cause context throughout ("These changes stem from: North Star vision pivot")
