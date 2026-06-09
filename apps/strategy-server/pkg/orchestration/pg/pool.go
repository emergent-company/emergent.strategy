package pg

import (
	"context"
	"fmt"
	"log/slog"
	"runtime/debug"
	"sync"
	"time"

	"github.com/google/uuid"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/pkg/orchestration"
)

// pool is a fixed-size goroutine worker pool that executes orchestration runs.
type pool struct {
	size      int
	queue     chan uuid.UUID                   // run IDs waiting for a worker
	resumeChs map[uuid.UUID]chan bool          // per-run resume signals
	cancelFns map[uuid.UUID]context.CancelFunc // per-run context cancel for abort
	mu        sync.Mutex
	store     *pgStore
	registry  map[string]orchestration.Workflow
	engine    Publisher
	stopCh    chan struct{}
	wg        sync.WaitGroup
}

// Publisher is a minimal interface to publish events back to the engine fanout.
// Using a local interface here avoids a circular import with the engine.
type Publisher interface {
	Publish(orchestration.Event)
}

func newPool(size int, store *pgStore) *pool {
	if size <= 0 {
		size = 4
	}
	return &pool{
		size:      size,
		queue:     make(chan uuid.UUID, size*2),
		resumeChs: make(map[uuid.UUID]chan bool),
		cancelFns: make(map[uuid.UUID]context.CancelFunc),
		store:     store,
		stopCh:    make(chan struct{}),
	}
}

func (p *pool) setRegistry(reg map[string]orchestration.Workflow) {
	p.registry = reg
}

func (p *pool) setPublisher(pub Publisher) {
	p.engine = pub
}

// start launches worker goroutines.
func (p *pool) start() {
	for i := 0; i < p.size; i++ {
		p.wg.Add(1)
		go p.worker()
	}
}

// stop signals workers to exit and waits for them to drain.
func (p *pool) stop() {
	close(p.stopCh)
	p.wg.Wait()
}

// enqueue adds a run ID to the worker queue.
func (p *pool) enqueue(runID uuid.UUID) {
	p.mu.Lock()
	p.resumeChs[runID] = make(chan bool, 1)
	p.mu.Unlock()

	slog.Info("orchestration: enqueuing run to worker pool",
		"run_id", runID, "queue_len", len(p.queue), "queue_cap", cap(p.queue))

	select {
	case p.queue <- runID:
		slog.Info("orchestration: run enqueued successfully", "run_id", runID)
	case <-p.stopCh:
		slog.Warn("orchestration: pool stopped, run dropped", "run_id", runID)
	}
}

// recoverAwaiting re-registers resume channels for runs that were in
// awaiting_human state when the server restarted. These runs don't need
// to be re-enqueued to the worker queue — they just need a resume channel
// so that batch commit/discard can unblock them, and a worker to pick up
// execution from the awaiting step.
func (p *pool) recoverAwaiting(runIDs []uuid.UUID) {
	for _, id := range runIDs {
		p.mu.Lock()
		p.resumeChs[id] = make(chan bool, 1)
		p.mu.Unlock()

		// Re-enqueue so a worker picks it up and blocks on waitForResume.
		select {
		case p.queue <- id:
		case <-p.stopCh:
			return
		}
	}
}

// resume signals the worker blocked on the given run to continue or abort.
func (p *pool) resume(runID uuid.UUID, committed bool) error {
	p.mu.Lock()
	ch, ok := p.resumeChs[runID]
	p.mu.Unlock()

	if !ok {
		return fmt.Errorf("no active worker for run %s", runID)
	}

	select {
	case ch <- committed:
	default:
		return fmt.Errorf("resume channel full for run %s", runID)
	}
	return nil
}

