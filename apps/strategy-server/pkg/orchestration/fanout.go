package orchestration

import (
	"sync"

	"github.com/google/uuid"
)

const fanoutBufferSize = 16

// fanout manages in-process SSE event distribution. It is not part of the
// Backend interface — SSE is a UI concern and must work regardless of which
// backend is active.
type fanout struct {
	mu          sync.Mutex
	subscribers map[uuid.UUID][]chan Event
}

func newFanout() *fanout {
	return &fanout{
		subscribers: make(map[uuid.UUID][]chan Event),
	}
}

// Subscribe returns a buffered channel that will receive Events for runID.
// The caller must call Unsubscribe when done (e.g. on SSE disconnect).
func (f *fanout) Subscribe(runID uuid.UUID) <-chan Event {
	ch := make(chan Event, fanoutBufferSize)
	f.mu.Lock()
	f.subscribers[runID] = append(f.subscribers[runID], ch)
	f.mu.Unlock()
	return ch
}

// Unsubscribe removes the channel and closes it.
func (f *fanout) Unsubscribe(runID uuid.UUID, ch <-chan Event) {
	f.mu.Lock()
	defer f.mu.Unlock()

	subs := f.subscribers[runID]
	for i, s := range subs {
		if s == ch {
			subs = append(subs[:i], subs[i+1:]...)
			close(s)
			break
		}
	}
	if len(subs) == 0 {
		delete(f.subscribers, runID)
	} else {
		f.subscribers[runID] = subs
	}
}

// Publish sends ev to all channels subscribed for runID.
// Events are dropped (not blocking) when a channel's buffer is full.
func (f *fanout) Publish(runID uuid.UUID, ev Event) {
	f.mu.Lock()
	subs := make([]chan Event, len(f.subscribers[runID]))
	copy(subs, f.subscribers[runID])
	f.mu.Unlock()

	for _, ch := range subs {
		select {
		case ch <- ev:
		default:
			// drop on full — progress events are non-critical
		}
	}
}
