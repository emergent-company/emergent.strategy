package aimdbos

import (
	"context"
	"fmt"
	"log/slog"
	"sync"
	"time"

	"github.com/dbos-inc/dbos-transact-golang/dbos"
	"github.com/google/uuid"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/aim"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/pkg/orchestration"
)

// dbosWorkflowFuncName is the one DBOS-level function name this engine ever
// registers. DBOS allows at most one registration per Go function value
// (a bound method counts as one source expression), so every AIM-shaped
// workflow this engine drives shares this single registered function and is
// dispatched internally by cycleInput.WorkflowName — see workflow.go.
const dbosWorkflowFuncName = "aim_cycle"

// cycleStepsProvider is satisfied by domain/aim.CycleWorkflow. Mirrors
// internal/aimadk's identical interface: ADKEngine.Register takes an
// orchestration.Workflow — a one-method contract requiring only Name() —
// precisely so this package stays free of any domain dependency beyond
// domain/aim itself (still no engine import the other direction:
// domain/aim never imports internal/aimdbos).
type cycleStepsProvider interface {
	CycleSteps() []aim.Step
}

// staticPlanner implements aim.Planner with a single fixed order, filtered
// only by what has already completed. This is the entirety of this
// engine's planning behavior before Part C4 (adopt-dbos-dynamic-aim); any
// workflow that implements cycleStepsProvider but not aim.Planner gets one
// of these automatically (see Register), so every existing test fixture —
// none of which implement aim.Planner — keeps running exactly as before.
type staticPlanner struct{ order []string }

func (p staticPlanner) Plan(_ context.Context, _ uuid.UUID, completed []aim.StepOutput) ([]string, error) {
	done := make(map[string]bool, len(completed))
	for _, c := range completed {
		done[c.Step] = true
	}
	remaining := make([]string, 0, len(p.order))
	for _, name := range p.order {
		if !done[name] {
			remaining = append(remaining, name)
		}
	}
	return remaining, nil
}

func stepNames(steps []aim.Step) []string {
	names := make([]string, len(steps))
	for i, s := range steps {
		names[i] = s.Name
	}
	return names
}

