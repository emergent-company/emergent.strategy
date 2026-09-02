package adk

import (
	"iter"
	"maps"
	"slices"
	"sync"
	"time"

	adksession "google.golang.org/adk/v2/session"
)

// sessionView is an in-memory snapshot of a persisted ADK session, satisfying
// session.Session. It is handed to callers by Create/Get/List and is the value
// ADK passes back into AppendEvent.
//
// The snapshot is mutable in memory so that an in-flight invocation observes
// its own writes (including "temp:" keys, which are deliberately never
// persisted). Durable state lives in Postgres; this type never writes.
type sessionView struct {
	mu        sync.RWMutex
	appName   string
	userID    string
	id        string
	state     *stateMap
	events    *eventList
	updatedAt time.Time
}

var _ adksession.Session = (*sessionView)(nil)

func newSessionView(appName, userID, id string, state map[string]any, events []*adksession.Event, updatedAt time.Time) *sessionView {
	if state == nil {
		state = map[string]any{}
	}
	return &sessionView{
		appName:   appName,
		userID:    userID,
		id:        id,
		state:     &stateMap{values: state},
		events:    &eventList{events: events},
		updatedAt: updatedAt,
	}
}

func (s *sessionView) ID() string      { return s.id }
func (s *sessionView) AppName() string { return s.appName }
func (s *sessionView) UserID() string  { return s.userID }

func (s *sessionView) State() adksession.State   { return s.state }
func (s *sessionView) Events() adksession.Events { return s.events }

func (s *sessionView) LastUpdateTime() time.Time {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.updatedAt
}

// applyEvent mirrors an appended event onto the in-memory view so the caller
// sees its own write without a re-read. The full delta is applied here —
// including "temp:" keys — because temp state is valid for the remainder of the
// invocation; it is the persistence layer that drops it.
func (s *sessionView) applyEvent(event *adksession.Event) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if len(event.Actions.StateDelta) > 0 {
		s.state.merge(event.Actions.StateDelta)
	}
	s.events.append(event)
	s.updatedAt = event.Timestamp
}

// stateMap is a concurrency-safe session.State backed by a plain map.
type stateMap struct {
	mu     sync.RWMutex
	values map[string]any
}

var _ adksession.State = (*stateMap)(nil)

func (s *stateMap) Get(key string) (any, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	v, ok := s.values[key]
	if !ok {
		return nil, adksession.ErrStateKeyNotExist
	}
	return v, nil
}

func (s *stateMap) Set(key string, value any) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.values == nil {
		s.values = map[string]any{}
	}
	s.values[key] = value
	return nil
}

// All yields a snapshot, so iteration is safe against concurrent writes.
func (s *stateMap) All() iter.Seq2[string, any] {
	s.mu.RLock()
	snapshot := maps.Clone(s.values)
	s.mu.RUnlock()

	return func(yield func(string, any) bool) {
		for k, v := range snapshot {
			if !yield(k, v) {
				return
			}
		}
	}
}

func (s *stateMap) merge(delta map[string]any) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.values == nil {
		s.values = map[string]any{}
	}
	maps.Copy(s.values, delta)
}

// eventList is a concurrency-safe, ordered session.Events.
type eventList struct {
	mu     sync.RWMutex
	events []*adksession.Event
}

var _ adksession.Events = (*eventList)(nil)

func (e *eventList) Len() int {
	e.mu.RLock()
	defer e.mu.RUnlock()
	return len(e.events)
}

func (e *eventList) At(i int) *adksession.Event {
	e.mu.RLock()
	defer e.mu.RUnlock()
	if i < 0 || i >= len(e.events) {
		return nil
	}
	return e.events[i]
}

// All yields a snapshot of the slice header, preserving order.
func (e *eventList) All() iter.Seq[*adksession.Event] {
	e.mu.RLock()
	snapshot := slices.Clone(e.events)
	e.mu.RUnlock()

	return func(yield func(*adksession.Event) bool) {
		for _, ev := range snapshot {
			if !yield(ev) {
				return
			}
		}
	}
}

func (e *eventList) append(event *adksession.Event) {
	e.mu.Lock()
	defer e.mu.Unlock()
	e.events = append(e.events, event)
}
