package aimadk

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	"google.golang.org/adk/v2/agent"
	"google.golang.org/adk/v2/runner"
	adksession "google.golang.org/adk/v2/session"
	adkworkflow "google.golang.org/adk/v2/workflow"
	"google.golang.org/genai"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/aim"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/adk"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/pkg/orchestration"
)

// interruptIDMetaKey is where a gate's ADK InterruptID is stashed on its
// StepLog, so Resume can address the right pending request without ADK
// session internals leaking into the run-metadata contract. Prefixed with an
// underscore by the same convention domain/aim uses for engine-internal
// parameters (_trigger, _trigger_context) — not for display.
const interruptIDMetaKey = "_adk_interrupt_id"

// cycleStepsProvider is satisfied by domain/aim.CycleWorkflow. ADKEngine.Register
// takes an orchestration.Workflow — the same parameter type the legacy engine
// takes, so cmd_serve.go can register one workflow value against either engine
// unchanged — but the legacy-shaped Steps() it returns wraps step bodies for
// *orchestration.Run, which this engine cannot call. This structural check
// recovers the engine-neutral step list the legacy shape was adapted from.
type cycleStepsProvider interface {
	CycleSteps() []aim.Step
}

// ADKEngineConfig configures an ADKEngine. Mirrors orchpg.Config's shape
// deliberately, so the two engines read as the same kind of thing at the call
// site in cmd_serve.go.
type ADKEngineConfig struct {
	// AppName scopes ADK sessions in the (appName, userID, sessionID) triple
	// ADK's session store keys on; userID is the run's concurrency key (the
	// instance id for AIM), sessionID is the run id.
	AppName string

	// AbandonGatesAfter releases runs left awaiting human review for longer
	// than this. Zero disables the sweep.
	//
	// Unlike the legacy engine, an abandoned ADK run holds no goroutine
	// hostage — drive() simply exits once a gate opens, so there is nothing
	// blocked to free. It still holds the database-level "one active run per
	// instance" slot indefinitely, which is what this sweep releases.
	AbandonGatesAfter time.Duration

	// SweepInterval is how often to look for abandoned gates. Defaults to one
	// hour. Parked runs accumulate during uptime, so a startup-only sweep is
	// not sufficient.
	SweepInterval time.Duration
}

// ADKEngine implements orchestration.EngineAPI by running each workflow as an
// ADK graph, per openspec/changes/adopt-adk-runtime-and-provider-seam. One ADK
// session corresponds to one run, seeded at creation and never reused across
// runs — see internal/adk/aim_graph.go for why that keeps the session small
// regardless of how long a gate stays open.
//
// Cross-run questions — which run is active for an instance, which run staged
// a given batch, run history — are answered by RunStore, never by inspecting
// ADK session events. ADK session reconstruction is used only for what it is
// for: resuming one run's own paused position.
type ADKEngine struct {
	store    *RunStore
	sessions adksession.Service
	cfg      ADKEngineConfig

	mu        sync.RWMutex
	runners   map[string]*runner.Runner
	stepNames map[string][]string

	cancelMu sync.Mutex
	cancels  map[uuid.UUID]context.CancelFunc
	wg       sync.WaitGroup

	sweepStop chan struct{}
	sweepDone chan struct{}
}

// NewADKEngine creates an ADKEngine.
func NewADKEngine(store *RunStore, sessions adksession.Service, cfg ADKEngineConfig) *ADKEngine {
	if cfg.SweepInterval <= 0 {
		cfg.SweepInterval = time.Hour
	}
	return &ADKEngine{
		store:     store,
		sessions:  sessions,
		cfg:       cfg,
		runners:   make(map[string]*runner.Runner),
		stepNames: make(map[string][]string),
		cancels:   make(map[uuid.UUID]context.CancelFunc),
	}
}

var _ orchestration.EngineAPI = (*ADKEngine)(nil)