// DBOSEngineConfig configures a DBOSEngine.
type DBOSEngineConfig struct {
	// AppName is DBOS's own application identifier (dbos.Config.AppName),
	// separate from anything in this engine's own bookkeeping.
	AppName string

	// DatabaseURL is the Postgres connection string DBOS uses for its own
	// system schema. Typically the same database strategy-server already
	// uses, with DBOS confined to its own "dbos" schema (038 migration).
	DatabaseURL string

	// ApplicationVersion MUST be a stable, explicitly-chosen string — never
	// left empty. Confirmed by direct probe: DBOS's own default, when this
	// is unset, hashes the *entire compiled binary*
	// (computeApplicationVersion → getBinaryHash, in DBOS's own source),
	// not just this package's code. Left at that default, any deploy of
	// strategy-server — including one that touches nothing under
	// domain/aim — would change the version and silently strand every run
	// currently parked at a gate: confirmed by direct probe that both
	// DBOS's automatic Launch-time recovery AND an explicit
	// dbos.ResumeWorkflow call refuse to resume a workflow whose recorded
	// version does not match the running process's (the workflow reaches
	// ENQUEUED and then simply never executes — no error, no timeout on
	// the Resume call itself, just silence).
	//
	// The correct model: this string represents the AIM cycle's *shape*
	// (its step sequence and gate positions), not the binary. Bump it only
	// when that shape actually changes, and only after confirming no run
	// is parked at a gate — this is the "blue-green: drain before
	// deploying" constraint harden-aim-execution/decision.md named as a
	// DBOS risk, now confirmed real, but narrowed to "when AIM's own step
	// shape changes" rather than "on every deploy of anything."
	ApplicationVersion string

	// AbandonGatesAfter is passed directly as every gate's Recv timeout.
	// Unlike ADK's engine, there is no separate sweep: DBOS's own timeout
	// mechanism is the abandoned-gate mechanism (design.md, probe 4). Zero
	// is not a special "disabled" value here — Recv would time out
	// immediately, which is never what's wanted, so this must be
	// configured to a real, generous duration.
	AbandonGatesAfter time.Duration

	// WorkflowRetention bounds how long a *terminal* (Success, Error,
	// Cancelled, or MaxRecoveryAttemptsExceeded) DBOS workflow record is
	// kept before RunRetentionSweep deletes it via dbos.DeleteWorkflows.
	// DBOS provides no automatic retention of its own — confirmed by
	// checking its Go API directly: ListWorkflows/DeleteWorkflows are
	// manual primitives, not a background GC — so this engine needs its
	// own sweep for the same reason ADK's ADK_SESSION_RETENTION (
	// harden-aim-execution, Part A3) needed one for adk_sessions. Zero
	// disables the sweep (RunRetentionSweep becomes a no-op loop) —
	// acceptable in dev, not recommended once cycles run at any real
	// frequency: every gated AIM step generates its own DBOS step record
	// on top of the domain step itself (recordStepDone, gate lifecycle,
	// and now the Part C4 replan-check poll), a meaningfully higher
	// per-cycle row count than ADK's own session events were.
	//
	// This only ever touches DBOS's own workflow_status/operation_outputs
	// tables (the "dbos" schema) — never aim_cycle_runs, which has its own
	// row per run, not per step, and grows slowly enough (gated,
	// heartbeat-driven cycles, not a high-frequency workload) that it does
	// not need a retention story of its own; see
	// openspec/changes/adopt-dbos-dynamic-aim, Part C5.
	WorkflowRetention time.Duration

	// RetentionSweepBatchSize bounds how many workflow records
	// RunRetentionSweep deletes per tick, so a long gap since the last
	// sweep (e.g. after downtime) does not attempt one unbounded delete.
	// Defaults to 500 if zero.
	RetentionSweepBatchSize int
}

// DefaultRetentionSweepBatchSize is used when
// DBOSEngineConfig.RetentionSweepBatchSize is left at zero.
const DefaultRetentionSweepBatchSize = 500

// terminalWorkflowStatuses are the statuses RunRetentionSweep considers
// eligible for deletion. Deliberately excludes Pending, Enqueued, and
// Delayed — an active or queued workflow is never a retention candidate,
// regardless of age.
var terminalWorkflowStatuses = []dbos.WorkflowStatusType{
	dbos.WorkflowStatusSuccess,
	dbos.WorkflowStatusError,
	dbos.WorkflowStatusCancelled,
	dbos.WorkflowStatusMaxRecoveryAttemptsExceeded,
}

// DBOSEngine implements orchestration.EngineAPI by running each workflow as
// a DBOS Transact Go workflow, per
// openspec/changes/adopt-dbos-dynamic-aim. It replaces internal/aimadk's
// ADKEngine.
//
// Cross-run questions — which run is active for an instance, which run
// staged a given batch, run history — are answered by RunStore (backed by
// aim_cycle_runs), never by asking DBOS about its own workflow_status
// table: DBOS has no concept of "AIM instance," and its own status enum has
// no "awaiting_human" distinct from "running" (confirmed by direct probe —
// a workflow blocked in Recv reports as PENDING). RunStore is this
// engine's own source of truth for exactly the same reason
// internal/aimadk.RunStore was ADKEngine's.
type DBOSEngine struct {
	store *RunStore
	cfg   DBOSEngineConfig

	dbosCtx dbos.Context

	mu       sync.RWMutex
	steps    map[string]map[string]aim.Step // workflow name -> step name -> Step (the registry, not an order)
	planners map[string]aim.Planner         // workflow name -> what decides order/subset per instance

	registerOnce sync.Once
}

