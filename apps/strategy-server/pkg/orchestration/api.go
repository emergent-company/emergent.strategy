package orchestration

import (
	"context"

	"github.com/google/uuid"
)

// EngineAPI is the surface HTTP handlers and MCP tools drive an orchestration
// engine through. internal/aimadk.ADKEngine is its only implementation.
//
// A prior implementation — a Postgres-backed goroutine pool wrapping this
// package's own Engine type — was extracted into exactly this interface so
// ADKEngine could be substituted without touching any of the ~30 call sites
// across internal/handler and internal/mcpserver, then deleted once ADKEngine
// reached parity with it. Deliberately excluded from the start: Subscribe,
// Unsubscribe, and Publish. The SSE fanout they backed had no external
// caller — the run panel polls GetRun on a timer instead, see
// handler_aim_orchestrator.go — so no implementation is obligated to
// replicate that mechanism.
type EngineAPI interface {
	// Register adds a Workflow to the engine's registry. Must be called before
	// Start.
	Register(w Workflow)
	// Start initialises the backend and recovers state from a prior run.
	Start(ctx context.Context) error
	// Stop drains and shuts down gracefully.
	Stop(ctx context.Context) error
	// StartRun creates and enqueues a new run for the named workflow. Returns
	// ErrAlreadyActive when another run is active for the same
	// (workflowName, concurrencyKey) pair.
	StartRun(ctx context.Context, workflowName, concurrencyKey string, input map[string]any) (*Run, error)
	// Resume unblocks a run paused at a human gate. committed=true advances to
	// the next step; committed=false aborts the run.
	Resume(ctx context.Context, runID uuid.UUID, committed bool) error
	// GetRun returns the current state of a run.
	GetRun(ctx context.Context, runID uuid.UUID) (*Run, error)
	// ListRuns returns all runs for a workflow + concurrency key, newest first.
	ListRuns(ctx context.Context, workflowName, concurrencyKey string) ([]*Run, error)
	// ActiveRun returns the currently active run for a concurrency key, or nil.
	ActiveRun(ctx context.Context, workflowName, concurrencyKey string) (*Run, error)
	// Abort requests graceful cancellation of an active run.
	Abort(ctx context.Context, runID uuid.UUID) error
	// Retry resets a failed run so its failed step re-executes.
	Retry(ctx context.Context, runID uuid.UUID) error
	// FindRunByBatch looks up the run awaiting review of the given batch.
	// Returns nil, nil when no run holds that batch.
	FindRunByBatch(ctx context.Context, batchID string) (*Run, error)
}
