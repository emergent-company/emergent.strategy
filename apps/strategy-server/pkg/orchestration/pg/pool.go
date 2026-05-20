package pg

import (
	"context"
	"fmt"
	"log/slog"
	"sync"
	"time"

	"github.com/google/uuid"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/pkg/orchestration"
)

// pool is a fixed-size goroutine worker pool that executes orchestration runs.
type pool struct {
	size      int
	queue     chan uuid.UUID          // run IDs waiting for a worker
	resumeChs map[uuid.UUID]chan bool // per-run resume signals
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

	select {
	case p.queue <- runID:
	case <-p.stopCh:
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
	for {
		select {
		case runID := <-p.queue:
			p.executeRun(runID)
		case <-p.stopCh:
			return
		}
	}
}

func (p *pool) executeRun(runID uuid.UUID) {
	ctx := context.Background()

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
		// Skip already-done steps (e.g. on retry after server restart — future).
		if run.Steps[i].Status == "done" {
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

		if step.HumanGate {
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