// NewDBOSEngine creates a DBOSEngine. It constructs the underlying DBOS
// context (dbos.NewContext) but does not launch it — Start does that, once
// every workflow has been Registered, matching orchestration.EngineAPI's
// documented lifecycle.
func NewDBOSEngine(store *RunStore, cfg DBOSEngineConfig) (*DBOSEngine, error) {
	if cfg.ApplicationVersion == "" {
		// Refuse to silently fall back to DBOS's binary-hash default — see
		// DBOSEngineConfig.ApplicationVersion's doc comment for exactly why
		// that default is unsafe for a workload with open-ended gate
		// durations.
		return nil, fmt.Errorf("aimdbos: ApplicationVersion must be set explicitly, not left to DBOS's binary-hash default")
	}

	dbosCtx, err := dbos.NewContext(context.Background(), dbos.Config{
		AppName:            cfg.AppName,
		DatabaseURL:        cfg.DatabaseURL,
		ApplicationVersion: cfg.ApplicationVersion,
	})
	if err != nil {
		return nil, fmt.Errorf("aimdbos: create dbos context: %w", err)
	}
	return &DBOSEngine{
		store:    store,
		cfg:      cfg,
		dbosCtx:  dbosCtx,
		steps:    make(map[string]map[string]aim.Step),
		planners: make(map[string]aim.Planner),
	}, nil
}

var _ orchestration.EngineAPI = (*DBOSEngine)(nil)

// Register records w's step registry and planner, and, on the first call
// only, registers this engine's single DBOS workflow function. w must
// additionally implement CycleSteps() []aim.Step — domain/aim.CycleWorkflow
// does. If w also implements aim.Planner (CycleWorkflow does, via Plan),
// that planner decides per-instance order/subset; otherwise w gets
// staticPlanner, preserving the fixed-order-for-everyone behavior every
// pre-Part-C4 test fixture already assumes.
//
// Calling Register more than once for workflows that are not all
// AIM-shaped is unsupported today: every registration shares the one DBOS
// function (dbosWorkflowFuncName), dispatched by name inside
// cycleWorkflow. This matches how this engine is actually used — exactly
// one AIM cycle workflow, registered once, at startup.
func (e *DBOSEngine) Register(w orchestration.Workflow) {
	provider, ok := w.(cycleStepsProvider)
	if !ok {
		slog.Error("aimdbos: workflow does not support the DBOS engine, skipping registration",
			"workflow", w.Name(),
			"reason", "does not implement CycleSteps() []aim.Step",
		)
		return
	}

	steps := provider.CycleSteps()
	byName := make(map[string]aim.Step, len(steps))
	for _, s := range steps {
		byName[s.Name] = s
	}

	var planner aim.Planner
	if p, ok := w.(aim.Planner); ok {
		planner = p
	} else {
		planner = staticPlanner{order: stepNames(steps)}
	}

	e.mu.Lock()
	e.steps[w.Name()] = byName
	e.planners[w.Name()] = planner
	e.mu.Unlock()

	e.registerOnce.Do(func() {
		dbos.RegisterWorkflow(e.dbosCtx, e.cycleWorkflow, dbos.WithWorkflowName(dbosWorkflowFuncName))
	})
}

// Start launches the DBOS runtime. This is also where DBOS recovers any
// workflow left mid-execution by a prior process — confirmed by direct
// probe to happen automatically, logged as "Recovered pending workflows".
// Unlike ADKEngine.Start, there is no MarkStaleFailed-equivalent sweep: a
// "running" row here is not stale-by-construction the way it was under
// ADK, because DBOS actually resumes it, correctly, without any explicit
// call from this engine — the workflow function itself re-executes from
// its last completed step and continues writing to RunStore as it goes.
func (e *DBOSEngine) Start(_ context.Context) error {
	if err := e.dbosCtx.Launch(); err != nil {
		return fmt.Errorf("aimdbos: launch: %w", err)
	}
	return nil
}

// Stop shuts down the DBOS runtime gracefully.
func (e *DBOSEngine) Stop(ctx context.Context) error {
	deadline := 30 * time.Second
	if d, ok := ctx.Deadline(); ok {
		if remaining := time.Until(d); remaining > 0 {
			deadline = remaining
		}
	}
	if err := dbos.Shutdown(e.dbosCtx, deadline); err != nil {
		return fmt.Errorf("aimdbos: shutdown: %w", err)
	}
	return nil
}