// Register builds the ADK graph and runner for w. Must be called before
// StartRun for that workflow. w must additionally implement CycleSteps()
// []aim.Step — domain/aim.CycleWorkflow does.
func (e *ADKEngine) Register(w orchestration.Workflow) {
	provider, ok := w.(cycleStepsProvider)
	if !ok {
		slog.Error("aimadk: workflow does not support the ADK engine, skipping registration",
			"workflow", w.Name(),
			"reason", "does not implement CycleSteps() []aim.Step",
		)
		return
	}

	graph, err := adk.BuildAIMGraph(w.Name(), Steps(provider.CycleSteps()))
	if err != nil {
		slog.Error("aimadk: failed to build ADK graph, workflow unavailable on this engine",
			"workflow", w.Name(), "err", err)
		return
	}

	r, err := runner.New(runner.Config{
		AppName:        e.cfg.AppName,
		Agent:          graph,
		SessionService: e.sessions,
		// Deliberately false: StartRun always pre-creates the session with
		// seeded state (instance id, run id, params). An auto-created session
		// would have none of that, and the first step would fail reading it.
		AutoCreateSession: false,
	})
	if err != nil {
		slog.Error("aimadk: failed to build runner, workflow unavailable on this engine",
			"workflow", w.Name(), "err", err)
		return
	}

	steps := provider.CycleSteps()
	names := make([]string, len(steps))
	for i, s := range steps {
		names[i] = s.Name
	}

	e.mu.Lock()
	e.runners[w.Name()] = r
	e.stepNames[w.Name()] = names
	e.mu.Unlock()
}

// Start marks non-terminal, non-awaiting_human runs as failed. Unlike the
// legacy engine, no in-memory recovery is needed for awaiting_human runs: an
// ADK-backed run has no goroutine blocked waiting for a signal, so there is
// nothing to re-attach on restart — Resume simply works whenever it is next
// called, by driving a fresh runner.Run against the persisted session.
func (e *ADKEngine) Start(ctx context.Context) error {
	n, err := e.store.MarkStaleFailed(ctx)
	if err != nil {
		return fmt.Errorf("aimadk: mark stale runs: %w", err)
	}
	if n > 0 {
		slog.WarnContext(ctx, "aimadk: marked stale runs as failed on startup", "count", n)
	}

	e.startGateSweep(ctx)
	return nil
}

// startGateSweep releases abandoned gates now and on an interval. Disabled
// when AbandonGatesAfter is zero.
func (e *ADKEngine) startGateSweep(ctx context.Context) {
	if e.cfg.AbandonGatesAfter <= 0 {
		return
	}

	e.sweepAbandonedGates(ctx)

	e.sweepStop = make(chan struct{})
	e.sweepDone = make(chan struct{})

	go func() {
		defer close(e.sweepDone)
		ticker := time.NewTicker(e.cfg.SweepInterval)
		defer ticker.Stop()

		for {
			select {
			case <-ticker.C:
				e.sweepAbandonedGates(context.WithoutCancel(ctx))
			case <-e.sweepStop:
				return
			}
		}
	}()
}

// sweepAbandonedGates moves runs parked past the threshold to a terminal
// state. Unlike the legacy engine's equivalent, there is no worker goroutine
// to free: an ADK run's drive() has already exited by the time it is sitting
// at an open gate, so releasing it is a status write, not a signal.
func (e *ADKEngine) sweepAbandonedGates(ctx context.Context) {
	now := time.Now().UTC()

	abandoned, err := e.store.FindAbandonedGates(ctx, e.cfg.AbandonGatesAfter, now)
	if err != nil {
		slog.WarnContext(ctx, "aimadk: gate sweep failed", "err", err)
		return
	}

	for _, gate := range abandoned {
		run := gate.Run
		if gate.StepIndex >= 0 {
			step := &run.Steps[gate.StepIndex]
			step.GateClearedAt = &now
			step.GateOutcome = orchestration.GateAbandoned
			step.Status = "done"
		}

		const reason = "human review abandoned"
		if err := e.store.UpdateStatus(ctx, run.ID, orchestration.StatusFailed, run.CurrentStep, reason, run.Steps); err != nil {
			slog.WarnContext(ctx, "aimadk: releasing abandoned gate failed", "run_id", run.ID, "err", err)
			continue
		}

		slog.WarnContext(ctx, "aimadk: released abandoned human gate",
			"run_id", run.ID,
			"step", run.CurrentStep,
			"parked_since", gate.ParkedSince,
			"parked_seconds", now.Sub(gate.ParkedSince).Seconds(),
		)
	}
}

// Stop cancels every in-flight drive/resume goroutine and the gate sweep, and
// waits for them to exit, or for ctx to expire. There is no worker pool to
// drain — each run's continuation is its own goroutine, cancelled
// individually.
func (e *ADKEngine) Stop(ctx context.Context) error {
	if e.sweepStop != nil {
		close(e.sweepStop)
	}

	e.cancelMu.Lock()
	for _, cancel := range e.cancels {
		cancel()
	}
	e.cancelMu.Unlock()

	done := make(chan struct{})
	go func() {
		e.wg.Wait()
		if e.sweepDone != nil {
			<-e.sweepDone
		}
		close(done)
	}()

	select {
	case <-done:
		return nil
	case <-ctx.Done():
		return fmt.Errorf("aimadk: stop: %w", ctx.Err())
	}
}