func (p *pool) worker() {
	defer p.wg.Done()
	workerID := fmt.Sprintf("worker-%d", time.Now().UnixNano()%10000)
	slog.Info("orchestration: worker started", "worker", workerID)
	for {
		select {
		case runID := <-p.queue:
			// Prioritise shutdown: Go's select picks a ready case at random,
			// so a worker could start a new run even after stop() was signalled.
			// Re-check stopCh before executing so no DB work begins once the
			// pool is stopping (prevents queries racing a closing DB, e.g. in
			// tests where the database is dropped right after Stop()).
			select {
			case <-p.stopCh:
				slog.Info("orchestration: worker stopping (post-dequeue)", "worker", workerID, "run_id", runID)
				return
			default:
			}
			slog.Info("orchestration: worker picked up run", "worker", workerID, "run_id", runID)
			p.executeRun(runID)
			slog.Info("orchestration: worker finished run", "worker", workerID, "run_id", runID)
		case <-p.stopCh:
			slog.Info("orchestration: worker stopping", "worker", workerID)
			return
		}
	}
}

func (p *pool) executeRun(runID uuid.UUID) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Store the cancel func so abort() can cancel a running step.
	p.mu.Lock()
	p.cancelFns[runID] = cancel
	p.mu.Unlock()
	defer func() {
		p.mu.Lock()
		delete(p.cancelFns, runID)
		p.mu.Unlock()
	}()

	defer func() {
		if r := recover(); r != nil {
			slog.Error("orchestration: recovered panic in worker",
				"run_id", runID,
				"panic", fmt.Sprintf("%v", r),
				"stack", string(debug.Stack()),
			)
			// Best-effort: mark the run as failed so it doesn't stay in a running state.
			_ = p.store.updateStatus(ctx, runID, orchestration.StatusFailed,
				"", fmt.Sprintf("panic: %v", r), nil)
			p.publish(orchestration.Event{
				Type:   orchestration.EventFailed,
				RunID:  runID,
				Status: orchestration.StatusFailed,
			})
			p.cleanupResumeCh(runID)
		}
	}()

	run, err := p.store.getByID(ctx, runID)
	if err != nil {
		slog.Error("orchestration: failed to load run", "run_id", runID, "err", err)
		return
	}

	wf, ok := p.registry[run.WorkflowName]
	if !ok {
		slog.Error("orchestration: unknown workflow", "workflow", run.WorkflowName, "run_id", runID)
		_ = p.store.updateStatus(ctx, runID, orchestration.StatusFailed, "", "unknown workflow", run.Steps)
		return
	}

	steps := wf.Steps()

	// Initialise step logs if empty.
	if len(run.Steps) == 0 {
		run.Steps = make([]orchestration.StepLog, len(steps))
		for i, s := range steps {
			run.Steps[i] = orchestration.StepLog{Name: s.Name, Status: "pending"}
		}
	}

	// Mark as running.
	run.Status = orchestration.StatusRunning
	if err := p.store.updateStatus(ctx, run.ID, orchestration.StatusRunning, "", "", run.Steps); err != nil {
		slog.Error("orchestration: failed to mark run as running", "run_id", runID, "err", err)
		return
	}

	for i, step := range steps {
		// Skip already-done steps (e.g. on retry after server restart).
		if run.Steps[i].Status == "done" {
			continue
		}

		// Recovery path: if the step was awaiting_human when the server restarted,
		// skip re-execution and go straight to waiting for the resume signal.
		if run.Steps[i].Status == "awaiting_human" {
			_ = p.store.updateStatus(ctx, run.ID, orchestration.StatusAwaitingHuman, step.Name, "", run.Steps)
			slog.InfoContext(ctx, "orchestration: recovering awaiting_human step after restart",
				"run_id", run.ID, "step", step.Name)

			committed, ok := p.waitForResume(runID)
			if !ok {
				return // server shutting down
			}
			if !committed {
				run.Steps[i].Status = "done"
				_ = p.store.updateStatus(ctx, run.ID, orchestration.StatusAborted, step.Name, "", run.Steps)
				p.publish(orchestration.Event{
					Type:   orchestration.EventAborted,
					RunID:  run.ID,
					Step:   step.Name,
					Status: orchestration.StatusAborted,
				})
				p.cleanupResumeCh(runID)
				return
			}
			run.Steps[i].Status = "done"
			p.publish(orchestration.Event{
				Type:   orchestration.EventStepFinished,
				RunID:  run.ID,
				Step:   step.Name,
				Status: orchestration.StatusRunning,
			})
			continue
		}

		now := time.Now().UTC()
		run.Steps[i].Status = "running"
		run.Steps[i].StartedAt = &now
		run.CurrentStep = step.Name

		p.publish(orchestration.Event{
			Type:   orchestration.EventStepStarted,
			RunID:  run.ID,
			Step:   step.Name,
			Status: orchestration.StatusRunning,
		})
		_ = p.store.updateStatus(ctx, run.ID, orchestration.StatusRunning, step.Name, "", run.Steps)

		result, stepErr := step.Execute(ctx, run)
		finishedAt := time.Now().UTC()
		run.Steps[i].FinishedAt = &finishedAt

		// Check if this step was aborted via context cancellation.
		if ctx.Err() != nil {
			run.Steps[i].Status = "done"
			run.Steps[i].Error = "aborted by user"
			bgCtx := context.Background() // use fresh context since ours is cancelled
			_ = p.store.updateStatus(bgCtx, run.ID, orchestration.StatusAborted, step.Name, "aborted by user", run.Steps)
			p.publish(orchestration.Event{
				Type:   orchestration.EventAborted,
				RunID:  run.ID,
				Step:   step.Name,
				Status: orchestration.StatusAborted,
			})
			p.cleanupResumeCh(runID)
			return
		}

		if stepErr != nil {
			run.Steps[i].Status = "failed"
			run.Steps[i].Error = stepErr.Error()
			_ = p.store.updateStatus(ctx, run.ID, orchestration.StatusFailed, step.Name, stepErr.Error(), run.Steps)
			p.publish(orchestration.Event{
				Type:   orchestration.EventFailed,
				RunID:  run.ID,
				Step:   step.Name,
				Status: orchestration.StatusFailed,
			})
			p.cleanupResumeCh(runID)
			return
		}

		run.Steps[i].Meta = result.Meta
		run.Steps[i].BatchID = result.BatchID
		if result.Artifact != "" {
			if run.Steps[i].Meta == nil {
				run.Steps[i].Meta = make(map[string]any)
			}
			run.Steps[i].Meta["artifact"] = result.Artifact
		}

		if step.HumanGate && result.BatchID == "" {
			// Empty batch — step produced no mutations (e.g. adapt-foundations
			// determined no foundation changes were needed). Auto-advance without
			// blocking on human review.
			run.Steps[i].Status = "done"
			if run.Steps[i].Meta == nil {
				run.Steps[i].Meta = make(map[string]any)
			}
			run.Steps[i].Meta["auto_advanced"] = true
			run.Steps[i].Meta["auto_advanced_reason"] = "no_changes_needed"
			_ = p.store.updateStatus(ctx, run.ID, orchestration.StatusRunning, step.Name, "", run.Steps)
			p.publish(orchestration.Event{
				Type:   orchestration.EventStepFinished,
				RunID:  run.ID,
				Step:   step.Name,
				Status: orchestration.StatusRunning,
			})
		} else if step.HumanGate {
			run.Steps[i].Status = "awaiting_human"
			_ = p.store.updateStatus(ctx, run.ID, orchestration.StatusAwaitingHuman, step.Name, "", run.Steps)
			p.publish(orchestration.Event{
				Type:    orchestration.EventAwaitingHuman,
				RunID:   run.ID,
				Step:    step.Name,
				BatchID: result.BatchID,
				Status:  orchestration.StatusAwaitingHuman,
			})

			// Block until resume signal.
			committed, ok := p.waitForResume(runID)
			if !ok {
				// stopCh was closed — server shutting down.
				return
			}
			if !committed {
				run.Steps[i].Status = "done" // mark current step as cancelled
				_ = p.store.updateStatus(ctx, run.ID, orchestration.StatusAborted, step.Name, "", run.Steps)
				p.publish(orchestration.Event{
					Type:   orchestration.EventAborted,
					RunID:  run.ID,
					Step:   step.Name,
					Status: orchestration.StatusAborted,
				})
				p.cleanupResumeCh(runID)
				return
			}
		}

		run.Steps[i].Status = "done"
		p.publish(orchestration.Event{
			Type:   orchestration.EventStepFinished,
			RunID:  run.ID,
			Step:   step.Name,
			Status: orchestration.StatusRunning,
		})
	}

	// All steps done.
	_ = p.store.updateStatus(ctx, run.ID, orchestration.StatusCompleted, "", "", run.Steps)
	p.publish(orchestration.Event{
		Type:   orchestration.EventCompleted,
		RunID:  run.ID,
		Status: orchestration.StatusCompleted,
	})
	p.cleanupResumeCh(runID)
}

