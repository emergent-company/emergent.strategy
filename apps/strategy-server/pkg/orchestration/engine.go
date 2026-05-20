package orchestration

import (
	"context"
	"fmt"
	"log/slog"

	"github.com/google/uuid"
)

// PublisherSetter is an optional interface backends can implement to receive
// the engine's event publisher. The pgBackend implements this so its worker
// pool can call engine.Publish without a circular import.
type PublisherSetter interface {
	SetPublisher(p interface{ Publish(Event) })
}

// Engine wires a Backend to a registry of Workflow implementations and
// provides the public API used by HTTP handlers and MCP tools.
// SSE fanout lives in the Engine — it is a UI concern, not a persistence concern,
// and must work unchanged across backend swaps.
type Engine struct {
	backend  Backend
	registry map[string]Workflow
	fanout   *fanout
}

// New creates an Engine backed by the given Backend.
// If the backend implements PublisherSetter, the engine wires itself in as publisher.
func New(backend Backend) *Engine {
	e := &Engine{
		backend:  backend,
		registry: make(map[string]Workflow),
		fanout:   newFanout(),
	}
	if ps, ok := backend.(PublisherSetter); ok {
		ps.SetPublisher(e)
	}
	return e
}

// Register adds a Workflow to the engine's registry.
// Must be called before Start.
func (e *Engine) Register(w Workflow) {
	e.registry[w.Name()] = w
}

// Start initialises the backend and recovers stale runs.
func (e *Engine) Start(ctx context.Context) error {
	if err := e.backend.Start(ctx, e.registry); err != nil {
		return fmt.Errorf("orchestration engine start: %w", err)
	}
	return nil
}

// Stop drains and shuts down the backend gracefully.
func (e *Engine) Stop(ctx context.Context) error {
	return e.backend.Stop(ctx)
}

// StartRun creates and enqueues a new run for the named workflow.
// Returns ErrAlreadyActive when another run is active for the same
// (workflowName, concurrencyKey) pair.
func (e *Engine) StartRun(ctx context.Context, workflowName, concurrencyKey string, input map[string]any) (*Run, error) {
	if _, ok := e.registry[workflowName]; !ok {
		return nil, fmt.Errorf("orchestration: unknown workflow %q", workflowName)
	}

	// Enforce one-active-run concurrency lock.
	active, err := e.backend.ActiveRun(ctx, workflowName, concurrencyKey)
	if err != nil {
		return nil, fmt.Errorf("orchestration: check active run: %w", err)
	}
	if active != nil {
		return nil, ErrAlreadyActive
	}

	if input == nil {
		input = map[string]any{}
	}

	run := &Run{
		ID:             uuid.New(),
		WorkflowName:   workflowName,
		ConcurrencyKey: concurrencyKey,
		Input:          input,
		Status:         StatusPending,
	}

	if err := e.backend.Enqueue(ctx, run); err != nil {
		return nil, fmt.Errorf("orchestration: enqueue run: %w", err)
	}

	slog.InfoContext(ctx, "orchestration: run started",
		"run_id", run.ID,
		"workflow", workflowName,
		"concurrency_key", concurrencyKey,
	)
	return run, nil
}

// Resume is called by the batch commit/discard handler to unblock a paused run.
// committed=true → run advances to next step; committed=false → run is aborted.
func (e *Engine) Resume(ctx context.Context, runID uuid.UUID, committed bool) error {
	if err := e.backend.Resume(ctx, runID, committed); err != nil {
		return fmt.Errorf("orchestration: resume run %s: %w", runID, err)
	}
	return nil
}

// GetRun returns the current state of a run.
func (e *Engine) GetRun(ctx context.Context, runID uuid.UUID) (*Run, error) {
	return e.backend.GetRun(ctx, runID)
}

// ListRuns returns all runs for the given workflow + concurrency key, newest first.
func (e *Engine) ListRuns(ctx context.Context, workflowName, concurrencyKey string) ([]*Run, error) {
	return e.backend.ListRuns(ctx, workflowName, concurrencyKey)
}

// ActiveRun returns the currently active run, or nil if none.
func (e *Engine) ActiveRun(ctx context.Context, workflowName, concurrencyKey string) (*Run, error) {
	return e.backend.ActiveRun(ctx, workflowName, concurrencyKey)
}

// Subscribe returns a channel that will receive Events for runID.
// The caller must call Unsubscribe when the subscription is no longer needed.
func (e *Engine) Subscribe(runID uuid.UUID) <-chan Event {
	return e.fanout.Subscribe(runID)
}

// Unsubscribe removes and closes the subscription channel.
func (e *Engine) Unsubscribe(runID uuid.UUID, ch <-chan Event) {
	e.fanout.Unsubscribe(runID, ch)
}

// Publish sends an event to all SSE subscribers for the run.
// Called by the backend worker after each lifecycle transition.
func (e *Engine) Publish(ev Event) {
	e.fanout.Publish(ev.RunID, ev)
}

// BatchFinder is an optional interface backends can implement to support
// looking up awaiting_human runs by batch ID.
type BatchFinder interface {
	FindRunByBatch(ctx context.Context, batchID string) (*Run, error)
}

// FindRunByBatch looks up an awaiting_human run whose current step holds
// the given batchID. Returns nil if the backend does not support this or
// no matching run is found.
func (e *Engine) FindRunByBatch(ctx context.Context, batchID string) (*Run, error) {
	bf, ok := e.backend.(BatchFinder)
	if !ok {
		return nil, nil //nolint:nilnil // nil means "unsupported"
	}
	return bf.FindRunByBatch(ctx, batchID)
}
