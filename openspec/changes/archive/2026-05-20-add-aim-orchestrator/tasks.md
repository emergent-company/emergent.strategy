# Tasks: Add AIM Cycle Orchestrator

All tasks target `apps/strategy-server/`. epf-cli is frozen — no changes there.

## 1. Database Migration

- [x] 1.1 Write `022_orchestration_runs.sql` — create `orchestration_runs` table:
      `id UUID PK`, `workflow_name TEXT NOT NULL`, `concurrency_key TEXT NOT NULL`,
      `input JSONB NOT NULL DEFAULT '{}'`, `status TEXT NOT NULL CHECK IN
      ('pending','running','awaiting_human','completed','aborted','failed')`,
      `current_step TEXT`, `steps JSONB NOT NULL DEFAULT '[]'`,
      `error TEXT`, `created_at TIMESTAMPTZ`, `updated_at TIMESTAMPTZ`
- [x] 1.2 Add index on `(workflow_name, concurrency_key, status)` for concurrency lock query
- [x] 1.3 Apply migration via `task dev-up` and verify schema with `\d orchestration_runs`

## 2. Core Package — `pkg/orchestration`

- [x] 2.1 Define types in `pkg/orchestration/types.go`: `Run`, `RunStatus`, `StepLog`,
      `StepResult`, `StepFunc`, `Step`, `Event`, `EventType`, `ErrAlreadyActive`
- [x] 2.2 Define `Workflow` interface in `pkg/orchestration/workflow.go`:
      `Name() string`, `Steps() []Step`, `ConcurrencyKey(run *Run) string`
- [x] 2.3 Define `Backend` interface in `pkg/orchestration/backend.go`:
      `Start(ctx)`, `Stop(ctx)`, `Enqueue(ctx, run)`, `Resume(ctx, runID, committed)`,
      `GetRun(ctx, runID)`, `ListRuns(ctx, workflowName, concurrencyKey)`,
      `ActiveRun(ctx, workflowName, concurrencyKey)`
- [x] 2.4 Implement SSE fanout in `pkg/orchestration/fanout.go`:
      `Subscribe(runID) <-chan Event`, `Unsubscribe(runID, ch)`,
      `Publish(runID, Event)` — buffered channels size 16, drop-on-full
- [x] 2.5 Implement `Engine` in `pkg/orchestration/engine.go`:
      `New(backend Backend) *Engine`, `Register(w Workflow)`,
      `Start(ctx)`, `Stop(ctx)`,
      `StartRun(ctx, workflowName, concurrencyKey, input)`,
      `Resume(ctx, runID, committed)`,
      `GetRun(ctx, runID)`, `ListRuns(ctx, workflowName, concurrencyKey)`,
      `Subscribe(runID)`, `Unsubscribe(runID, ch)` —
      Engine delegates persistence + dispatch to `Backend`; SSE fanout stays in Engine
- [x] 2.6 Write unit tests for `Engine` using a mock `Backend` and mock `Workflow`:
      start run, concurrency lock, resume-commit, resume-discard, SSE event flow

## 3. Postgres Backend — `pkg/orchestration/pg`

- [x] 3.1 Implement `pgBackend` struct in `pkg/orchestration/pg/backend.go`
      satisfying the `Backend` interface using `uptrace/bun` + goroutine pool
- [x] 3.2 Implement `pgStore` in `pkg/orchestration/pg/store.go`:
      CRUD on `orchestration_runs` (insert, update status/step/steps, select)
- [x] 3.3 Implement goroutine pool in `pkg/orchestration/pg/pool.go`: fixed-size
      workers (default 4), `runChannels map[uuid.UUID]chan bool`, internal
      `runLoop` that calls the registered `Workflow.Steps()` sequentially
- [x] 3.4 Implement `Start(ctx)`: mark stale `pending/running/awaiting_human`
      runs as `failed` with `error='server restart'`; start workers
- [x] 3.5 Implement `Stop(ctx)`: drain queued runs, close pool channels
- [x] 3.6 Write unit tests for `pgBackend` using a real Postgres connection
      (testcontainers or the existing test DB setup)

## 4. AIM Workflow — `domain/aim/workflow.go`

- [x] 4.1 Implement `AIMCycleWorkflow` struct satisfying `pkg/orchestration.Workflow`
- [x] 4.2 Define four steps: `draft_assessment` (HumanGate: true),
      `draft_calibration` (HumanGate: true), `apply_calibration` (HumanGate: true),
      `snapshot_cycle` (HumanGate: false)
- [x] 4.3 Each `StepFunc` delegates to the existing `aim.Service` method and
      returns `StepResult{BatchID: ...}` for gated steps
