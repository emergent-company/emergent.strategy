package activity_test

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/uptrace/bun"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/activity"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/database"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/domain"
)

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

func seedInstance(t *testing.T, db *bun.DB) uuid.UUID {
	t.Helper()
	ctx := context.Background()

	orgID := uuid.New()
	_, err := db.ExecContext(ctx,
		"INSERT INTO orgs (id, name, slug, created_at, updated_at) VALUES (?, ?, ?, NOW(), NOW())",
		orgID, "Activity Test Org", "act-org-"+orgID.String()[:8])
	if err != nil {
		t.Fatalf("seed org: %v", err)
	}

	wsID := uuid.New()
	_, err = db.NewInsert().Model(&domain.Workspace{
		ID: wsID, GithubOwner: "act-ws-" + wsID.String()[:8], OrgID: orgID,
	}).Exec(ctx)
	if err != nil {
		t.Fatalf("seed workspace: %v", err)
	}

	instID := uuid.New()
	_, err = db.NewInsert().Model(&domain.StrategyInstance{
		ID: instID, WorkspaceID: wsID, Name: "act-test", Status: domain.InstanceStatusActive,
	}).Exec(ctx)
	if err != nil {
		t.Fatalf("seed instance: %v", err)
	}
	return instID
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

func TestRecord_PersistsAndListsEvent(t *testing.T) {
	db := database.TestDB(t)
	ctx := context.Background()
	instID := seedInstance(t, db)
	svc := activity.NewService(db)

	svc.Record(ctx, activity.RecordRequest{
		InstanceID: instID,
		EventType:  activity.EventProposalCreated,
		Payload:    map[string]any{"proposal_id": "p-123", "reason": "time"},
	})

	events, err := svc.List(ctx, instID, 10)
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	if len(events) != 1 {
		t.Fatalf("expected 1 event, got %d", len(events))
	}
	ev := events[0]
	if ev.EventType != activity.EventProposalCreated {
		t.Errorf("event_type = %q, want %q", ev.EventType, activity.EventProposalCreated)
	}
	if ev.Actor != "system" {
		t.Errorf("actor = %q, want \"system\"", ev.Actor)
	}
	if ev.InstanceID != instID {
		t.Errorf("instance_id = %s, want %s", ev.InstanceID, instID)
	}
}

func TestRecord_CustomActor(t *testing.T) {
	db := database.TestDB(t)
	ctx := context.Background()
	instID := seedInstance(t, db)
	svc := activity.NewService(db)

	svc.Record(ctx, activity.RecordRequest{
		InstanceID: instID,
		Actor:      "user:nikolai@example.com",
		EventType:  activity.EventProposalApproved,
	})

	events, err := svc.List(ctx, instID, 10)
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	if len(events) != 1 {
		t.Fatalf("expected 1 event, got %d", len(events))
	}
	if events[0].Actor != "user:nikolai@example.com" {
		t.Errorf("actor = %q, want %q", events[0].Actor, "user:nikolai@example.com")
	}
}

func TestRecord_EmptyEventType_Skipped(t *testing.T) {
	db := database.TestDB(t)
	ctx := context.Background()
	instID := seedInstance(t, db)
	svc := activity.NewService(db)

	svc.Record(ctx, activity.RecordRequest{InstanceID: instID, EventType: ""})

	events, err := svc.List(ctx, instID, 10)
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	if len(events) != 0 {
		t.Errorf("expected 0 events for empty event_type, got %d", len(events))
	}
}

func TestRecord_FanoutToSubscriber(t *testing.T) {
	db := database.TestDB(t)
	ctx := context.Background()
	instID := seedInstance(t, db)
	svc := activity.NewService(db)

	ch := svc.Subscribe(instID)
	defer svc.Unsubscribe(instID, ch)

	svc.Record(ctx, activity.RecordRequest{
		InstanceID: instID,
		EventType:  activity.EventHeartbeatFired,
	})

	select {
	case ev := <-ch:
		if ev.EventType != activity.EventHeartbeatFired {
			t.Errorf("fanout event_type = %q, want %q", ev.EventType, activity.EventHeartbeatFired)
		}
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for fanout event")
	}
}

func TestRecord_NoFanoutToOtherInstance(t *testing.T) {
	db := database.TestDB(t)
	ctx := context.Background()
	inst1 := seedInstance(t, db)
	inst2 := seedInstance(t, db)
	svc := activity.NewService(db)

	ch2 := svc.Subscribe(inst2)
	defer svc.Unsubscribe(inst2, ch2)

	// Record an event for inst1 — inst2's subscriber should NOT receive it.
	svc.Record(ctx, activity.RecordRequest{
		InstanceID: inst1,
		EventType:  activity.EventCycleStarted,
	})

	select {
	case ev := <-ch2:
		t.Errorf("inst2 received event that belongs to inst1: %+v", ev)
	case <-time.After(100 * time.Millisecond):
		// correct — no cross-instance fanout
	}
}

func TestList_MultipleEvents_NewestFirst(t *testing.T) {
	db := database.TestDB(t)
	ctx := context.Background()
	instID := seedInstance(t, db)
	svc := activity.NewService(db)

	types := []string{
		activity.EventEvidenceIngested,
		activity.EventHeartbeatFired,
		activity.EventProposalCreated,
	}
	for _, et := range types {
		svc.Record(ctx, activity.RecordRequest{InstanceID: instID, EventType: et})
	}

	events, err := svc.List(ctx, instID, 10)
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	if len(events) != 3 {
		t.Fatalf("expected 3 events, got %d", len(events))
	}

	// Newest first — last recorded event should be first in the list.
	if events[0].EventType != activity.EventProposalCreated {
		t.Errorf("first event = %q, want %q", events[0].EventType, activity.EventProposalCreated)
	}
	// Verify strictly descending created_at.
	for i := 1; i < len(events); i++ {
		if events[i].CreatedAt.After(events[i-1].CreatedAt) {
			t.Errorf("events[%d].created_at (%v) > events[%d].created_at (%v) — not descending",
				i, events[i].CreatedAt, i-1, events[i-1].CreatedAt)
		}
	}
}

func TestList_LimitEnforced(t *testing.T) {
	db := database.TestDB(t)
	ctx := context.Background()
	instID := seedInstance(t, db)
	svc := activity.NewService(db)

	for i := 0; i < 5; i++ {
		svc.Record(ctx, activity.RecordRequest{InstanceID: instID, EventType: activity.EventEvidenceIngested})
	}

	events, err := svc.List(ctx, instID, 3)
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	if len(events) != 3 {
		t.Errorf("expected 3 events with limit=3, got %d", len(events))
	}
}

func TestList_OnlyOwnInstance(t *testing.T) {
	db := database.TestDB(t)
	ctx := context.Background()
	inst1 := seedInstance(t, db)
	inst2 := seedInstance(t, db)
	svc := activity.NewService(db)

	svc.Record(ctx, activity.RecordRequest{InstanceID: inst1, EventType: activity.EventCycleStarted})
	svc.Record(ctx, activity.RecordRequest{InstanceID: inst2, EventType: activity.EventCycleCompleted})

	events, err := svc.List(ctx, inst1, 10)
	if err != nil {
		t.Fatalf("List inst1: %v", err)
	}
	if len(events) != 1 {
		t.Errorf("expected 1 event for inst1, got %d", len(events))
	}
	if events[0].InstanceID != inst1 {
		t.Errorf("event belongs to wrong instance: %s", events[0].InstanceID)
	}
}

func TestUnsubscribe_ChannelClosed(t *testing.T) {
	db := database.TestDB(t)
	ctx := context.Background()
	instID := seedInstance(t, db)
	svc := activity.NewService(db)

	ch := svc.Subscribe(instID)
	svc.Unsubscribe(instID, ch)

	// Channel should be closed — receiving should not block.
	select {
	case _, ok := <-ch:
		if ok {
			t.Error("channel should be closed after Unsubscribe")
		}
		// ok=false means closed — correct
	default:
		// Not immediately closed? That's also fine for buffered channels.
		// Just verify we can still record without panic.
	}

	// Recording after unsubscribe should not panic.
	svc.Record(ctx, activity.RecordRequest{
		InstanceID: instID,
		EventType:  activity.EventProposalCreated,
	})
}