// StartRun creates the run-metadata row and starts the backing DBOS
// workflow under a deterministic id equal to the run's own id — confirmed
// by direct probe that a caller-supplied workflow id is retrievable from
// any process via RetrieveWorkflow, so no separate mapping table is needed
// between an AIM run and its DBOS identity. Returns as soon as the run is
// recorded and the workflow is started, matching ADKEngine.StartRun, which
// also returns before any step executes.
//
// The initial plan is resolved here, in host code, before the workflow
// starts — not inside cycleWorkflow — because Planner.Plan only ever needs
// a fast config read (TriggerConfig is one strategy_artifacts row), so
// there is no reason to pay for a memoized DBOS step just to make the
// decision deterministic under replay: it is already fixed the moment it
// is written into cycleInput.PlannedSteps, which DBOS persists as the
// workflow's own input exactly once. This is also what "decided once at
// cycle start" means concretely, and it is what lets run.Steps'
// placeholders reflect the real, instance-specific plan immediately,
// rather than a generic fixed list that may not match what actually runs.
func (e *DBOSEngine) StartRun(ctx context.Context, workflowName, concurrencyKey string, input map[string]any) (*orchestration.Run, error) {
	e.mu.RLock()
	registry, ok := e.steps[workflowName]
	planner := e.planners[workflowName]
	e.mu.RUnlock()
	if !ok {
		return nil, fmt.Errorf("aimdbos: unknown workflow %q", workflowName)
	}

	instanceID, err := uuid.Parse(concurrencyKey)
	if err != nil {
		return nil, fmt.Errorf("aimdbos: concurrency key %q is not a valid instance id: %w", concurrencyKey, err)
	}

	if input == nil {
		input = map[string]any{}
	}

	names, err := planner.Plan(ctx, instanceID, nil)
	if err != nil {
		return nil, fmt.Errorf("aimdbos: plan cycle: %w", err)
	}
	for _, name := range names {
		if _, ok := registry[name]; !ok {
			return nil, fmt.Errorf("aimdbos: planner selected unknown step %q", name)
		}
	}

	// Pre-populate a pending placeholder for every planned step, matching
	// ADKEngine's drive() — the run panel renders run.Steps upfront rather
	// than only as steps complete. Unlike the fixed-order engine this
	// replaced, this list is already instance-specific.
	placeholders := make([]orchestration.StepLog, len(names))
	for i, name := range names {
		placeholders[i] = orchestration.StepLog{Name: name, Status: "pending"}
	}

	run := &orchestration.Run{
		ID:             uuid.New(),
		WorkflowName:   workflowName,
		ConcurrencyKey: concurrencyKey,
		Input:          input,
		Status:         orchestration.StatusPending,
		Steps:          placeholders,
	}
	// run.ID doubles as the initial DBOS workflow ID (dbos.WithWorkflowID
	// below uses the same string) — passed explicitly, not re-derived from
	// run.ID at the call site, so RunStore's own doc comment about this
	// invariant has one place it can actually be wrong if violated.
	if err := e.store.Create(ctx, run, run.ID.String()); err != nil {
		return nil, err // includes orchestration.ErrAlreadyActive, unwrapped
	}

	if _, err := dbos.RunWorkflow(e.dbosCtx, e.cycleWorkflow, cycleInput{
		WorkflowName: workflowName,
		RunID:        run.ID.String(),
		InstanceID:   concurrencyKey,
		Params:       input,
		PlannedSteps: names,
	}, dbos.WithWorkflowID(run.ID.String())); err != nil {
		// The run-metadata row already exists; leave it rather than
		// half-undo, and record why — matching ADKEngine's equivalent
		// session-creation-failure handling.
		_ = e.store.UpdateStatus(ctx, run.ID, orchestration.StatusFailed, "", fmt.Sprintf("start dbos workflow: %v", err), run.Steps)
		return nil, fmt.Errorf("aimdbos: start workflow: %w", err)
	}

	if err := e.store.UpdateStatus(ctx, run.ID, orchestration.StatusRunning, "", "", run.Steps); err != nil {
		slog.ErrorContext(ctx, "aimdbos: failed to mark run running", "run_id", run.ID, "err", err)
	}
	run.Status = orchestration.StatusRunning

	slog.InfoContext(ctx, "aimdbos: run started",
		"run_id", run.ID, "workflow", workflowName, "concurrency_key", concurrencyKey)

	return run, nil
}

