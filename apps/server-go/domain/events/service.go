package events

import (
	"log/slog"
	"sync"
	"time"

	"github.com/emergent/emergent-core/pkg/logger"
)

// Subscriber is a callback function for receiving events
type Subscriber func(event EntityEvent)

// subscriberEntry holds a subscriber with a unique ID for removal
type subscriberEntry struct {
	id       uint64
	callback Subscriber
}

// Service handles event pub/sub for real-time updates
type Service struct {
	log         *slog.Logger
	subscribers map[string][]subscriberEntry // projectID -> subscribers
	mu          sync.RWMutex
	nextID      uint64
}

// NewService creates a new events service
func NewService(log *slog.Logger) *Service {
	return &Service{
		log:         log.With(logger.Scope("events.service")),
		subscribers: make(map[string][]subscriberEntry),
	}
}

// Subscribe registers a callback for events on a specific project
// Returns an unsubscribe function
func (s *Service) Subscribe(projectID string, callback Subscriber) func() {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.nextID++
	id := s.nextID
	entry := subscriberEntry{id: id, callback: callback}
	s.subscribers[projectID] = append(s.subscribers[projectID], entry)

	// Return unsubscribe function
	return func() {
		s.mu.Lock()
		defer s.mu.Unlock()

		subs := s.subscribers[projectID]
		for i, sub := range subs {
			if sub.id == id {
				s.subscribers[projectID] = append(subs[:i], subs[i+1:]...)
				break
			}
		}

		// Clean up empty subscriber lists
		if len(s.subscribers[projectID]) == 0 {
			delete(s.subscribers, projectID)
		}
	}
}

// Emit broadcasts an event to all subscribers for the project
func (s *Service) Emit(event EntityEvent) {
	s.mu.RLock()
	subs := s.subscribers[event.ProjectID]
	s.mu.RUnlock()

	if len(subs) == 0 {
		return
	}

	s.log.Debug("emitting event",
		slog.String("type", string(event.Type)),
		slog.String("entity", string(event.Entity)),
		slog.String("project_id", event.ProjectID),
		slog.Int("subscribers", len(subs)),
	)

	for _, sub := range subs {
		// Call subscriber in goroutine to avoid blocking
		go sub.callback(event)
	}
}

// EmitCreated emits an entity.created event
func (s *Service) EmitCreated(entity EntityType, id string, projectID string, opts *EmitOptions) {
	event := EntityEvent{
		Type:      EventTypeCreated,
		Entity:    entity,
		ID:        &id,
		ProjectID: projectID,
		Timestamp: time.Now().UTC().Format(time.RFC3339),
	}

	if opts != nil {
		event.Data = opts.Data
		event.Actor = opts.Actor
		event.Version = opts.Version
		event.ObjectType = opts.ObjectType
	}

	s.Emit(event)
}

// EmitUpdated emits an entity.updated event
func (s *Service) EmitUpdated(entity EntityType, id string, projectID string, opts *EmitOptions) {
	event := EntityEvent{
		Type:      EventTypeUpdated,
		Entity:    entity,
		ID:        &id,
		ProjectID: projectID,
		Timestamp: time.Now().UTC().Format(time.RFC3339),
	}

	if opts != nil {
		event.Data = opts.Data
		event.Actor = opts.Actor
		event.Version = opts.Version
		event.ObjectType = opts.ObjectType
	}

	s.Emit(event)
}

// EmitDeleted emits an entity.deleted event
func (s *Service) EmitDeleted(entity EntityType, id string, projectID string, opts *EmitOptions) {
	event := EntityEvent{
		Type:      EventTypeDeleted,
		Entity:    entity,
		ID:        &id,
		ProjectID: projectID,
		Timestamp: time.Now().UTC().Format(time.RFC3339),
	}

	if opts != nil {
		event.Actor = opts.Actor
		event.Version = opts.Version
		event.ObjectType = opts.ObjectType
	}

	s.Emit(event)
}

// EmitBatch emits an entity.batch event for multiple entities
func (s *Service) EmitBatch(entity EntityType, ids []string, projectID string, data map[string]any) {
	event := EntityEvent{
		Type:      EventTypeBatch,
		Entity:    entity,
		ID:        nil,
		IDs:       ids,
		ProjectID: projectID,
		Data:      data,
		Timestamp: time.Now().UTC().Format(time.RFC3339),
	}

	s.Emit(event)
}

// GetSubscriberCount returns the number of subscribers for a project
func (s *Service) GetSubscriberCount(projectID string) int {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return len(s.subscribers[projectID])
}

// GetTotalSubscriberCount returns the total number of subscribers across all projects
func (s *Service) GetTotalSubscriberCount() int {
	s.mu.RLock()
	defer s.mu.RUnlock()

	total := 0
	for _, subs := range s.subscribers {
		total += len(subs)
	}
	return total
}