// waitForResume blocks until a resume signal is received or the pool is stopped.
func (p *pool) waitForResume(runID uuid.UUID) (committed, ok bool) {
	p.mu.Lock()
	ch := p.resumeChs[runID]
	p.mu.Unlock()

	select {
	case c := <-ch:
		return c, true
	case <-p.stopCh:
		return false, false
	}
}

// abort cancels an active run. If the run is executing a step, the context is
// cancelled. If the run is awaiting human review, a discard signal is sent.
// If the run is not active (already completed/failed/aborted), this is a no-op.
func (p *pool) abort(ctx context.Context, runID uuid.UUID) error {
	p.mu.Lock()
	cancelFn := p.cancelFns[runID]
	resumeCh := p.resumeChs[runID]
	p.mu.Unlock()

	if cancelFn == nil && resumeCh == nil {
		// No active worker for this run — check if it's in a terminal state already.
		run, err := p.store.getByID(ctx, runID)
		if err != nil {
			return fmt.Errorf("abort: load run: %w", err)
		}
		switch orchestration.RunStatus(run.Status) {
		case orchestration.StatusCompleted, orchestration.StatusAborted, orchestration.StatusFailed:
			return nil // already terminal
		default:
			// Pending or otherwise stuck — mark as aborted directly.
			_ = p.store.updateStatus(ctx, runID, orchestration.StatusAborted, run.CurrentStep, "aborted by user", run.Steps)
			p.publish(orchestration.Event{
				Type:   orchestration.EventAborted,
				RunID:  runID,
				Status: orchestration.StatusAborted,
			})
			return nil
		}
	}

	// If awaiting human review, send the discard signal.
	if resumeCh != nil {
		select {
		case resumeCh <- false:
			// Signal sent — the worker will handle abort.
		default:
			// Channel already has a value — worker will process it.
		}
	}

	// If a step is actively running, cancel its context.
	if cancelFn != nil {
		cancelFn()
	}

	return nil
}