// Resume delivers the reviewer's verdict to the run's open gate via
// dbos.Send. Returns once the message is durably recorded — not once the
// workflow reaches its next pause or completion, which may involve LLM
// calls taking minutes, matching ADKEngine.Resume's contract.
func (e *DBOSEngine) Resume(ctx context.Context, runID uuid.UUID, committed bool) error {
	run, err := e.store.GetByID(ctx, runID)
	if err != nil {
		return fmt.Errorf("aimdbos: resume run %s: %w", runID, err)
	}
	if run.Status != orchestration.StatusAwaitingHuman {
		return fmt.Errorf("aimdbos: run %s is %s, not awaiting_human", runID, run.Status)
	}

	stepName, ok := openGateStep(run)
	if !ok {
		return fmt.Errorf("aimdbos: run %s is awaiting_human but has no open gate recorded", runID)
	}

	// Must address the run's *currently live* DBOS workflow, not runID
	// itself — they diverge after Retry (RunStore.DBOSWorkflowID's doc
	// comment). Using runID unconditionally here was a real bug: dbos.Send
	// to an already-ERROR'd original workflow succeeds with no error,
	// while the actually-parked live workflow waits on Recv until
	// AbandonGatesAfter elapses, having never received anything.
	dbosWorkflowID, err := e.store.DBOSWorkflowID(ctx, runID)
	if err != nil {
		return fmt.Errorf("aimdbos: resume run %s: %w", runID, err)
	}

	slog.InfoContext(ctx, "aimdbos: run resume requested", "run_id", runID, "dbos_workflow_id", dbosWorkflowID, "step", stepName, "committed", committed)

	if err := dbos.Send(e.dbosCtx, dbosWorkflowID, gateVerdict{StepName: stepName, Committed: committed}, gateTopic(stepName)); err != nil {
		return fmt.Errorf("aimdbos: send gate verdict: %w", err)
	}
	return nil
}

// Replan asks a running cycle to reconsider what remains, via a durable
// signal rather than by directly mutating state — see workflow.go's
// checkReplan for how the workflow picks it up, only at a step boundary,
// never interrupting a step already in flight. Returns once the request is
// durably recorded, not once re-planning has actually happened: the
// signal may sit for as long as the current step takes.
func (e *DBOSEngine) Replan(ctx context.Context, runID uuid.UUID) error {
	run, err := e.store.GetByID(ctx, runID)
	if err != nil {
		return fmt.Errorf("aimdbos: replan run %s: %w", runID, err)
	}
	switch run.Status {
	case orchestration.StatusCompleted, orchestration.StatusAborted, orchestration.StatusFailed:
		return fmt.Errorf("aimdbos: run %s is %s, too late to replan", runID, run.Status)
	}

	// Set the flag before sending: checkReplan only ever calls dbos.Recv
	// when this is true, which is what keeps a cycle that nobody ever asks
	// to replan free of a Recv-with-timeout call (and DBOS's own
	// timeout-reached warning log) at every single step boundary forever.
	if err := e.store.SetReplanRequested(ctx, runID, true); err != nil {
		return fmt.Errorf("aimdbos: mark replan requested: %w", err)
	}

	// Must address the current live workflow, not runID — same mistake
	// class as Resume's identical fix, but a smaller consequence here:
	// SetReplanRequested above already wrote straight to Postgres, so a
	// misdirected Send below does not produce a wrong outcome — it only
	// costs checkReplan its full replanRecvGrace timeout at the next
	// boundary instead of picking the signal up immediately (confirmed by
	// mutation test: reverting this line makes
	// TestDBOSEngine_Replan_AfterRetry_TargetsTheLiveWorkflow's run take
	// ~5s instead of ~1s, not fail outright). Still worth fixing: an
	// unnecessary multi-second stall on every post-retry replan is a real
	// cost, even though it is not a correctness bug the way Resume's was.
	dbosWorkflowID, err := e.store.DBOSWorkflowID(ctx, runID)
	if err != nil {
		return fmt.Errorf("aimdbos: replan run %s: %w", runID, err)
	}
	if err := dbos.Send(e.dbosCtx, dbosWorkflowID, replanSignal{}, replanTopic); err != nil {
		return fmt.Errorf("aimdbos: send replan signal: %w", err)
	}
	slog.InfoContext(ctx, "aimdbos: replan requested", "run_id", runID, "dbos_workflow_id", dbosWorkflowID)
	return nil
}

