# Design: AIM Cycle Orchestrator

## Context

The AIM agent loop (`add-aim-agent-loop`) ships three synchronous draft-and-review
steps: DraftAssessment → DraftCalibration → ApplyCalibration. Each step is triggered
manually by the user and blocks the browser for 5–15 s with no feedback. There is
no way to run a full cycle unattended or monitor progress in real time.

The orchestrator closes this gap. It is deliberately designed as a **general-purpose
workflow engine** with goals beyond AIM:

1. **Replaceability** — the goroutine-pool + Postgres backend can be swapped for
   River, Temporal, or another scheduler without changing callers or workflows.
2. **Reusability** — any domain package in strategy-server can register a workflow
   (not just AIM). The engine must not foreclose use for artifact authoring,
   document generation, or other multi-step agent-driven processes.
3. **Sub-agent readiness** — steps must be able to delegate to external agents or
   skills in the future without requiring changes to the engine or backend.
4. **Cross-product alignment** — the design must be consistent with the
   `add-epf-cli-output-generator-support` model, where AI agents execute generation
   tasks guided by skill/wizard instructions. The orchestrator is a plausible future
   host for those generator workflows in strategy-server.

Constraints:
- Single Go process, single Postgres instance — no Redis, no Temporal, no additional
  infra today
- Human-gate pattern: the orchestrator MUST pause after each step and wait for the
  user to commit or discard before continuing
- The web UI is HTMX + Templ + DaisyUI v5; no client-side JS framework
- `AUTH_ENABLED=false`; Zitadel dormant — no user identity for audit during this phase

---

## Goals / Non-Goals

**Goals:**
- Provide a reusable `pkg/orchestration` package with clean interfaces
- Run the AIM cycle as a concrete workflow registered against that package
- Stream step-by-step progress to the browser via SSE
- Pause at each human-gate and resume on commit/discard
- Enforce one active run per workflow-type per entity (e.g. one AIM cycle per instance)
- Allow the backend (state store + worker dispatch) to be replaced without touching callers
- Design `StepFunc` and `StepResult` so sub-agent dispatch can be added without
  breaking existing steps

**Non-Goals (now, not never):**
- Sub-agent spawning (architecture must not foreclose it — see decision below)
- Scheduled/cron-triggered cycles (River swap handles this when needed)
- Parallel multi-instance batch execution
- Distributed execution across multiple processes
- Full audit identity (deferred until Zitadel is active)
- Direct integration with epf-cli generators (strategy-server is a separate binary;
  the conceptual model is shared, not the code)

---

## Package Location

`pkg/orchestration/` — exported, reusable. Consistent with `pkg/apperror` and
`pkg/logger`. Domain-specific workflow registrations live in their own packages
(`domain/aim/workflow.go`, etc.) — the core package has no domain imports.

---

## Core Interfaces

### `Workflow`

Callers implement `Workflow` to define a named, ordered sequence of steps:

```go
// pkg/orchestration/workflow.go

type StepResult struct {
    // BatchID is non-empty when this step staged a batch requiring human review.
    BatchID string
    // Artifact is an optional free-form output reference (document path, URL,
    // external ID) for steps that produce something other than a staged batch.
    // Stored in StepLog.Meta["artifact"]. Not used by AIM today.
    Artifact string
    // Meta holds arbitrary step output for the step log (serialised to JSONB).
    Meta map[string]any
}

type StepFunc func(ctx context.Context, run *Run) (StepResult, error)

type Step struct {
    Name      string   // unique within the workflow, e.g. "draft_assessment"
    Execute   StepFunc // called by the worker
    // HumanGate: if true, the run pauses after Execute until commit/discard.
    // Execute must return a non-empty BatchID when HumanGate is true.
    HumanGate bool
}

type Workflow interface {
    Name() string                        // unique type name, e.g. "aim_cycle"
    Steps() []Step                       // ordered list of steps
    ConcurrencyKey(run *Run) string      // one-active-run lock key (e.g. instance UUID)
}
```

