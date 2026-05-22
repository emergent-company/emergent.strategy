## Context

The strategy server runs autonomous multi-chunk skill executions that take 2-10 minutes,
produce staged batches, and consume LLM tokens. A full AIM cycle cascade produces up to
5 sequential batches across multiple skill runs, with human review gates at each step.

Today the internal sequencing is opaque:

- Goroutines fire and forget — no tracking, no error surfacing
- Tokens are discarded at the `llmAIMAdapter` boundary (returns `string`, not `ChatResult`)
- `DraftSummary.InputTokens`/`OutputTokens` fields exist but are never populated
- The web UI has no generating indicators, no cascade progress, no pending batch visibility
- MCP `commit_batch` does not resume AIM orchestrated runs (stuck at `awaiting_human`)
- Context truncation (features dropped from prompts) happens silently

### The Full Cascade (current behavior)

```
Heartbeat (every 5 min)
  → EvaluateAll → maybeCreateProposal
  → User approves proposal (or aim_start_cycle directly)

AIM Orchestrated Cycle (4 steps, 3 human gates):
  Step 1: DraftAssessment        → stages assessment_report batch     → AWAIT HUMAN
  Step 2: DraftCalibration       → stages calibration_memo batch      → AWAIT HUMAN
  Step 3: adapt-strategy         → stages formula + roadmap + LRA     → AWAIT HUMAN
    └─ 4 chunks, sequential, ~2.5 min
  Step 4: SnapshotCycle          → publishes version (no gate)

Post-commit cascade (after Step 3 commit):
  → postCommitRippleAnalysis
    → detects foundation misalignment signals
    → enqueueFoundationDraft (async goroutine)
      → adapt-foundations (4 chunks, ~3.5 min)
        → stages north_star + foundations + analyses + opportunity
        → User must discover via list_pending_batches
  → convergence loop
    → may auto-resolve autonomous-tier signals
    → may auto-publish equilibrium version

Post-foundation-commit cascade:
  → ripple analysis (usually equilibrium — no new cascade)
```

Three stakeholders need transparency:
1. **Humans** (web UI) — need to see where they are in the cascade, which artifacts
   are being drafted, and what needs review
2. **AI agents** (MCP) — need structured run data, run_ids, and cascade state to
   decide whether to wait, retry, or proceed
3. **Operators** (cost management) — need token usage metrics to budget LLM spend

## Goals / Non-Goals

**Goals:**
- Every autonomous skill execution is tracked from start to completion in the database
- Token usage is captured per-call, accumulated per-chunk and per-run, and queryable
- The cascade is visible as a coherent multi-step process, not disconnected events
- Web UI shows live generating indicators, cascade progress, and pending batch prompts
- MCP clients get run_id from `run_skill autonomous` and can poll for progress
- MCP `commit_batch` correctly resumes AIM orchestrated runs
- Silent failures become visible (skill failures, context truncation)

**Non-Goals:**
- Real-time cost estimation with provider-specific pricing (just token counts for now)
- Cancellation of in-progress skill runs (future — requires graceful shutdown)
- Rate limiting or budget enforcement (future — requires policy engine)
- WebSocket replacement of SSE (SSE is sufficient for unidirectional server → client)
- Changing the cascade sequencing itself (this change is purely observability + fixes)

## Decisions

### 1. Skill Run Ledger as a DB table, not just activity events

Activity events are append-only and unstructured (JSONB payload). Querying "what runs
are currently active?" or "total tokens for instance X this month" requires scanning
the full event stream. A dedicated `skill_runs` table with indexed columns for status,
instance, and timestamps gives O(1) lookups.

Activity events continue to be emitted for real-time SSE — the two systems complement
each other. The run ledger is the source of truth; activity events are the notification
channel.

### 2. LLMResult struct, not context values

Tokens could be propagated via `context.Context` values, but this is implicit and
error-prone. An explicit return type change makes the interface contract clear and
catches missing propagation at compile time. The migration cost is manageable — only
two adapter implementations exist (`llmAIMAdapter` and mock in tests).

### 3. SSE over polling for web UI indicators

The activity stream SSE endpoint already exists and pushes events. Adding client-side
EventSource wiring is ~30 lines of JS. Polling would require a new endpoint and puts
unnecessary load on the server. The SSE approach gives sub-second indicator updates.

### 4. Affected artifacts inferred from skill chunk plan, not stored per-run

Rather than storing a list of affected artifact types per run, the UI infers them from
the skill name (adapt-strategy → strategy_formula, roadmap_recipe, LRA; adapt-foundations
→ north_star, strategy_foundations, insight_analyses, insight_opportunity). This keeps the
run ledger simple and avoids coupling it to the chunk plan structure.

### 5. Token accumulation includes retries

When a chunk fails validation and retries, the retry tokens are added to the total.
This reflects actual LLM cost. The chunk_log JSONB records per-attempt token counts
for debugging.

