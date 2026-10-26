package ingest

import (
	"context"
	"errors"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/google/uuid"
)

// gate lets a test hold an ingest open and release it on demand.
type gate struct {
	started chan uuid.UUID
	release chan struct{}
	calls   atomic.Int32
	active  atomic.Int32
	maxSeen atomic.Int32
}

func newGate() *gate {
	return &gate{started: make(chan uuid.UUID, 64), release: make(chan struct{}, 64)}
}

func (g *gate) run(_ context.Context, id uuid.UUID) error {
	g.calls.Add(1)
	n := g.active.Add(1)
	for {
		m := g.maxSeen.Load()
		if n <= m || g.maxSeen.CompareAndSwap(m, n) {
			break
		}
	}
	g.started <- id
	<-g.release
	g.active.Add(-1)
	return nil
}

func waitStarted(t *testing.T, g *gate) uuid.UUID {
	t.Helper()
	select {
	case id := <-g.started:
		return id
	case <-time.After(5 * time.Second):
		t.Fatal("ingest did not start")
		return uuid.Nil
	}
}

func expectNoStart(t *testing.T, g *gate) {
	t.Helper()
	select {
	case id := <-g.started:
		t.Fatalf("unexpected ingest started for %s", id)
	case <-time.After(150 * time.Millisecond):
	}
}

func TestCoalescer_ManyTriggersWhileQueuedRunOnce(t *testing.T) {
	g := newGate()
	c := newCoalescer(8, 1, g.run)
	defer c.stop()
	id := uuid.New()

	// Block the single worker with another instance so id stays queued.
	blocker := uuid.New()
	c.schedule(blocker)
	waitStarted(t, g)

	for range 20 {
		c.schedule(id)
	}
	g.release <- struct{}{} // finish blocker
	if got := waitStarted(t, g); got != id {
		t.Fatalf("started %s, want %s", got, id)
	}
	g.release <- struct{}{}
	expectNoStart(t, g)
	if n := g.calls.Load(); n != 2 {
		t.Errorf("ingest ran %d times, want 2 (blocker + one coalesced run)", n)
	}
}

func TestCoalescer_ChangeDuringRunTriggersExactlyOneMoreRun(t *testing.T) {
	g := newGate()
	c := newCoalescer(8, 2, g.run)
	defer c.stop()
	id := uuid.New()

	c.schedule(id)
	waitStarted(t, g)
	for range 10 {
		c.schedule(id) // all arrive while the first run is in flight
	}
	g.release <- struct{}{}
	waitStarted(t, g) // the follow-up run
	g.release <- struct{}{}
	expectNoStart(t, g)

	if n := g.calls.Load(); n != 2 {
		t.Errorf("ingest ran %d times, want 2", n)
	}
	if m := g.maxSeen.Load(); m != 1 {
		t.Errorf("%d ingests of one instance ran concurrently, want 1", m)
	}
}

func TestCoalescer_DifferentInstancesRunInParallel(t *testing.T) {
	g := newGate()
	c := newCoalescer(8, 2, g.run)
	defer c.stop()

	c.schedule(uuid.New())
	c.schedule(uuid.New())
	waitStarted(t, g)
	waitStarted(t, g)
	if m := g.maxSeen.Load(); m != 2 {
		t.Errorf("max concurrency %d, want 2", m)
	}
	g.release <- struct{}{}
	g.release <- struct{}{}
}

func TestCoalescer_FullQueueDropsButStaysReschedulable(t *testing.T) {
	g := newGate()
	c := newCoalescer(1, 1, g.run)
	defer c.stop()

	running := uuid.New()
	c.schedule(running)
	waitStarted(t, g) // worker busy, queue empty

	queued, dropped := uuid.New(), uuid.New()
	c.schedule(queued)  // fills the 1-slot queue
	c.schedule(dropped) // no room: dropped (the Postgres dirty flag covers it)

	g.release <- struct{}{}
	if got := waitStarted(t, g); got != queued {
		t.Fatalf("started %s, want %s", got, queued)
	}
	g.release <- struct{}{}
	expectNoStart(t, g)

	// A dropped instance must not be stuck: scheduling it again works.
	c.schedule(dropped)
	if got := waitStarted(t, g); got != dropped {
		t.Fatalf("started %s, want %s", got, dropped)
	}
	g.release <- struct{}{}
}

func TestCoalescer_FailureDoesNotBlockLaterRuns(t *testing.T) {
	var calls atomic.Int32
	done := make(chan struct{}, 4)
	c := newCoalescer(8, 1, func(context.Context, uuid.UUID) error {
		n := calls.Add(1)
		done <- struct{}{}
		if n == 1 {
			return errors.New("memory down")
		}
		return nil
	})
	defer c.stop()
	id := uuid.New()

	c.schedule(id)
	<-done
	// The failed run must have released its slot.
	deadline := time.After(5 * time.Second)
	for {
		c.schedule(id)
		select {
		case <-done:
			return
		case <-time.After(20 * time.Millisecond):
		case <-deadline:
			t.Fatal("instance stuck after a failed ingest")
		}
	}
}

func TestCoalescer_StopWaitsForRunningIngest(t *testing.T) {
	g := newGate()
	c := newCoalescer(8, 1, g.run)
	c.schedule(uuid.New())
	waitStarted(t, g)

	stopped := make(chan struct{})
	go func() { c.stop(); close(stopped) }()

	select {
	case <-stopped:
		t.Fatal("stop returned while an ingest was still running")
	case <-time.After(100 * time.Millisecond):
	}
	g.release <- struct{}{}
	select {
	case <-stopped:
	case <-time.After(5 * time.Second):
		t.Fatal("stop did not return after the ingest finished")
	}

	// Scheduling after stop must neither panic nor run anything.
	c.schedule(uuid.New())
}

func TestCoalescer_ConcurrentSchedulingIsRaceFree(t *testing.T) {
	var runs atomic.Int32
	c := newCoalescer(64, 4, func(context.Context, uuid.UUID) error {
		runs.Add(1)
		return nil
	})
	ids := []uuid.UUID{uuid.New(), uuid.New(), uuid.New()}
	var wg sync.WaitGroup
	for range 8 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for i := range 200 {
				c.schedule(ids[i%len(ids)])
			}
		}()
	}
	wg.Wait()
	c.stop()
	if runs.Load() == 0 {
		t.Error("nothing ran")
	}
}