// GetRun, ListRuns, ActiveRun and FindRunByBatch answer cross-run questions
// from RunStore only — see the type doc comment for why.

func (e *DBOSEngine) GetRun(ctx context.Context, runID uuid.UUID) (*orchestration.Run, error) {
	return e.store.GetByID(ctx, runID)
}

func (e *DBOSEngine) ListRuns(ctx context.Context, workflowName, concurrencyKey string) ([]*orchestration.Run, error) {
	return e.store.List(ctx, workflowName, concurrencyKey)
}

func (e *DBOSEngine) ActiveRun(ctx context.Context, workflowName, concurrencyKey string) (*orchestration.Run, error) {
	return e.store.ActiveRun(ctx, workflowName, concurrencyKey)
}

func (e *DBOSEngine) FindRunByBatch(ctx context.Context, batchID string) (*orchestration.Run, error) {
	return e.store.FindRunByBatch(ctx, batchID)
}

// Abort cancels an active run. A run awaiting human review is discarded,
// matching ADKEngine.Abort. A run mid-step is cancelled via DBOS's own
// CancelWorkflow. A terminal run is a no-op.
func (e *DBOSEngine) Abort(ctx context.Context, runID uuid.UUID) error {
	run, err := e.store.GetByID(ctx, runID)
	if err != nil {
		return fmt.Errorf("aimdbos: abort run %s: %w", runID, err)
	}

	switch run.Status {
	case orchestration.StatusAwaitingHuman:
		return e.Resume(ctx, runID, false)
	case orchestration.StatusPending, orchestration.StatusRunning:
		// Must cancel the current live workflow, not runID — see Resume's
		// identical comment; the same bug class applies here.
		dbosWorkflowID, err := e.store.DBOSWorkflowID(ctx, runID)
		if err != nil {
			return fmt.Errorf("aimdbos: abort run %s: %w", runID, err)
		}
		if err := dbos.CancelWorkflow(e.dbosCtx, dbosWorkflowID); err != nil {
			return fmt.Errorf("aimdbos: cancel workflow: %w", err)
		}
		if err := e.store.UpdateStatus(ctx, runID, orchestration.StatusAborted, run.CurrentStep, "aborted by user", run.Steps); err != nil {
			return fmt.Errorf("aimdbos: persist abort: %w", err)
		}
		slog.InfoContext(ctx, "aimdbos: run aborted", "run_id", runID)
		return nil
	default:
		return nil // terminal: no-op, matching ADKEngine
	}
}

