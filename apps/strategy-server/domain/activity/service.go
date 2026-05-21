// Package activity provides an append-only activity stream for the continuous
// READY-FIRE-AIM loop. Every significant system event (proposal created, cycle
// approved, assessment committed, etc.) is recorded here and fanned out to SSE
// subscribers keyed by instance_id.
//
// The activity stream is intentionally simple:
//   - One table: strategy_activities (id, instance_id, actor, event_type, payload, created_at)
//   - Record() persists and fans out. Non-blocking — failures degrade gracefully.
//   - Subscribe() returns a channel for SSE; Unsubscribe() tears it down.
//   - List() returns recent events for an instance (used by MCP and web).
package activity

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/uptrace/bun"
)

// ---------------------------------------------------------------------------
// Event types
// ---------------------------------------------------------------------------

// Well-known event type constants. Callers may use freeform strings; these are
// the canonical values produced by system components.
const (
	EventProposalCreated  = "proposal.created"
	EventProposalApproved = "proposal.approved"
	EventProposalDeferred = "proposal.deferred"
	EventProposalExpired  = "proposal.expired"

	EventCycleStarted   = "cycle.started"
	EventCycleCompleted = "cycle.completed"
	EventCycleAborted   = "cycle.aborted"
	EventCycleFailed    = "cycle.failed"

	EventAssessmentCommitted  = "assessment.committed"
	EventCalibrationCommitted = "calibration.committed"
	EventEvidenceIngested     = "evidence.ingested"
	EventEvidenceProcessed    = "evidence.processed"
	EventHeartbeatFired       = "heartbeat.fired"
)

// ---------------------------------------------------------------------------
// Activity model
// ---------------------------------------------------------------------------

// Activity is a single event in the activity stream.
type Activity struct {
	bun.BaseModel `bun:"table:strategy_activities"`

	ID         uuid.UUID       `bun:"id,pk"          json:"id"`
	InstanceID uuid.UUID       `bun:"instance_id"    json:"instance_id"`
	Actor      string          `bun:"actor"          json:"actor"` // "system" or user sub
	EventType  string          `bun:"event_type"     json:"event_type"`
	Payload    json.RawMessage `bun:"payload,type:jsonb" json:"payload"`
	CreatedAt  time.Time       `bun:"created_at"     json:"created_at"`
}

// RecordRequest carries the fields for a new activity record.
type RecordRequest struct {
	InstanceID uuid.UUID
	Actor      string         // defaults to "system"
	EventType  string         // required
	Payload    map[string]any // optional
}

// ---------------------------------------------------------------------------
// In-process fanout
// ---------------------------------------------------------------------------

const fanoutBufSize = 32

type fanout struct {
	mu          sync.Mutex
	subscribers map[uuid.UUID][]chan Activity
}

func newFanout() *fanout {
	return &fanout{subscribers: make(map[uuid.UUID][]chan Activity)}
}

func (f *fanout) subscribe(instanceID uuid.UUID) <-chan Activity {
	ch := make(chan Activity, fanoutBufSize)
	f.mu.Lock()
	f.subscribers[instanceID] = append(f.subscribers[instanceID], ch)
	f.mu.Unlock()
	return ch
}

func (f *fanout) unsubscribe(instanceID uuid.UUID, ch <-chan Activity) {
	f.mu.Lock()
	defer f.mu.Unlock()
	subs := f.subscribers[instanceID]
	for i, s := range subs {
		if s == ch {
			subs = append(subs[:i], subs[i+1:]...)
			close(s)
			break
		}
	}
	if len(subs) == 0 {
		delete(f.subscribers, instanceID)
	} else {
		f.subscribers[instanceID] = subs
	}
}

func (f *fanout) publish(instanceID uuid.UUID, ev Activity) {
	f.mu.Lock()
	subs := make([]chan Activity, len(f.subscribers[instanceID]))
	copy(subs, f.subscribers[instanceID])
	f.mu.Unlock()

	for _, ch := range subs {
		select {
		case ch <- ev:
		default:
			// drop on full — activity events are non-critical
		}
	}
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

// Service manages the activity stream.
type Service struct {
	db     *bun.DB
	fanout *fanout
}

// NewService creates an activity Service.
func NewService(db *bun.DB) *Service {
	return &Service{db: db, fanout: newFanout()}
}

// ---------------------------------------------------------------------------
// Record
// ---------------------------------------------------------------------------

// Record persists an activity event and fans it out to SSE subscribers.
// Non-blocking — DB failures are logged but do not return an error so that
// callers (proposal lifecycle, heartbeat, etc.) are not affected.
func (s *Service) Record(ctx context.Context, req RecordRequest) {
	if req.EventType == "" {
		slog.WarnContext(ctx, "activity: Record called with empty event_type — skipped")
		return
	}
	if req.Actor == "" {
		req.Actor = "system"
	}

	raw, _ := json.Marshal(req.Payload)
	if raw == nil {
		raw = json.RawMessage(`{}`)
	}

	ev := Activity{
		ID:         uuid.New(),
		InstanceID: req.InstanceID,
		Actor:      req.Actor,
		EventType:  req.EventType,
		Payload:    raw,
		CreatedAt:  time.Now().UTC(),
	}

	if _, err := s.db.NewInsert().Model(&ev).Exec(ctx); err != nil {
		slog.WarnContext(ctx, "activity: failed to persist event",
			"event_type", req.EventType,
			"instance_id", req.InstanceID,
			"err", err,
		)
		return
	}

	// Fan out to SSE subscribers after successful persist.
	s.fanout.publish(req.InstanceID, ev)

	slog.DebugContext(ctx, "activity: event recorded",
		"event_type", req.EventType,
		"instance_id", req.InstanceID,
		"actor", req.Actor,
	)
}

// ---------------------------------------------------------------------------
// Subscribe / Unsubscribe
// ---------------------------------------------------------------------------

// Subscribe returns a buffered channel that receives Activity events for the
// given instance. The caller must call Unsubscribe when the SSE connection closes.
func (s *Service) Subscribe(instanceID uuid.UUID) <-chan Activity {
	return s.fanout.subscribe(instanceID)
}

// Unsubscribe tears down the subscription and closes the channel.
func (s *Service) Unsubscribe(instanceID uuid.UUID, ch <-chan Activity) {
	s.fanout.unsubscribe(instanceID, ch)
}

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------

// List returns the most recent activity events for an instance, newest first.
// Limit defaults to 50 when 0.
func (s *Service) List(ctx context.Context, instanceID uuid.UUID, limit int) ([]Activity, error) {
	if limit <= 0 {
		limit = 50
	}
	if limit > 200 {
		limit = 200
	}

	var rows []Activity
	err := s.db.NewSelect().
		Model(&rows).
		Where("instance_id = ?", instanceID).
		OrderExpr("created_at DESC").
		Limit(limit).
		Scan(ctx)
	if err != nil {
		return nil, fmt.Errorf("list activities: %w", err)
	}
	return rows, nil
}
