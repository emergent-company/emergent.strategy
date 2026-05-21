package orchestration_test

import (
	"context"
	"errors"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/pkg/orchestration"
)

// ── mock Backend ──────────────────────────────────────────────────────────────

type mockBackend struct {
	mu        sync.Mutex
	runs      map[uuid.UUID]*orchestration.Run
	enqueued  []uuid.UUID
	resumed   map[uuid.UUID]bool
	startErr  error
	enqueueFn func(run *orchestration.Run) // optional hook called by Enqueue
}

func newMockBackend() *mockBackend {
	return &mockBackend{
		runs:    make(map[uuid.UUID]*orchestration.Run),
		resumed: make(map[uuid.UUID]bool),
	}
}

func (m *mockBackend) Start(_ context.Context, _ map[string]orchestration.Workflow) error {
	return m.startErr
}
func (m *mockBackend) Stop(_ context.Context) error { return nil }

func (m *mockBackend) Enqueue(_ context.Context, run *orchestration.Run) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.runs[run.ID] = run
	m.enqueued = append(m.enqueued, run.ID)
	if m.enqueueFn != nil {
		m.enqueueFn(run)
	}
	return nil
}

func (m *mockBackend) Resume(_ context.Context, runID uuid.UUID, committed bool) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.resumed[runID] = committed
	return nil
}

func (m *mockBackend) GetRun(_ context.Context, runID uuid.UUID) (*orchestration.Run, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	r, ok := m.runs[runID]
	if !ok {
		return nil, errors.New("not found")
	}
	return r, nil
}

func (m *mockBackend) ListRuns(_ context.Context, _, _ string) ([]*orchestration.Run, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	var out []*orchestration.Run
	for _, r := range m.runs {
		out = append(out, r)
	}
	return out, nil
}

func (m *mockBackend) ActiveRun(_ context.Context, wfName, ck string) (*orchestration.Run, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	for _, r := range m.runs {
		if r.WorkflowName == wfName && r.ConcurrencyKey == ck &&
			(r.Status == orchestration.StatusPending ||
				r.Status == orchestration.StatusRunning ||
				r.Status == orchestration.StatusAwaitingHuman) {
			return r, nil
		}
	}
	return nil, nil
}

// ── mock Workflow ─────────────────────────────────────────────────────────────

type mockWorkflow struct{ name string }

func (w *mockWorkflow) Name() string                               { return w.name }
func (w *mockWorkflow) Steps() []orchestration.Step                { return nil }
func (w *mockWorkflow) ConcurrencyKey(r *orchestration.Run) string { return r.ConcurrencyKey }

// ── tests ─────────────────────────────────────────────────────────────────────

func TestEngine_StartRun_basic(t *testing.T) {
	be := newMockBackend()
	eng := orchestration.New(be)
	eng.Register(&mockWorkflow{name: "my_workflow"})

	ctx := context.Background()
	run, err := eng.StartRun(ctx, "my_workflow", "key-1", nil)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if run.ID == uuid.Nil {
		t.Fatal("expected non-nil run ID")
	}
	if run.Status != orchestration.StatusPending {
		t.Fatalf("want status pending, got %s", run.Status)
	}
	if len(be.enqueued) != 1 {
		t.Fatalf("expected 1 enqueued run, got %d", len(be.enqueued))
	}
}

func TestEngine_StartRun_unknown_workflow(t *testing.T) {
	be := newMockBackend()
	eng := orchestration.New(be)

	_, err := eng.StartRun(context.Background(), "nonexistent", "k", nil)
	if err == nil {
		t.Fatal("expected error for unknown workflow")
	}
}

func TestEngine_ConcurrencyLock(t *testing.T) {
	be := newMockBackend()
	eng := orchestration.New(be)
	eng.Register(&mockWorkflow{name: "wf"})

	ctx := context.Background()

	// First run enqueues fine.
	run1, err := eng.StartRun(ctx, "wf", "instance-abc", nil)
	if err != nil {
		t.Fatalf("first start: %v", err)
	}

	// Simulate the run being in running state.
	run1.Status = orchestration.StatusRunning

	// Second start with same key must fail with ErrAlreadyActive.
	_, err = eng.StartRun(ctx, "wf", "instance-abc", nil)
	if !errors.Is(err, orchestration.ErrAlreadyActive) {
		t.Fatalf("want ErrAlreadyActive, got %v", err)
	}
}

func TestEngine_Resume(t *testing.T) {
	be := newMockBackend()
	eng := orchestration.New(be)
	eng.Register(&mockWorkflow{name: "wf"})

	ctx := context.Background()
	run, _ := eng.StartRun(ctx, "wf", "k", nil)

	if err := eng.Resume(ctx, run.ID, true); err != nil {
		t.Fatalf("resume: %v", err)
	}
	if !be.resumed[run.ID] {
		t.Fatal("expected resumed=true")
	}
}

func TestEngine_SSEFanout(t *testing.T) {
	be := newMockBackend()
	eng := orchestration.New(be)
	eng.Register(&mockWorkflow{name: "wf"})

	ctx := context.Background()
	run, _ := eng.StartRun(ctx, "wf", "k", nil)

	sub := eng.Subscribe(run.ID)
	defer eng.Unsubscribe(run.ID, sub)

	ev := orchestration.Event{
		Type:   orchestration.EventStepStarted,
		RunID:  run.ID,
		Step:   "step1",
		Status: orchestration.StatusRunning,
	}
	eng.Publish(ev)

	select {
	case received := <-sub:
		if received.Type != orchestration.EventStepStarted {
			t.Fatalf("want step_started, got %s", received.Type)
		}
	case <-time.After(time.Second):
		t.Fatal("timeout waiting for SSE event")
	}
}

func TestEngine_Unsubscribe_closes_channel(t *testing.T) {
	be := newMockBackend()
	eng := orchestration.New(be)
	eng.Register(&mockWorkflow{name: "wf"})

	ctx := context.Background()
	run, _ := eng.StartRun(ctx, "wf", "k", nil)

	sub := eng.Subscribe(run.ID)
	eng.Unsubscribe(run.ID, sub)

	// Channel must be closed after unsubscribe.
	select {
	case _, ok := <-sub:
		if ok {
			t.Fatal("channel should be closed")
		}
	case <-time.After(time.Second):
		t.Fatal("channel not closed after Unsubscribe")
	}
}