// StartRun creates the run-metadata row and the backing ADK session, then
// drives execution in the background until the graph pauses at a gate,
// completes, or fails. Returns as soon as the run is recorded — matching the
// legacy engine's StartRun, which also returns before any step executes.
func (e *ADKEngine) StartRun(ctx context.Context, workflowName, concurrencyKey string, input map[string]any) (*orchestration.Run, error) {
	e.mu.RLock()
	r, ok := e.runners[workflowName]
	e.mu.RUnlock()
	if !ok {
		return nil, fmt.Errorf("aimadk: unknown workflow %q", workflowName)
	}

	if _, err := uuid.Parse(concurrencyKey); err != nil {
		return nil, fmt.Errorf("aimadk: concurrency key %q is not a valid instance id: %w", concurrencyKey, err)
	}

	if input == nil {
		input = map[string]any{}
	}

	run := &orchestration.Run{
		ID:             uuid.New(),
		WorkflowName:   workflowName,
		ConcurrencyKey: concurrencyKey,
		Input:          input,
		Status:         orchestration.StatusPending,
		Steps:          []orchestration.StepLog{},
	}

	if err := e.store.Create(ctx, run); err != nil {
		return nil, err // includes orchestration.ErrAlreadyActive, unwrapped
	}

	sessionID := run.ID.String()
	_, err := e.sessions.Create(ctx, &adksession.CreateRequest{
		AppName:   e.cfg.AppName,
		UserID:    concurrencyKey,
		SessionID: sessionID,
		State: map[string]any{
			adk.StateKeyInstanceID: concurrencyKey,
			adk.StateKeyRunID:      run.ID.String(),
			adk.StateKeyParams:     input,
		},
	})
	if err != nil {
		// The run-metadata row already exists; leave it rather than half-undo,
		// and record why so it is not mistaken for a step failure.
		_ = e.store.UpdateStatus(ctx, run.ID, orchestration.StatusFailed, "", fmt.Sprintf("create ADK session: %v", err), run.Steps)
		return nil, fmt.Errorf("aimadk: create session: %w", err)
	}

	driveCtx, cancel := context.WithCancel(context.WithoutCancel(ctx))
	e.registerCancel(run.ID, cancel)

	slog.InfoContext(ctx, "aimadk: run started",
		"run_id", run.ID, "workflow", workflowName, "concurrency_key", concurrencyKey)

	e.wg.Add(1)
	go e.drive(driveCtx, r, run, concurrencyKey, sessionID,
		genai.NewContentFromText("start", genai.RoleUser), "")

	return run, nil
}

// Resume submits the reviewer's verdict for the run's open gate and continues
// execution in the background. Returns once the verdict is validated and
// handed off — not once the run reaches its next pause or completion, which
// may involve LLM calls taking minutes.
func (e *ADKEngine) Resume(ctx context.Context, runID uuid.UUID, committed bool) error {
	run, err := e.store.GetByID(ctx, runID)
	if err != nil {
		return fmt.Errorf("aimadk: resume run %s: %w", runID, err)
	}
	if run.Status != orchestration.StatusAwaitingHuman {
		return fmt.Errorf("aimadk: run %s is %s, not awaiting_human", runID, run.Status)
	}

	e.mu.RLock()
	r, ok := e.runners[run.WorkflowName]
	e.mu.RUnlock()
	if !ok {
		return fmt.Errorf("aimadk: unknown workflow %q", run.WorkflowName)
	}

	interruptID, ok := openInterruptID(run)
	if !ok {
		return fmt.Errorf("aimadk: run %s is awaiting_human but has no recorded interrupt id", runID)
	}

	outcome := orchestration.GateDiscarded
	if committed {
		outcome = orchestration.GateCommitted
	}
	msg := &genai.Content{
		Role: genai.RoleUser,
		Parts: []*genai.Part{{
			FunctionResponse: &genai.FunctionResponse{
				ID:       interruptID,
				Name:     adkworkflow.WorkflowInputFunctionCallName,
				Response: map[string]any{"committed": committed},
			},
		}},
	}

	resumeCtx, cancel := context.WithCancel(context.WithoutCancel(ctx))
	e.registerCancel(runID, cancel)

	slog.InfoContext(ctx, "aimadk: run resume requested", "run_id", runID, "outcome", outcome)

	e.wg.Add(1)
	go e.drive(resumeCtx, r, run, run.ConcurrencyKey, run.ID.String(), msg, outcome)
	return nil
}

