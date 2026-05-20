package pg

import (
	"context"
	"fmt"
	"log/slog"

	"github.com/google/uuid"
	"github.com/uptrace/bun"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/pkg/orchestration"
)

// Config holds configuration for the pgBackend.
type Config struct {
	// Workers is the number of parallel goroutine workers. Defaults to 4.
	Workers int
}

// Backend implements orchestration.Backend using Postgres as the state store
// and a fixed-size goroutine pool as the worker dispatch mechanism.
//
// To swap to River in the future, replace pg.NewBackend(db, cfg) with
// river.NewBackend(riverClient, cfg) in main.go — no other files change.
type Backend struct {
	store *pgStore
	pool  *pool
}

// NewBackend creates a new pgBackend.
func NewBackend(db *bun.DB, cfg Config) *Backend {
	store := newStore(db)
	p := newPool(cfg.Workers, store)
	return &Backend{store: store, pool: p}
}

// SetPublisher wires the engine's fanout into this backend.
// Must be called before Start. The Engine calls this automatically.
func (b *Backend) SetPublisher(pub Publisher) {
	b.pool.setPublisher(pub)
}

// Start marks stale runs as failed (server restart) and launches workers.
func (b *Backend) Start(ctx context.Context, registry map[string]orchestration.Workflow) error {
	n, err := b.store.markStaleFailed(ctx)
	if err != nil {
		return fmt.Errorf("pg backend: mark stale runs: %w", err)
	}
	if n > 0 {
		slog.WarnContext(ctx, "orchestration: marked stale runs as failed on startup",
			"count", n,
		)
	}
	b.pool.setRegistry(registry)
	b.pool.start()
	return nil
}

// Stop drains the worker pool and stops it.
func (b *Backend) Stop(_ context.Context) error {
	b.pool.stop()
	return nil
}

// Enqueue persists the run and dispatches it to the worker pool.
func (b *Backend) Enqueue(ctx context.Context, run *orchestration.Run) error {
	if err := b.store.insert(ctx, run); err != nil {
		return fmt.Errorf("pg backend: insert run: %w", err)
	}
	b.pool.enqueue(run.ID)
	return nil
}

// Resume signals the waiting worker for runID.
func (b *Backend) Resume(_ context.Context, runID uuid.UUID, committed bool) error {
	return b.pool.resume(runID, committed)
}

// GetRun returns the current state of a run by ID.
func (b *Backend) GetRun(ctx context.Context, runID uuid.UUID) (*orchestration.Run, error) {
	return b.store.getByID(ctx, runID)
}

// ListRuns returns all runs for a workflow + concurrency key, newest first.
func (b *Backend) ListRuns(ctx context.Context, workflowName, concurrencyKey string) ([]*orchestration.Run, error) {
	return b.store.list(ctx, workflowName, concurrencyKey)
}

// ActiveRun returns the single active run for a concurrency key, or nil.
func (b *Backend) ActiveRun(ctx context.Context, workflowName, concurrencyKey string) (*orchestration.Run, error) {
	return b.store.activeRun(ctx, workflowName, concurrencyKey)
}

// FindRunByBatch looks up an awaiting_human run whose current step has the given batchID.
// Used by the batch commit/discard handler to identify which run to resume.
func (b *Backend) FindRunByBatch(ctx context.Context, batchID string) (*orchestration.Run, error) {
	return b.store.findAwaitingRunByBatch(ctx, batchID)
}