### 6. Cascade tracker as an instance-level panel, not per-artifact

The cascade is a system-level process affecting multiple artifacts. Showing it as an
instance-level panel (similar to the existing AIM run panel) makes the sequencing clear.
Individual artifact cards get simple generating badges; the full cascade context lives
in one place.

### 7. MCP commit_batch resumes orchestration via batch_id lookup

Rather than requiring MCP callers to know about orchestration, the `commit_batch`
handler checks whether any active orchestration run is waiting for this batch_id
and auto-resumes it. This matches the web UI behavior at `handler_aim_agent.go:280-295`
and makes the MCP and web UI paths equivalent.

### 8. Trigger context stored in run ledger

Each run records how it was triggered: `manual` (run_skill MCP tool), `ripple`
(enqueueFoundationDraft after commit), or `aim_cycle` (orchestrated workflow step).
For ripple-triggered runs, the triggering signal IDs are stored. This enables the
cascade tracker to explain "why is this running?"

## Data Model

### skill_runs table

```sql
CREATE TABLE skill_runs (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    instance_id         UUID NOT NULL REFERENCES strategy_instances(id) ON DELETE CASCADE,
    skill_name          TEXT NOT NULL,
    status              TEXT NOT NULL DEFAULT 'running',  -- running, completed, failed
    trigger             TEXT NOT NULL DEFAULT 'manual',   -- manual, ripple, aim_cycle
    trigger_context     JSONB NOT NULL DEFAULT '{}'::jsonb,
    started_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at        TIMESTAMPTZ,
    chunk_count         INT NOT NULL DEFAULT 0,
    chunks_completed    INT NOT NULL DEFAULT 0,
    total_input_tokens  INT NOT NULL DEFAULT 0,
    total_output_tokens INT NOT NULL DEFAULT 0,
    model               TEXT NOT NULL DEFAULT '',
    batch_id            UUID,
    error               TEXT,
    chunk_log           JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_skill_runs_instance_status ON skill_runs(instance_id, status);
CREATE INDEX idx_skill_runs_instance_created ON skill_runs(instance_id, created_at DESC);
```

### trigger_context JSONB examples

```json
// manual trigger (run_skill MCP tool)
{}

// ripple trigger (enqueueFoundationDraft)
{
  "signal_ids": ["uuid-1", "uuid-2"],
  "authority_tier": "gated",
  "changed_keys": ["strategy-formula", "roadmap-recipe"]
}

// aim_cycle trigger (orchestrated workflow)
{
  "run_id": "orchestration-run-uuid",
  "step_name": "adapt_strategy"
}
```

### chunk_log JSONB structure

```json
[
  {
    "chunk": 1,
    "output_key": "strategy_formula",
    "artifact_type": "strategy_formula",
    "status": "staged",
    "started_at": "2026-05-22T11:20:00Z",
    "completed_at": "2026-05-22T11:20:45Z",
    "attempts": 2,
    "input_tokens": 4200,
    "output_tokens": 1800,
    "errors": ["maxLength: got 173, want 150"],
    "context_truncated": false,
    "dropped_features": 0
  }
]
```

## Risks / Trade-offs

- **Interface change (`LLMClient`)** — breaking change to two interfaces. Mitigated by
  small surface area (two implementations + test mocks). All in one repo, no external
  consumers.
- **SSE connection management** — EventSource connections are long-lived. With 25
  instances and multiple browser tabs, connection count could grow. Mitigated by the
  existing keepalive/timeout pattern and single-instance deployment.
- **Chunk plan coupling** — inferring affected artifacts from skill name means adding a
  new skill requires updating the UI mapping. Acceptable — the mapping is a small static
  map.
- **MCP orchestration resume** — auto-resuming on any batch commit could be surprising if
  the user commits an unrelated batch while an AIM run is waiting. Mitigated by matching
  on exact batch_id, not just instance.

## Migration Plan

1. Add `025_skill_runs.sql` migration (additive, no existing data affected)
2. Update `LLMClient` interfaces and adapter (compile-time breakage, fix all call sites)
3. Wire run ledger into executor (new writes, no existing behavior changed)
4. Fix MCP commit_batch to resume orchestration runs (behavior fix)
5. Add MCP observability tools (additive)
6. Wire SSE client and cascade tracker in UI (additive)
7. All changes are backward-compatible for MCP clients — existing tool responses get
   new optional fields

## Open Questions

- Should `get_llm_usage` include a cost estimate based on configurable per-token pricing,
  or just raw token counts? Recommendation: start with raw counts, add pricing later.
- Should the cascade tracker be visible on the global dashboard (cross-instance), or
  only within an instance? Recommendation: instance-scoped first.
- Should context truncation (dropped features) be surfaced as a warning in the cascade
  tracker? Recommendation: yes, as an informational note — "16 features dropped from
  context due to token budget."
