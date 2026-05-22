# Change: Operational Transparency for Autonomous Skill Execution

## Why

The strategy server now runs multi-chunk, multi-minute skill executions autonomously
(adapt-strategy: ~2.5 min, adapt-foundations: ~3.5 min, full AIM cycle: ~10 min with
human gates). A full cascade — from AIM cycle initiation through foundation alignment —
produces up to 5 sequential batches, each requiring human review. Today, the internal
sequencing of this cascade is invisible:

- **No run tracking**: Autonomous skill runs are fire-and-forget goroutines. If one
  fails silently, the user just never sees a batch appear — no error, no record.
- **No token visibility**: The LLM adapter discards all token counts. `DraftSummary`
  and `SkillResult` have token fields that are always zero. No cost management is
  possible.
- **No artifact state indicators**: The web UI shows no visual cue when an artifact is
  being drafted, has a pending batch, or is part of an in-progress cascade.
- **No cascade visibility**: Users cannot see where they are in the multi-step AIM →
  adapt-strategy → adapt-foundations chain, or what comes next.
- **MCP orchestration gap**: Committing a batch via MCP while an AIM orchestrated cycle
  is at `awaiting_human` does not resume the cycle — the run stays stuck.
- **Silent failures**: Context truncation (features dropped from prompts) and validation
  retries happen without any user-facing indication.

## What Changes

### 1. Skill Run Ledger (new domain package)

A `domain/skillrun/` package that persists structured records of every autonomous skill
execution. Each run tracks: skill name, instance, status (running/completed/failed),
start/end times, chunk progress, total tokens (input + output), model used, batch ID
produced, and trigger context (manual, ripple, aim_cycle). This replaces the current
fire-and-forget goroutine pattern with a trackable, queryable job.

### 2. LLM Token Propagation

Widen the `LLMClient` interfaces (`skillexec.LLMClient`, `aim.LLMClient`) to return
`LLMResult{Content string, InputTokens int, OutputTokens int}` instead of
`(string, error)`. The `llmAIMAdapter` in `cmd_serve.go` stops discarding token data.
`SkillResult` and `DraftSummary` get their token fields populated. Token totals are
accumulated per skill run and per chunk in the run ledger.

### 3. MCP Observability Tools

New MCP tools for AI agents to understand and manage autonomous operations:

- `list_skill_runs` — paginated list of runs for an instance (status, skill, duration,
  tokens, batch_id)
- `get_skill_run` — full detail including per-chunk progress, errors, and trigger
  context
- `get_llm_usage` — aggregated token usage by instance, date range, skill

Enhance existing `run_skill` autonomous response to include a `run_id` for tracking.
Enhance `list_pending_batches` to include `source_skill` and `source_run_id` when a
batch was produced by an autonomous skill.

### 4. MCP Orchestration Resume

Fix the gap where MCP `commit_batch` does not resume AIM orchestrated runs. After a
batch commit, check whether an active orchestration run is awaiting human review for
that batch, and resume it. This makes the AIM cycle work correctly regardless of
whether the user commits via the web UI or via MCP.

### 5. Web UI Cascade Tracker

A new persistent panel in the instance layout that shows the current state of the
autonomous strategy loop when active. Tracks the full cascade:

- AIM cycle step progress (reuses existing AIM run panel pattern)
- Active skill runs with chunk-by-chunk progress
- Pending batches awaiting review (with "Review draft" links)
- Completed runs with token usage summary
- Downstream cascading effects ("After you commit, adapt-foundations will run
  automatically")

### 6. Web UI Artifact State Indicators

When a skill run is in progress that targets an artifact, that artifact's card and
detail view show a "generating" indicator (pulsing sparkle icon + "AI draft in progress"
label). When a staged batch exists for an artifact, show a review prompt banner.

Specific indicators:
- **READY/FIRE phase overview cards**: pulsing generating badge during skill runs
- **Artifact detail view**: header banner with progress and elapsed time
- **Pending batch banner**: "AI draft available for review" with link to draft-review

### 7. Activity Stream Client Wiring

The SSE endpoint at `/strategies/:id/activity/stream` already exists server-side but
has no client consumer. Wire it into the web UI shell so that `skill.started`,
`skill.chunk_staged`, `skill.completed`, and `skill.failed` events trigger live
indicator updates on affected artifact cards and the cascade tracker without page
reload.

## Impact

- Affected specs: `strategy-authoring`, `strategy-web`, `strategy-mcp`
- Affected code:
  - New: `domain/skillrun/` (run ledger)
  - New migration: `025_skill_runs.sql`
  - Modified: `domain/skillexec/executor.go` (token tracking, run ledger writes)
  - Modified: `domain/aim/service.go` (LLMClient interface, DraftSummary population)
  - Modified: `cmd_serve.go` (llmAIMAdapter returns LLMResult)
  - Modified: `internal/mcpserver/register_pack_tools.go` (run_id in response, new tools)
  - Modified: `internal/mcpserver/server.go` (commit_batch resumes orchestration)
  - Modified: `internal/ui/*.templ` (generating indicators, cascade tracker, SSE wiring)
  - Modified: `internal/handler/` (new routes for cascade tracker)