**Note on `StepFunc` and sub-agent readiness:**
`StepFunc` is a plain Go function — today's steps call domain services directly.
Sub-agent dispatch is the responsibility of the `StepFunc` implementation, not the
engine. A future step that spawns an agent would do so inside its `Execute` function
(e.g. calling an `AgentDispatcher` injected into the workflow struct at construction
time). The engine never calls agents directly. This keeps `pkg/orchestration` free of
LLM or agent dependencies, which is correct: the engine is infrastructure, not AI.

### `Backend`

The `Backend` interface abstracts both the state store and the worker dispatch
mechanism. Today's implementation is `pgBackend` (goroutine pool + Postgres). A
future `riverBackend` would implement the same interface using River's job queue.

```go
// pkg/orchestration/backend.go

type Backend interface {
    Start(ctx context.Context, registry map[string]Workflow) error
    Stop(ctx context.Context) error
    Enqueue(ctx context.Context, run *Run) error
    Resume(ctx context.Context, runID uuid.UUID, committed bool) error
    GetRun(ctx context.Context, runID uuid.UUID) (*Run, error)
    ListRuns(ctx context.Context, workflowName, concurrencyKey string) ([]*Run, error)
    ActiveRun(ctx context.Context, workflowName, concurrencyKey string) (*Run, error)
}

// BatchFinder is an optional backend interface for looking up awaiting_human runs
// by the batch ID currently under review.
type BatchFinder interface {
    FindRunByBatch(ctx context.Context, batchID string) (*Run, error)
}

// PublisherSetter is an optional interface backends implement to receive the
// engine's event publisher. Avoids circular imports.
type PublisherSetter interface {
    SetPublisher(p interface{ Publish(Event) })
}
```

### `Engine`

`Engine` is the top-level object callers hold. It wires a `Backend` to a registry of
`Workflow` implementations and provides the public API used by HTTP handlers and MCP tools.
SSE fanout lives in `Engine`, not `Backend` — it is a UI concern, not a persistence
concern, and must work unchanged across backend swaps.

```go
func New(backend Backend) *Engine
func (e *Engine) Register(w Workflow)
func (e *Engine) Start(ctx context.Context) error
func (e *Engine) Stop(ctx context.Context) error
func (e *Engine) StartRun(ctx context.Context, workflowName, concurrencyKey string, input map[string]any) (*Run, error)
func (e *Engine) Resume(ctx context.Context, runID uuid.UUID, committed bool) error
func (e *Engine) GetRun(ctx context.Context, runID uuid.UUID) (*Run, error)
func (e *Engine) ListRuns(ctx context.Context, workflowName, concurrencyKey string) ([]*Run, error)
func (e *Engine) ActiveRun(ctx context.Context, workflowName, concurrencyKey string) (*Run, error)
func (e *Engine) FindRunByBatch(ctx context.Context, batchID string) (*Run, error)
func (e *Engine) Subscribe(runID uuid.UUID) <-chan Event
func (e *Engine) Unsubscribe(runID uuid.UUID, ch <-chan Event)
func (e *Engine) Publish(ev Event)  // called by backend workers
```

---

## Key Design Decisions

### Decision 1: Backend replaceability

**Decision:** The `Backend` interface is the only coupling point between the engine
and its persistence/dispatch mechanism. `cmd_serve.go` is the only file that names
a concrete backend type. All other files depend only on `orchestration.Backend`.

**Swap cost:** Replace `pg.NewBackend(db, cfg)` with `river.NewBackend(client, cfg)`
in `cmd_serve.go`. No other files change.

**What River would add:** Scheduled/cron-triggered runs, built-in retry with backoff,
durable job persistence across restarts (instead of marking stale runs failed).
River is the preferred upgrade path when any of those are needed.

**What this means for the current pgBackend:** It is intentionally simple. It does
not retry failed steps. Process restart marks in-flight runs as `failed`; the user
re-triggers. This is acceptable for the current single-process deployment model.

### Decision 2: Sub-agent spawning

**Decision:** The engine does not spawn agents. Sub-agent dispatch is the
responsibility of the `StepFunc` implementation.

**Rationale:** The engine is infrastructure — it knows about steps, state, and
events. It does not know about LLMs, skills, or agents. Injecting agent dispatch
into the engine would couple it to AI infrastructure that changes frequently and
varies by workflow.