// GetRun, ListRuns, ActiveRun and FindRunByBatch answer cross-run questions
// from RunStore only. Deliberately never touch ADK session events: those
// questions span runs, and a session's lifetime is one run.

func (e *ADKEngine) GetRun(ctx context.Context, runID uuid.UUID) (*orchestration.Run, error) {
	return e.store.GetByID(ctx, runID)
}

func (e *ADKEngine) ListRuns(ctx context.Context, workflowName, concurrencyKey string) ([]*orchestration.Run, error) {
	return e.store.List(ctx, workflowName, concurrencyKey)
}

func (e *ADKEngine) ActiveRun(ctx context.Context, workflowName, concurrencyKey string) (*orchestration.Run, error) {
	return e.store.ActiveRun(ctx, workflowName, concurrencyKey)
}

func (e *ADKEngine) FindRunByBatch(ctx context.Context, batchID string) (*orchestration.Run, error) {
	return e.store.FindRunByBatch(ctx, batchID)
}

// Abort requests cancellation of an active run. A run awaiting human review is
// discarded, matching the legacy engine. A run mid-step has its drive
// goroutine's context cancelled; ADK propagates that as context.Canceled from
// the scheduler, which the drive loop records as a failed run rather than
// leaving it stuck "running" forever. A terminal run is a no-op.
func (e *ADKEngine) Abort(ctx context.Context, runID uuid.UUID) error {
	run, err := e.store.GetByID(ctx, runID)
	if err != nil {
		return fmt.Errorf("aimadk: abort run %s: %w", runID, err)
	}

	switch run.Status {
	case orchestration.StatusAwaitingHuman:
		return e.Resume(ctx, runID, false)
	case orchestration.StatusPending, orchestration.StatusRunning:
		e.cancelMu.Lock()
		cancel, ok := e.cancels[runID]
		e.cancelMu.Unlock()
		if !ok {
			// No goroutine to cancel — nothing is actually in flight for this
			// run right now. Mark it aborted directly rather than leaving the
			// caller's abort silently unresolved.
			return e.store.UpdateStatus(ctx, runID, orchestration.StatusAborted, run.CurrentStep, "aborted by user", run.Steps)
		}
		cancel()
		slog.InfoContext(ctx, "aimadk: run abort requested", "run_id", runID)
		return nil
	default:
		return nil // terminal: no-op, matching the legacy engine
	}
}

// Retry is not yet implemented for the ADK engine.
//
// The legacy engine's retry resets only the failed step and skips steps
// already marked done. ADK has no equivalent at the session level: a fresh
// invocation starts from workflow.Start, so it would re-run every step from
// the beginning, including expensive already-completed LLM calls, rather than
// continuing from the failure.
//
// Not urgent: retry has zero test coverage at any layer in this codebase
// (engine, backend, or e2e), and the dev database's own history argues
// against it mattering in practice — 72% of reruns started within 5 minutes
// of the previous one dying, the kill-and-start-fresh pattern, not
// retry-in-place. This is not a reason to leave it broken forever, just a
// reason it does not block B4e/B4f/B5.
//
// Two candidate designs for whoever picks this up, in the order to try them:
//
//  1. Call runner.Run again on the *same* session with a fresh plain message,
//     not a resume. Check first whether ADK's own reconstruction
//     (collectNodeOutputs/scanHistory) already skips nodes that have a
//     recorded output somewhere in the session's history, regardless of
//     which invocation produced it — in which case the failed step (which
//     never produced output) naturally re-runs and the completed ones do
//     not, for free, no bespoke logic needed. This has not been verified
//     either way and should be checked with a direct probe before writing
//     any code, the same way nodeNameFromPath's behaviour was confirmed
//     empirically rather than assumed.
//  2. If ADK does not skip on that basis, seed a *new* session's
//     adk.StateKeyStepResults with the completed steps from the failed run's
//     RunStore record. The graph's existing "is this step already in Prior?"
//     path (the same one snapshot_cycle uses to read earlier decisions)
//     would then skip re-running them.
func (e *ADKEngine) Retry(_ context.Context, runID uuid.UUID) error {
	return fmt.Errorf("aimadk: run %s cannot be retried in place on this engine — start a new cycle instead", runID)
}