// Retry resumes a failed run from its first uncompleted step via
// ForkWorkflow — confirmed by direct probe to be the correct primitive
// (ResumeWorkflow is a no-op on a logically-failed workflow; ForkWorkflow
// re-executes only from the given step, reusing prior steps' checkpointed
// outputs without re-invoking them). See design.md's probe 1 for the
// experiment this is based on.
//
// The forked workflow gets a new DBOS-internal id (ForkWorkflow always
// mints one); this engine's own run id and aim_cycle_runs row are
// unchanged — RunStore's cross-run bookkeeping never depended on the DBOS
// workflow id matching the run id after a retry, only at StartRun.
func (e *DBOSEngine) Retry(ctx context.Context, runID uuid.UUID) error {
	run, err := e.store.GetByID(ctx, runID)
	if err != nil {
		return fmt.Errorf("aimdbos: retry run %s: %w", runID, err)
	}
	if run.Status != orchestration.StatusFailed {
		return fmt.Errorf("aimdbos: run %s is %s, not failed", runID, run.Status)
	}

	// Fork FROM the current live workflow, not runID — on a *second*
	// retry these have already diverged (the first retry's fork is what's
	// actually ERROR'd now, not the original). Using runID unconditionally
	// here would silently re-fork the original, first-ever attempt,
	// discarding whatever progress the first retry made.
	currentWorkflowID, err := e.store.DBOSWorkflowID(ctx, runID)
	if err != nil {
		return fmt.Errorf("aimdbos: retry run %s: %w", runID, err)
	}

	startStep, err := firstIncompleteStepIndex(e.dbosCtx, currentWorkflowID)
	if err != nil {
		return fmt.Errorf("aimdbos: determine retry start step: %w", err)
	}

	forkHandle, err := dbos.ForkWorkflow[string](e.dbosCtx, dbos.ForkWorkflowInput{
		OriginalWorkflowID: currentWorkflowID,
		StartStep:          uint(startStep), //nolint:gosec // startStep comes from a DBOS-reported step count, never user input
	})
	if err != nil {
		return fmt.Errorf("aimdbos: fork workflow: %w", err)
	}

	// The fork's ID is now the live workflow — every future Resume/Replan/
	// Abort/Retry for this run must address it, not runID or
	// currentWorkflowID (both stale the instant this succeeds).
	if err := e.store.SetDBOSWorkflowID(ctx, run.ID, forkHandle.GetWorkflowID()); err != nil {
		return fmt.Errorf("aimdbos: retry: record new live workflow id: %w", err)
	}

	if err := e.store.UpdateStatus(ctx, run.ID, orchestration.StatusRunning, run.CurrentStep, "", run.Steps); err != nil {
		return fmt.Errorf("aimdbos: retry: mark running: %w", err)
	}

	slog.InfoContext(ctx, "aimdbos: run retry requested",
		"run_id", run.ID, "forked_from", currentWorkflowID, "forked_workflow_id", forkHandle.GetWorkflowID(), "start_step", startStep)
	return nil
}

// firstIncompleteStepIndex asks DBOS itself which steps of workflowID
// already have a recorded output, and returns the index of the first one
// that does not — the StartStep ForkWorkflow needs. Deliberately not
// derived from RunStore's own Steps projection: that projection includes
// this engine's own bookkeeping steps (recordStepDone, etc, each their own
// dbos.RunAsStep call), which do not correspond 1:1 with AIM steps, so only
// DBOS's own step ledger has the numbering ForkWorkflow's StartStep
// actually indexes into.
func firstIncompleteStepIndex(client dbos.Client, workflowID string) (int, error) {
	infos, err := dbos.GetWorkflowSteps(client, workflowID)
	if err != nil {
		return 0, fmt.Errorf("get workflow steps: %w", err)
	}
	for _, info := range infos {
		//nolint:nilerr // info.Error is DBOS's own record of that STEP's outcome,
		// not this lookup function's error — finding a failed step is exactly
		// what this function is looking for, not a failure of the lookup itself.
		if info.Error != nil {
			return info.StepID, nil
		}
	}
	// No recorded step has an error — the failure happened on a step that
	// never got as far as recording anything (or DBOS's own step list is
	// shorter than expected). Falling back to "one past the last recorded
	// step" resumes at the next step rather than guessing at zero, which
	// would re-run everything.
	return len(infos), nil
}

