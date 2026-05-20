## ADDED Requirements

### Requirement: Workflow Interface

The system SHALL define a `Workflow` interface in `pkg/orchestration` that any
caller can implement to register a named, ordered sequence of steps with the engine.
The interface MUST decouple the orchestration engine from all domain-specific logic.

#### Scenario: AIM workflow registered at startup

- **WHEN** the server starts
- **THEN** `domain/aim.AIMCycleWorkflow` is registered with the engine via `engine.Register(w)`
- **AND** the engine has no compile-time dependency on `domain/aim`

#### Scenario: New workflow registered without engine changes

- **WHEN** a developer adds a new workflow (e.g. "onboarding_cycle")
- **THEN** they implement `Workflow` in their own domain package and call `engine.Register`
- **AND** no files in `pkg/orchestration` need to be modified

---

### Requirement: Backend Interface

The system SHALL define a `Backend` interface in `pkg/orchestration` that abstracts
the state store and worker dispatch mechanism. The `Engine` MUST depend only on
`Backend`, never on a concrete implementation such as `pgBackend` or any job queue library.

#### Scenario: Backend swapped without changing callers

- **WHEN** a developer replaces `pg.NewBackend(db, cfg)` with `river.NewBackend(client, cfg)` in `main.go`
- **THEN** all callers — HTTP handlers, MCP tools, AIM workflow — compile and behave correctly without modification
- **AND** no files outside `main.go` and the new backend package need to change

#### Scenario: pgBackend is the default implementation

- **WHEN** the server is started with a Postgres connection
- **AND** no alternative backend is configured
- **THEN** `pkg/orchestration/pg.Backend` is used, backed by the `orchestration_runs` table
  and an in-process goroutine pool

---

### Requirement: Engine Facade

The system SHALL expose an `Engine` type in `pkg/orchestration` that wires a `Backend`
to a registry of `Workflow` implementations and provides the public API used by HTTP
handlers and MCP tools.

#### Scenario: Start a workflow run

- **WHEN** `engine.StartRun(ctx, workflowName, concurrencyKey, input)` is called
- **AND** no active run exists for that workflow + concurrency key
- **THEN** a run is created, persisted, and enqueued in the backend
- **AND** the run ID is returned to the caller

#### Scenario: Concurrency lock enforced

- **WHEN** `engine.StartRun` is called for a workflow + concurrency key that already has an active run
- **THEN** `engine.StartRun` returns `ErrAlreadyActive`
- **AND** the HTTP handler maps this to HTTP 409; the MCP tool maps it to a structured error

---

### Requirement: AIM Cycle Run Lifecycle

The system SHALL manage AIM cycle runs as a server-side state machine with states:
`pending`, `running`, `awaiting_human`, `completed`, `aborted`, and `failed`.
Each run belongs to one strategy instance and progresses through steps
(draft_assessment → draft_calibration → apply_calibration → snapshot_cycle) in sequence.
The AIM cycle is implemented as a `Workflow` registered with the engine; it is not
hard-coded in the engine itself.

#### Scenario: AIM cycle run completes full cycle

- **WHEN** the user commits each draft batch at each human-gate
- **THEN** the run progresses through all four steps and reaches `status='completed'`
- **AND** the cycle snapshot is created automatically after the final commit

#### Scenario: Run aborted on discard

- **WHEN** the user discards any draft batch during a run
- **THEN** the run transitions to `status='aborted'`
- **AND** no further steps are executed

#### Scenario: Run failed on step error

- **WHEN** a step executor encounters an unrecoverable error (e.g. LLM failure, DB error)
- **THEN** the run transitions to `status='failed'` with an error message recorded in the step log
- **AND** the run panel displays the failure reason

---

### Requirement: Human-Gate Pause and Resume

The orchestrator SHALL pause execution after each step marked `HumanGate: true` and
wait for the user to commit or discard the staged batch before continuing.

#### Scenario: Pause at human-gate

- **WHEN** a step with `HumanGate: true` returns a non-empty `BatchID`
- **THEN** the run transitions to `status='awaiting_human'` with the batch ID recorded in the step log
- **AND** the run panel shows a "Review Draft" link pointing to the draft review screen
- **AND** the worker goroutine blocks until the user acts on the batch

#### Scenario: Resume on commit

- **WHEN** the user commits a batch linked to an `awaiting_human` run
- **THEN** `engine.Resume(runID, committed=true)` is called from the batch handler
- **AND** the run transitions back to `status='running'` and the next step begins

#### Scenario: Resume on discard

- **WHEN** the user discards a batch linked to an `awaiting_human` run
- **THEN** `engine.Resume(runID, committed=false)` is called
- **AND** the run transitions to `status='aborted'`

---

### Requirement: Live SSE Progress Stream

The system SHALL stream run state transitions to connected browsers via Server-Sent Events
so the user can monitor a workflow run without polling or page reloads. The SSE fanout
SHALL be an in-process concern of the `Engine`, independent of the `Backend` interface,
so it works unchanged when the backend is swapped.

#### Scenario: Browser connects to SSE stream

- **WHEN** the run panel renders and the browser connects to
  `GET /strategies/:id/orchestration/runs/:runID/stream`
- **THEN** the server sends an initial event with the current run state
- **AND** subsequent events are sent on every state transition

#### Scenario: Multiple browsers watching the same run

- **WHEN** multiple browser tabs are connected to the same run stream
- **THEN** all receive the same events independently
- **AND** each tab can disconnect without affecting others

#### Scenario: Browser disconnects mid-run

- **WHEN** the browser closes or navigates away
- **THEN** the server detects the disconnect via context cancellation
- **AND** the SSE channel is deregistered; the run continues unaffected

---

### Requirement: Run History and Panel

The system SHALL display a list of past workflow runs and provide a detail panel
with the full step timeline.

#### Scenario: View active run on AIM landing page

- **WHEN** an active AIM cycle run exists for an instance
- **THEN** the AIM landing page shows a run summary card with current step and status badge

#### Scenario: View run detail panel

- **WHEN** the user navigates to `GET /strategies/:id/orchestration/runs/:runID`
- **THEN** the run panel renders with a step timeline showing each step's status,
  duration, and a "Review Draft" link for steps in `awaiting_human` state

---

### Requirement: MCP Orchestration Tools

The system SHALL expose MCP tools for agent-driven orchestration. Tool names
reference the workflow by name so agents can target any registered workflow.

#### Scenario: Agent starts AIM cycle

- **WHEN** an agent calls `start_aim_cycle` with a valid `instance_id`
- **THEN** the tool returns `{ run_id, status }` if no active run exists
- **AND** returns a structured error if a run is already active

#### Scenario: Agent queries run state

- **WHEN** an agent calls `get_aim_run` with a valid `run_id`
- **THEN** the tool returns the full run record including `steps` with per-step details

---

### Requirement: Server Restart Recovery

On server startup the system SHALL detect and mark any runs left in a non-terminal
state from a previous process, so the operator and user know which cycles were interrupted.

#### Scenario: Stale runs marked failed on startup

- **WHEN** `backend.Start(ctx)` is called during server initialisation
- **AND** `orchestration_runs` contains rows with `status IN ('pending', 'running', 'awaiting_human')`
- **THEN** those rows are updated to `status='failed'` with `error='server restart'`