- [x] 4.4 `ConcurrencyKey` extracts `instance_id` from `run.Input`
- [x] 4.5 Write unit tests for `AIMCycleWorkflow` steps (mock aim.Service)

## 5. HTTP Handlers — `internal/handler/handler_aim_orchestrator.go`

- [x] 5.1 `POST /strategies/:id/aim/runs` — calls `engine.StartRun("aim_cycle", instanceID, input)`,
      returns 201 with run ID; maps `ErrAlreadyActive` to 409; redirects browser to run panel
- [x] 5.2 `GET /strategies/:id/aim/runs/:runID` — loads run via `engine.GetRun`,
      renders `aim_run_panel.templ`
- [x] 5.3 `GET /strategies/:id/aim/runs/:runID/stream` — Echo SSE endpoint;
      calls `engine.Subscribe(runID)`; writes events as `data: <json>\n\n`;
      calls `engine.Unsubscribe` on `context.Done()`
- [x] 5.4 Wire resume in `handler_aim_agent.go` — after batch commit/discard, query
      `orchestration_runs` for any `awaiting_human` run on the same instance whose
      current step's `batch_id` matches; if found call `engine.Resume(runID, committed)`
- [x] 5.5 Register all new routes in `handler.go` with
      `WithOrchestration(engine)` option
- [x] 5.6 Add `AimRunPanel` node to `navigation/graph.go` (WebRoute: true)

## 6. Web UI — `internal/ui/aim_run_panel.templ`

- [x] 6.1 Build `aimRunPanel` component: run header (workflow name, status badge,
      started_at), full step timeline with per-step icons
      (pending / running spinner / awaiting_human / done / failed / aborted),
      "Review Draft" link when step is `awaiting_human`
- [x] 6.2 Add SSE subscription: `hx-ext="sse"`, `sse-connect="…/stream"`,
      `sse-swap` targets the timeline `<div>` to re-render on each event
- [x] 6.3 Add "Start AIM Cycle" button to AIM landing page — visible when no active
      run exists; HTMX POST to `POST /strategies/:id/aim/runs`
- [x] 6.4 Add active run summary card to AIM landing page (SSE-driven update or
      HTMX poll fallback) showing current step when a run is in progress
- [x] 6.5 Regenerate templ: `go run github.com/a-h/templ/cmd/templ@v0.3.1001 generate ./internal/ui/`
- [x] 6.6 Build binary: `go build -o /tmp/strategy-server-new .`

## 7. MCP Tools — `internal/mcpserver/register_aim_orchestrator_tools.go`

- [x] 7.1 Register `aim_start_cycle` — calls `engine.StartRun("aim_cycle", ...)`,
      returns `{ run_id, status }`; structured error on `ErrAlreadyActive`
- [x] 7.2 Register `aim_get_run` — calls `engine.GetRun`, returns full run
      record with step log
- [x] 7.3 Add both tools to MCP registration (tool count: 111 → 113)
- [x] 7.4 Update `internal/agent/knowledge.go` with orchestration topic
- [x] 7.5 Update `internal/agent/routing.go` with 2 new routing entries

## 8. Validation & Tests

- [x] 8.1 Run `go test ./...` — all existing tests pass; new packages pass (re-verified after all changes)
- [x] 8.2 E2E (chromedp): start AIM cycle on 21st instance; verify SSE events stream;
      step timeline updates live in browser — Test82_StartCycle_RunPanelRendersAndSSEConnects
- [x] 8.3 E2E (chromedp): commit at assessment gate; verify orchestrator advances
      to calibration step automatically — Test83_CommitAssessment_AdvancesToCalibration
- [x] 8.4 E2E (chromedp): discard at calibration gate; verify run transitions to `aborted`
      — Test84_DiscardAtCalibration_RunAborted
- [x] 8.5 E2E (chromedp): start two cycles on same instance; verify second is rejected
      (303 redirect to /aim) — Test85_DuplicateRun_Rejected
- [x] 8.6 Unit (pgBackend): restart server with active run; verify run transitions to `failed`
      — TestPgBackend_MarkStaleFailed (E2E restart skipped — requires process management)

## 9. Documentation

- [x] 9.1 Update `apps/strategy-server/AGENTS.md`: add `pkg/orchestration/` and
      `pkg/orchestration/pg/` package descriptions, new MCP tool count (113),
      new routes, migration 022
- [x] 9.2 Note: to swap to River backend in future, replace `pg.NewBackend(db, cfg)`
      with `river.NewBackend(client, cfg)` in `cmd_serve.go` — no other files change