// retry resets a failed run so the failed step is re-executed.
// Only works when the run is in StatusFailed. The failed step is reset to
// "pending", the run status is set back to "pending", and the run is
// re-enqueued to the worker pool. The worker's step loop skips "done"
// steps and re-executes from the reset step.
func (p *pool) retry(ctx context.Context, runID uuid.UUID) error {
	run, err := p.store.getByID(ctx, runID)
	if err != nil {
		return fmt.Errorf("retry: load run: %w", err)
	}
	if orchestration.RunStatus(run.Status) != orchestration.StatusFailed {
		return fmt.Errorf("retry: run %s is %s, not failed", runID, run.Status)
	}

	// Reset the failed step(s) back to pending.
	for i := range run.Steps {
		if run.Steps[i].Status == "failed" {
			run.Steps[i].Status = "pending"
			run.Steps[i].Error = ""
			run.Steps[i].StartedAt = nil
			run.Steps[i].FinishedAt = nil
			run.Steps[i].Meta = nil
		}
	}

	// Mark the run as pending so the worker picks it up.
	if err := p.store.updateStatus(ctx, runID, orchestration.StatusPending, "", "", run.Steps); err != nil {
		return fmt.Errorf("retry: update status: %w", err)
	}

	// Re-enqueue to the worker pool.
	p.enqueue(runID)

	slog.InfoContext(ctx, "orchestration: run retry enqueued", "run_id", runID)
	return nil
}

func (p *pool) cleanupResumeCh(runID uuid.UUID) {
	p.mu.Lock()
	delete(p.resumeChs, runID)
	p.mu.Unlock()
}

func (p *pool) publish(ev orchestration.Event) {
	if p.engine != nil {
		p.engine.Publish(ev)
	}
}