**How a step spawns a sub-agent (future pattern):**

```go
// domain/documents/workflow.go (hypothetical future workflow)

type SkattefunnWorkflow struct {
    svc      *Service
    agents   AgentDispatcher   // injected at construction time
    skills   SkillRunner       // injected at construction time
}

func (w *SkattefunnWorkflow) Steps() []orchestration.Step {
    return []orchestration.Step{
        {
            Name:      "gather_context",
            Execute:   w.stepGatherContext,   // calls domain service
            HumanGate: false,
        },
        {
            Name:      "draft_application",
            Execute:   w.stepDraftApplication, // calls w.agents.Run("skattefunn-generator", ...)
            HumanGate: true,
        },
        {
            Name:      "validate_output",
            Execute:   w.stepValidate,         // calls w.skills.Run("generator-validator", ...)
            HumanGate: false,
        },
    }
}
```

**What needs to exist before this pattern can be used:**
- An `AgentDispatcher` interface in strategy-server (not in `pkg/orchestration`)
- A `SkillRunner` that can invoke generator-style skills server-side
- A skill/generator registry in strategy-server analogous to the epf-cli
  `internal/generator/` package

These are separate concerns, not part of this change. This change must not foreclose
them — and it does not, because `StepFunc` is a plain function that can call anything.

### Decision 3: Relationship to epf-cli output generators

**Decision:** `pkg/orchestration` and the epf-cli generator system are independent
today. They share a conceptual model (multi-step, agent-driven, human-reviewed
document production) but not code. The architectural alignment to maintain is:

| Concern | epf-cli generators | strategy-server orchestrator |
|---|---|---|
| Step execution | AI agent follows wizard instructions | `StepFunc` — Go function, may call agents |
| Human review | AI presents output, user edits | `HumanGate` — staged batch or artifact |
| Validation | `epf_validate_generator_output` | Schema validation on commit |
| Registry | Directory-based generator discovery | `engine.Register(workflow)` |
| Output | Markdown / document file | Staged batch mutation or `StepResult.Artifact` |

A future `documents` domain package in strategy-server could implement a `Workflow`
that uses the same generator model as epf-cli — reading strategy artifacts, calling
an LLM-backed skill with generator instructions, and producing a document. That
workflow would register with the same engine as the AIM cycle. The engine does not
need to change to support this.

**`StepResult.Artifact`** is added now (as an empty string in all current steps) to
ensure the `StepLog` schema can accommodate non-batch step outputs without a
migration. This is the only concrete forward-compatibility measure in this change.

### Decision 4: Reuse for non-AIM artifact authoring

**Decision:** The engine is already general-purpose by interface. Any domain package
can implement `Workflow` and register it. Explicit examples of future workflows that
should be expressible without engine changes:

- `onboarding_cycle` — guide a new user through creating their first strategy instance
- `feature_authoring` — multi-step drafting of a complex feature definition with
  ripple analysis, assumption mapping, and value model alignment
- `document_generation` — produce an external document (investor memo, skattefunn
  application) from strategy artifacts via an agent-driven generator skill

**What the current design does not support** that these workflows might need:

1. **Steps that produce documents, not batches** — covered by `StepResult.Artifact`
2. **Steps with no human gate and no output** — already supported (`HumanGate: false`,
   empty `BatchID` and `Artifact`)
3. **Steps that branch based on prior step output** — not supported. The step list
   is fixed at workflow registration time (`Steps() []Step`). Dynamic branching would
   require a `StepFunc` that conditionally no-ops, or a `Workflow` interface extension.
   This is deferred; the fixed-step model covers all current and near-term cases.
4. **Parallel steps** — not supported. All steps are sequential. Deferred.

---

## Today's Backend: `pgBackend`

`pkg/orchestration/pg/backend.go` implements `Backend` using:

- **Postgres store** — `orchestration_runs` table (migration 022); all state
  reads/writes go here
- **Goroutine pool** — fixed size (default 4 workers); run IDs enqueued via
  `chan uuid.UUID`
- **`resumeChannels`** — `map[uuid.UUID]chan bool`; each active run owns one channel
  for resume signalling

