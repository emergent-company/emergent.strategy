package pg

import (
	"context"
	"fmt"
	"log/slog"
	"time"

	"github.com/google/uuid"
	"github.com/uptrace/bun"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/pkg/orchestration"
)

// Config holds configuration for the pgBackend.
type Config struct {
	// Workers is the number of parallel goroutine workers. Defaults to 4.
	Workers int

	// AbandonGatesAfter releases runs left awaiting human review for longer
	// than this. Zero disables the sweep.
	//
	// A parked run costs more than a stalled cycle: it holds its instance's
	// concurrency slot, and because recovered runs block a worker in
	// waitForResume, Workers abandoned reviews would stall orchestration
	// entirely.
	AbandonGatesAfter time.Duration

	// SweepInterval is how often to look for abandoned gates. Defaults to one
	// hour. Parked runs accumulate during uptime, so a startup-only sweep is
	// not sufficient.
	SweepInterval time.Duration
}

// Backend implements orchestration.Backend using Postgres as the state store
// and a fixed-size goroutine pool as the worker dispatch mechanism.
//
// To swap to River in the future, replace pg.NewBackend(db, cfg) with
// river.NewBackend(riverClient, cfg) in main.go — no other files change.
type Backend struct {
	store *pgStore
	pool  *pool
	cfg   Config

	sweepStop chan struct{}
	sweepDone chan struct{}
}

// NewBackend creates a new pgBackend.
func NewBackend(db *bun.DB, cfg Config) *Backend {
	store := newStore(db)
	p := newPool(cfg.Workers, store)
	if cfg.SweepInterval <= 0 {
		cfg.SweepInterval = time.Hour
	}
	return &Backend{store: store, pool: p, cfg: cfg}
}

// SetPublisher wires the engine's fanout into this backend.
// Must be called before Start. The Engine calls this automatically.
func (b *Backend) SetPublisher(pub Publisher) {
	b.pool.setPublisher(pub)
}

// Start marks stale runs as failed, recovers awaiting_human runs, and launches workers.
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

	// Recover awaiting_human runs — these survive restarts because their
	// state is fully persisted. Re-register resume channels and enqueue
	// them so workers block on waitForResume until a batch commit/discard.
	awaitingIDs, err := b.store.listAwaitingHuman(ctx)
	if err != nil {
		slog.WarnContext(ctx, "orchestration: failed to list awaiting_human runs for recovery", "err", err)
	} else if len(awaitingIDs) > 0 {
		b.pool.recoverAwaiting(awaitingIDs)
		slog.InfoContext(ctx, "orchestration: recovered awaiting_human runs after restart",
			"count", len(awaitingIDs),
		)
	}

	b.startGateSweep(ctx)
	return nil
}

// startGateSweep releases abandoned gates now and on an interval.
func (b *Backend) startGateSweep(ctx context.Context) {
	if b.cfg.AbandonGatesAfter <= 0 {
		return
	}

	// Recovery above re-registered resume channels, so a run swept immediately
	// can still be unblocked.
	b.sweepAbandonedGates(ctx)

	b.sweepStop = make(chan struct{})
	b.sweepDone = make(chan struct{})

	go func() {
		defer close(b.sweepDone)
		ticker := time.NewTicker(b.cfg.SweepInterval)
		defer ticker.Stop()

		for {
			select {
			case <-ticker.C:
				b.sweepAbandonedGates(context.WithoutCancel(ctx))
			case <-b.sweepStop:
				return
			}
		}
	}()
}

// sweepAbandonedGates moves runs parked past the threshold to a terminal state
// and unblocks the workers holding them.
func (b *Backend) sweepAbandonedGates(ctx context.Context) {
	now := time.Now().UTC()

	abandoned, err := b.store.findAbandonedGates(ctx, b.cfg.AbandonGatesAfter, now)
	if err != nil {
		slog.WarnContext(ctx, "orchestration: gate sweep failed", "err", err)
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
		if err := b.store.updateStatus(ctx, run.ID, orchestration.StatusFailed, run.CurrentStep, reason, run.Steps); err != nil {
			slog.WarnContext(ctx, "orchestration: releasing abandoned gate failed",
				"run_id", run.ID, "err", err)
			continue
		}

		// Free the worker goroutine. Absent when the run was not recovered into
		// the pool, which is not an error.
		_ = b.pool.release(run.ID)

		slog.WarnContext(ctx, "orchestration: released abandoned human gate",
			"run_id", run.ID,
			"step", run.CurrentStep,
			"parked_since", gate.ParkedSince,
			"parked_seconds", now.Sub(gate.ParkedSince).Seconds(),
		)
	}
}

// Stop drains the worker pool and stops it.
func (b *Backend) Stop(_ context.Context) error {
	if b.sweepStop != nil {
		close(b.sweepStop)
		<-b.sweepDone
		b.sweepStop = nil
	}
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

// Abort requests graceful cancellation of an active run.
func (b *Backend) Abort(ctx context.Context, runID uuid.UUID) error {
	return b.pool.abort(ctx, runID)
}

// Retry resets a failed run and re-enqueues it for execution.
func (b *Backend) Retry(ctx context.Context, runID uuid.UUID) error {
	return b.pool.retry(ctx, runID)
}
