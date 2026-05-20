package orchestration

import (
	"context"

	"github.com/google/uuid"
)

// Backend abstracts both the state store and the worker dispatch mechanism.
// Callers depend on Engine, not Backend directly.
// Implementations: pkg/orchestration/pg.pgBackend (goroutine pool + Postgres).
type Backend interface {
	// Start initialises the backend (starts workers, recovers stale runs).
	// The engine registry is passed so the backend can look up workflows.
	Start(ctx context.Context, registry map[string]Workflow) error

	// Stop drains and shuts down gracefully.
	Stop(ctx context.Context) error

	// Enqueue persists a new run and dispatches it to a worker.
	Enqueue(ctx context.Context, run *Run) error

	// Resume signals a paused run to continue (committed=true) or abort (committed=false).
	Resume(ctx context.Context, runID uuid.UUID, committed bool) error

	// GetRun returns the current state of a run.
	GetRun(ctx context.Context, runID uuid.UUID) (*Run, error)

	// ListRuns returns all runs for a given workflow + concurrency key, newest first.
	ListRuns(ctx context.Context, workflowName, concurrencyKey string) ([]*Run, error)

	// ActiveRun returns the single active run for a key, or nil if none.
	// Active = status in (pending, running, awaiting_human).
	ActiveRun(ctx context.Context, workflowName, concurrencyKey string) (*Run, error)
}
