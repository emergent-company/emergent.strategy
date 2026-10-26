package ingest

import (
	"context"
	"log/slog"
	"sync"

	"github.com/google/uuid"
)

// coalescer runs at most one ingest per instance at a time and collapses any
// number of triggers that arrive while an instance is queued or running into a
// single follow-up run.
//
// The queue is bounded and never blocks the caller. A trigger that does not fit
// is dropped; that is safe because every change is also recorded durably in
// Postgres (memory_dirty_since) and the heartbeat re-enqueues dirty instances.
type coalescer struct {
	run func(ctx context.Context, instanceID uuid.UUID) error

	mu      sync.Mutex
	state   map[uuid.UUID]*instanceState
	stopped bool

	queue  chan uuid.UUID
	wg     sync.WaitGroup
	cancel context.CancelFunc
	ctx    context.Context
}

// instanceState is guarded by coalescer.mu.
type instanceState struct {
	queued  bool // sitting in the queue, not yet picked up
	running bool // a worker is ingesting it
	again   bool // triggered while running: run once more afterwards
}

func newCoalescer(queueSize, workers int, run func(context.Context, uuid.UUID) error) *coalescer {
	if queueSize <= 0 {
		queueSize = 100
	}
	if workers <= 0 {
		workers = 2
	}
	ctx, cancel := context.WithCancel(context.Background())
	c := &coalescer{
		run:    run,
		state:  make(map[uuid.UUID]*instanceState),
		queue:  make(chan uuid.UUID, queueSize),
		ctx:    ctx,
		cancel: cancel,
	}
	for range workers {
		c.wg.Add(1)
		go c.worker()
	}
	return c
}

// schedule requests an ingest of instanceID. It never blocks.
func (c *coalescer) schedule(instanceID uuid.UUID) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.stopped {
		return
	}
	st := c.state[instanceID]
	if st == nil {
		st = &instanceState{}
		c.state[instanceID] = st
	}
	switch {
	case st.running:
		st.again = true
	case st.queued:
		// Already waiting; the run that picks it up will see every change so far.
	default:
		select {
		case c.queue <- instanceID:
			st.queued = true
		default:
			delete(c.state, instanceID)
			slog.Warn("ingest: queue full, trigger dropped; the dirty flag will re-enqueue it",
				"instance_id", instanceID)
		}
	}
}

func (c *coalescer) worker() {
	defer c.wg.Done()
	for id := range c.queue {
		c.process(id)
	}
}

func (c *coalescer) process(id uuid.UUID) {
	c.mu.Lock()
	st := c.state[id]
	if st == nil {
		c.mu.Unlock()
		return
	}
	st.queued = false
	st.running = true
	st.again = false
	c.mu.Unlock()

	if err := c.run(c.ctx, id); err != nil {
		slog.Error("ingest: failed; the instance stays dirty and the heartbeat will retry",
			"instance_id", id, "err", err)
	}

	c.mu.Lock()
	defer c.mu.Unlock()
	st.running = false
	if st.again && !c.stopped {
		st.again = false
		select {
		case c.queue <- id:
			st.queued = true
			return
		default:
			slog.Warn("ingest: queue full, follow-up dropped; the dirty flag will re-enqueue it",
				"instance_id", id)
		}
	}
	delete(c.state, id)
}

// stop refuses new work, lets queued and running ingests finish, and waits for
// the workers to exit.
func (c *coalescer) stop() {
	c.mu.Lock()
	if c.stopped {
		c.mu.Unlock()
		c.wg.Wait()
		return
	}
	c.stopped = true
	close(c.queue)
	c.mu.Unlock()
	c.wg.Wait()
	c.cancel()
}