// drive runs the workflow forward — from the start, or from a resume when
// resumeOutcome is orchestration.GateCommitted/GateDiscarded — and projects
// each step's ADK events into the run-metadata record. It owns runID's
// cancel-registry entry for its lifetime and always clears it before
// returning, on every exit path.
func (e *ADKEngine) drive(ctx context.Context, r *runner.Runner, run *orchestration.Run, userID, sessionID string, msg *genai.Content, resumeOutcome string) {
	defer e.wg.Done()
	defer e.clearCancel(run.ID)

	// Every persistence call in this function uses persistCtx, not ctx.
	// ctx drives runner.Run and is exactly what Abort cancels — including,
	// deliberately, the in-flight step. Using the same context to persist the
	// resulting status would make that write itself fail the moment
	// cancellation happens, silently leaving the run stuck "running" forever
	// with no record of the abort ever having landed. context.WithoutCancel
	// keeps the request-scoped values (for tracing/logging) without
	// inheriting the cancellation.
	persistCtx := context.WithoutCancel(ctx)

	// The gate was cleared the instant Resume was called, regardless of what
	// happens next — a downstream failure does not retroactively mean the
	// review never happened. drive() is the only place that projects into
	// the step log, so this has to happen here rather than in Resume itself.
	if resumeOutcome != "" {
		if idx, ok := openGateIndex(run); ok {
			now := time.Now().UTC()
			run.Steps[idx].GateClearedAt = &now
			run.Steps[idx].GateOutcome = resumeOutcome
		} else {
			slog.ErrorContext(persistCtx, "aimadk: resume but no open gate found to clear", "run_id", run.ID)
		}
	}

	// Pre-populate a pending placeholder for every registered step, exactly
	// as the legacy engine's worker does before its own first "running"
	// write (pkg/orchestration/pg/pool.go). Without this, the run panel has
	// nothing to show for a step that has not executed yet — under this
	// engine specifically, run.Steps starts empty and only grows as steps
	// complete, so a run paused at the first gate would render only that one
	// step and omit the rest of the pipeline the legacy engine shows
	// upfront. Only fires once: a resumed run already has entries.
	if len(run.Steps) == 0 {
		e.mu.RLock()
		names := e.stepNames[run.WorkflowName]
		e.mu.RUnlock()

		run.Steps = make([]orchestration.StepLog, len(names))
		for i, name := range names {
			run.Steps[i] = orchestration.StepLog{Name: name, Status: "pending"}
		}
	}

	if err := e.store.UpdateStatus(persistCtx, run.ID, orchestration.StatusRunning, run.CurrentStep, "", run.Steps); err != nil {
		slog.ErrorContext(persistCtx, "aimadk: failed to mark run running", "run_id", run.ID, "err", err)
	}

	dispatched := map[string]time.Time{}
	stepIndex := map[string]int{}
	for i, s := range run.Steps {
		stepIndex[s.Name] = i
	}

	sawGate := false
	var runErr error

	for ev, err := range r.Run(ctx, userID, sessionID, msg, agent.RunConfig{}) {
		if err != nil {
			runErr = err
			break
		}
		if ev == nil || ev.NodeInfo == nil {
			continue
		}

		nodeName := nodeNameFromPath(ev.NodeInfo.Path)

		switch {
		case ev.RequestedInput != nil:
			stepName := strings.TrimSuffix(nodeName, "_gate")
			idx, ok := stepIndex[stepName]
			if !ok {
				slog.ErrorContext(persistCtx, "aimadk: gate opened for a step with no recorded result",
					"run_id", run.ID, "step", stepName)
				continue
			}
			now := time.Now().UTC()
			run.Steps[idx].Status = "awaiting_human"
			run.Steps[idx].GateOpenedAt = &now
			if run.Steps[idx].Meta == nil {
				run.Steps[idx].Meta = map[string]any{}
			}
			run.Steps[idx].Meta[interruptIDMetaKey] = ev.RequestedInput.InterruptID
			run.CurrentStep = stepName
			sawGate = true

			if err := e.store.UpdateStatus(persistCtx, run.ID, orchestration.StatusAwaitingHuman, run.CurrentStep, "", run.Steps); err != nil {
				slog.ErrorContext(persistCtx, "aimadk: failed to persist gate open", "run_id", run.ID, "err", err)
			}

		case len(ev.NodeInfo.OutputFor) > 0:
			result, ok := ev.Output.(adk.AIMStepResult)
			if !ok {
				continue // a non-step node's terminal output; nothing to project
			}

			startedAt, hasStart := dispatched[nodeName]
			started := ev.Timestamp
			if hasStart {
				started = startedAt
			}
			finished := ev.Timestamp

			log := orchestration.StepLog{
				Name:       result.Step,
				Status:     "done",
				BatchID:    result.BatchID,
				Meta:       result.Meta,
				StartedAt:  &started,
				FinishedAt: &finished,
			}
			if idx, ok := stepIndex[result.Step]; ok {
				run.Steps[idx] = log
			} else {
				stepIndex[result.Step] = len(run.Steps)
				run.Steps = append(run.Steps, log)
			}
			run.CurrentStep = result.Step

			if err := e.store.UpdateStatus(persistCtx, run.ID, orchestration.StatusRunning, run.CurrentStep, "", run.Steps); err != nil {
				slog.ErrorContext(persistCtx, "aimadk: failed to persist step completion", "run_id", run.ID, "step", result.Step, "err", err)
			}

		default:
			// A dispatch/routing event with no output yet — record when this
			// node started, so the eventual terminal event can report a
			// duration rather than zero.
			if _, seen := dispatched[nodeName]; !seen {
				dispatched[nodeName] = ev.Timestamp
			}
		}
	}

	switch {
	case runErr != nil && errors.Is(runErr, context.Canceled):
		if err := e.store.UpdateStatus(persistCtx, run.ID, orchestration.StatusAborted, run.CurrentStep, "aborted by user", run.Steps); err != nil {
			slog.ErrorContext(persistCtx, "aimadk: failed to persist abort", "run_id", run.ID, "err", err)
		}
	case runErr != nil && errors.Is(runErr, adk.ErrCycleDiscarded):
		// Expected outcome of a discard, not a failure: the gate's
		// GateOutcome above already recorded why. Do not overwrite it with a
		// scary error message.
		if err := e.store.UpdateStatus(persistCtx, run.ID, orchestration.StatusAborted, run.CurrentStep, "", run.Steps); err != nil {
			slog.ErrorContext(persistCtx, "aimadk: failed to persist discard", "run_id", run.ID, "err", err)
		}
	case runErr != nil:
		if err := e.store.UpdateStatus(persistCtx, run.ID, orchestration.StatusFailed, run.CurrentStep, runErr.Error(), run.Steps); err != nil {
			slog.ErrorContext(persistCtx, "aimadk: failed to persist failure", "run_id", run.ID, "err", err)
		}
	case sawGate:
		// Already persisted as awaiting_human at the point the gate opened.
	default:
		if err := e.store.UpdateStatus(persistCtx, run.ID, orchestration.StatusCompleted, "", "", run.Steps); err != nil {
			slog.ErrorContext(persistCtx, "aimadk: failed to persist completion", "run_id", run.ID, "err", err)
		}
	}
}

