# Change: Add AIM Cycle Orchestrator with Live Web UI

## Why

The current AIM agent loop requires the user to manually trigger each draft step
(assess → calibrate → apply) and wait through synchronous LLM calls (5–15 s) with
no visible progress. There is no way to run a full AIM cycle unattended or to monitor
what the agent is doing in real time. The orchestrator closes this gap: it executes
the full AIM cycle as a server-side state machine, streams live status to the browser
via SSE, and pauses at each human-gate for review before continuing.

## What Changes

- Add `pkg/orchestration/` — general-purpose workflow engine with two interfaces:
  `Workflow` (callers implement steps) and `Backend` (swappable state store + dispatch)
- Add `pkg/orchestration/pg/` — default `pgBackend`: goroutine pool + Postgres store;
  replaceable with River or another scheduler by swapping the constructor in `main.go`
- Add `domain/aim/workflow.go` — `AIMCycleWorkflow` implements `Workflow`; engine has
  no compile-time dependency on `domain/aim`
- Add migration 022: `orchestration_runs` table with `workflow_name`, `concurrency_key`,
  `input`, `status`, `steps` (JSONB), `error`, timestamps
- Add SSE endpoint `GET /strategies/:id/orchestration/runs/:runID/stream` — Echo native
  SSE, one event per state transition; fanout lives in `Engine`, not in `Backend`
- Add web UI run panel (HTMX + `hx-ext="sse"`) showing full step timeline with live status
- Wire batch commit/discard to resume blocked runs via `engine.Resume(runID, committed)`
- Add `start_aim_cycle` and `get_aim_run` MCP tools (MCP tool count: 111 → 113)
- Concurrency lock: one active run per `(workflow_name, concurrency_key)` — enforced
  by `engine.StartRun` via `backend.ActiveRun` query; returns `ErrAlreadyActive` (→ HTTP 409)
- No new infrastructure dependencies — Postgres-only today; River swap requires only `main.go`

## Impact

- Affected specs: `strategy-aim-orchestrator` (new capability)
- Affected code:
  - `apps/strategy-server/pkg/orchestration/` (new package — core interfaces + Engine + fanout)
  - `apps/strategy-server/pkg/orchestration/pg/` (new package — pgBackend implementation)
  - `apps/strategy-server/domain/aim/workflow.go` (new file — AIMCycleWorkflow)
  - `apps/strategy-server/internal/database/migrations/022_orchestration_runs.sql` (new)
  - `apps/strategy-server/internal/handler/handler_aim_orchestrator.go` (new)
  - `apps/strategy-server/internal/mcpserver/register_aim_orchestrator_tools.go` (new)
  - `apps/strategy-server/internal/ui/aim_run_panel.templ` (new)
  - `apps/strategy-server/internal/handler/handler_batches.go` (resume wiring)
  - `apps/strategy-server/internal/navigation/graph.go` (AimRunPanel node)