// openGateStep locates the step currently awaiting human review by
// scanning run.Steps rather than trusting run.CurrentStep positionally —
// the same defensive approach ADK's openGateIndex used, for the same
// reason: a stale, not-properly-cleared earlier gate must never be
// resolved by a later resume.
func openGateStep(run *orchestration.Run) (string, bool) {
	for _, s := range run.Steps {
		if s.Status == "awaiting_human" {
			return s.Name, true
		}
	}
	return "", false
}

// RunRetentionSweep starts a blocking ticker loop reaping terminal DBOS
// workflow records older than cfg.WorkflowRetention, matching
// heartbeat.Service.RunTicker's convention — intended to be started in a
// goroutine (`go engine.RunRetentionSweep(ctx, interval)`) alongside it.
// Returns when ctx is cancelled. A zero WorkflowRetention makes every tick
// a documented no-op rather than silently deleting everything at once
// (there is no "0 = keep forever, run anyway" ambiguity to worry about the
// way there might be with a naive `before: now.Add(-0)`).
func (e *DBOSEngine) RunRetentionSweep(ctx context.Context, interval time.Duration) {
	if interval <= 0 {
		interval = time.Hour
	}
	slog.InfoContext(ctx, "aimdbos: retention sweep started",
		"interval", interval, "retention", e.cfg.WorkflowRetention)

	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			slog.InfoContext(ctx, "aimdbos: retention sweep stopped")
			return
		case <-ticker.C:
			e.sweepOnce(ctx)
		}
	}
}

func (e *DBOSEngine) sweepOnce(ctx context.Context) {
	n, err := e.ReapCompletedWorkflows()
	if err != nil {
		slog.ErrorContext(ctx, "aimdbos: retention sweep failed", "err", err)
		return
	}
	if n > 0 {
		slog.InfoContext(ctx, "aimdbos: retention sweep reaped completed workflows", "count", n)
	}
}

// ReapCompletedWorkflows deletes terminal DBOS workflow records completed
// more than cfg.WorkflowRetention ago, up to one batch, and returns how
// many were deleted. It never inspects or touches aim_cycle_runs — an
// aim_cycle_runs row survives its backing DBOS workflow's deletion exactly
// as designed (RunStore is this engine's own permanent history; DBOS's
// workflow_status row was always internal bookkeeping the run panel never
// reads directly). Takes no context.Context: DBOS's
// ListWorkflows/DeleteWorkflows take a dbos.Client (e.dbosCtx), not one —
// there is nothing to thread a caller's context through.
//
// Exported (not just reachable via RunRetentionSweep's ticker) so an
// operator or a test can trigger a sweep on demand without waiting for the
// next tick. The WorkflowRetention<=0 guard lives here, not only in the
// ticker loop, so "disabled" is a property of this method itself — no
// caller of it can accidentally bypass "0 means never delete anything" by
// calling it directly instead of going through RunRetentionSweep.
func (e *DBOSEngine) ReapCompletedWorkflows() (int, error) {
	if e.cfg.WorkflowRetention <= 0 {
		return 0, nil
	}

	batchSize := e.cfg.RetentionSweepBatchSize
	if batchSize <= 0 {
		batchSize = DefaultRetentionSweepBatchSize
	}

	cutoff := time.Now().UTC().Add(-e.cfg.WorkflowRetention)
	candidates, err := dbos.ListWorkflows(e.dbosCtx,
		dbos.WithFilterStatus(terminalWorkflowStatuses...),
		dbos.WithFilterCompletedBefore(cutoff),
		dbos.WithFilterLoadInput(false),
		dbos.WithFilterLoadOutput(false),
		dbos.WithFilterLimit(batchSize),
	)
	if err != nil {
		return 0, fmt.Errorf("aimdbos: list completed workflows: %w", err)
	}
	if len(candidates) == 0 {
		return 0, nil
	}

	ids := make([]string, len(candidates))
	for i, c := range candidates {
		ids[i] = c.ID
	}
	if err := dbos.DeleteWorkflows(e.dbosCtx, ids); err != nil {
		return 0, fmt.Errorf("aimdbos: delete completed workflows: %w", err)
	}
	return len(ids), nil
}