func (e *ADKEngine) registerCancel(runID uuid.UUID, cancel context.CancelFunc) {
	e.cancelMu.Lock()
	e.cancels[runID] = cancel
	e.cancelMu.Unlock()
}

func (e *ADKEngine) clearCancel(runID uuid.UUID) {
	e.cancelMu.Lock()
	delete(e.cancels, runID)
	e.cancelMu.Unlock()
}

// nodeNameFromPath recovers a node's name from ADK's NodeInfo.Path, which is
// empirically "<name>@<n>" for a top-level node and "<parent>/<name>@<n>" one
// level down — confirmed against the running graph rather than assumed,
// since Event.Author is not usable for this (it is always the workflow's own
// name, not the emitting node's).
func nodeNameFromPath(path string) string {
	if i := strings.LastIndex(path, "/"); i >= 0 {
		path = path[i+1:]
	}
	if i := strings.LastIndex(path, "@"); i >= 0 {
		path = path[:i]
	}
	return path
}

// openInterruptID reads the interrupt id stashed on a run's open gate.
func openInterruptID(run *orchestration.Run) (string, bool) {
	idx, ok := openGateIndex(run)
	if !ok {
		return "", false
	}
	id, ok := run.Steps[idx].Meta[interruptIDMetaKey].(string)
	return id, ok && id != ""
}

// openGateIndex locates the step currently awaiting human review.
func openGateIndex(run *orchestration.Run) (int, bool) {
	for i, s := range run.Steps {
		if s.Status == "awaiting_human" {
			return i, true
		}
	}
	return 0, false
}