On `Start()`, `pgBackend` marks stale runs (`status IN ('pending', 'running',
'awaiting_human')`) as `failed` with `error='server restart'`. Acceptable for
single-process deployment.

---

## Future Backend: `riverBackend` (not built now)

A `riverBackend` would implement the same `Backend` interface using
[River](https://riverqueue.com) (`riverqueue/river`, MPL-2.0, pgx-native).
River handles job persistence, retry, and scheduling natively in Postgres — no Redis.

```go
// cmd_serve.go — the only file that changes in a backend swap:

// Today:
backend := pg.NewBackend(db, pg.Config{Workers: 4})

// Future:
backend := river.NewBackend(riverClient, river.Config{...})
```

All other files — `Engine`, HTTP handlers, MCP tools, all `Workflow` implementations
— remain unchanged.

---

## SSE Fanout

The `Engine` owns an in-process fanout (`pkg/orchestration/fanout.go`). This is
intentionally **not** part of the `Backend` interface — SSE is a UI concern, not a
persistence concern. The fanout is always the in-memory goroutine-channel
implementation regardless of which backend is used.

`GET /strategies/:id/aim/runs/:runID/stream` — Echo native SSE.
HTMX uses `hx-ext="sse"` + `sse-connect` to swap the run panel on each event.

---

## Concurrency Lock

`Engine.StartRun` calls `backend.ActiveRun(workflowName, concurrencyKey)`. If a run
is returned, `StartRun` returns `ErrAlreadyActive`. The HTTP handler maps this to
HTTP 409; the MCP tool maps it to a structured error. No DB advisory lock needed —
single process.

---

## Human-Gate Resume Protocol

1. Worker executes a step with `HumanGate: true`, receives a non-empty `BatchID`.
2. Engine stores `BatchID` in `StepLog`, transitions run to `awaiting_human`,
   publishes `Event{Type: "awaiting_human", BatchID: ...}` on the fanout.
3. Worker blocks on `resumeChannels[runID]`.
4. Batch commit/discard handler calls `engine.FindRunByBatch(batchID)` to locate
   the paused run, then calls `engine.Resume(runID, committed)`.
5. Worker unblocks: if `committed=true`, continues to next step; if `false`, aborts run.

---

## Migration Plan

Migration 022 adds `orchestration_runs`. No existing data affected.
Rollback: drop table and index. No backfill required.

The `steps` column is JSONB. `StepLog.Artifact` is stored inside `steps` JSONB —
no migration needed to add it. `StepResult.Artifact` is a zero-value string in
all current step implementations.

---

## Risks / Trade-offs

- **Process restart loses in-flight runs** → Marked `failed` on restart; user
  re-triggers. Acceptable today; River swap eliminates this.
- **SSE backpressure** → Channel buffer size 16; events dropped on overflow (no
  data loss — the run state in Postgres is always authoritative).
- **Goroutine leak on SSE disconnect** → Handler deregisters on `context.Done()`.
  Clean exit.
- **Fixed step list** → Dynamic branching requires a step that conditionally no-ops.
  Acceptable for all current use cases.
- **Sub-agent coupling deferred** → `StepFunc` can call agents; no `AgentDispatcher`
  interface exists yet. The first workflow that needs one will define it in its domain
  package. If multiple workflows need the same dispatcher, it gets promoted to a
  shared package. No premature abstraction.

---

## Open Questions — Resolved

| Question | Decision |
|---|---|
| Discard at any step → entire run aborted? | Yes — abort the run. User starts fresh. |
| Run panel: full timeline or just current step? | Full timeline with per-step status icons. |
| Sub-agent spawning in engine? | No — responsibility of StepFunc implementation. |
| StepResult type for non-batch outputs? | Add `Artifact string` field now; AIM steps leave it empty. |
| Relationship to epf-cli generators? | Conceptually aligned, code independent. Future strategy-server generator workflows use the same engine without changes. |
| Reuse for non-AIM workflows? | Yes by design. Dynamic branching and parallel steps deferred. |
| Backend interface sufficient for River? | Yes — only `cmd_serve.go` changes on swap. |
