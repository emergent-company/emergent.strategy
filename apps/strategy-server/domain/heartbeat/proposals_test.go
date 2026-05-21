package heartbeat_test

// Tests for the cycle proposal lifecycle:
//   - maybeCreateProposal (via EvaluateAll) deduplicates
//   - ListProposals / GetProposal return correct data
//   - ApproveProposal starts a run and marks approved
//   - DeferProposal sets snooze_until and marks deferred
//   - ExpireStaleProposals transitions deferred → expired
//   - No duplicate proposal when one is already pending
//   - Heartbeat re-proposes after expiry

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/heartbeat"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/database"
)

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// mockStarter implements heartbeat.CycleStarter for tests.
type mockStarter struct {
	runID uuid.UUID
	err   error
}

func (m *mockStarter) StartRun(_ context.Context, _, _ string, _ map[string]any) (heartbeat.CycleRun, error) {
	if m.err != nil {
		return heartbeat.CycleRun{}, m.err
	}
	return heartbeat.CycleRun{ID: m.runID}, nil
}

// alwaysFiredEvaluator is a TriggerEvaluator that always fires with the given state.
type alwaysFiredEvaluator struct {
	reason string
	msg    string
}

func (a *alwaysFiredEvaluator) EvaluateTriggers(_ context.Context, _ uuid.UUID) heartbeat.TriggerState {
	return heartbeat.TriggerState{Fired: true, Reason: a.reason, ReasonMessage: a.msg}
}

func firedEval(reason, msg string) *alwaysFiredEvaluator {
	return &alwaysFiredEvaluator{reason: reason, msg: msg}
}

// ---------------------------------------------------------------------------
// TestProposal_CreateAndList
// ---------------------------------------------------------------------------

func TestProposal_CreateAndList(t *testing.T) {
	db := database.TestDB(t)
	ctx := context.Background()
	instID := seedInstance(t, db)
	svc := heartbeat.NewService(db, firedEval("time", "overdue"))

	// Trigger EvaluateAll — should create a heartbeat signal AND a proposal.
	results, err := svc.EvaluateAll(ctx)
	if err != nil {
		t.Fatalf("EvaluateAll: %v", err)
	}
	if len(results) != 1 {
		t.Fatalf("expected 1 trigger result, got %d", len(results))
	}

	proposals, err := svc.ListProposals(ctx, instID, "pending")
	if err != nil {
		t.Fatalf("ListProposals: %v", err)
	}
	if len(proposals) != 1 {
		t.Fatalf("expected 1 pending proposal, got %d", len(proposals))
	}
	p := proposals[0]
	if p.InstanceID != instID {
		t.Errorf("proposal instance_id = %s, want %s", p.InstanceID, instID)
	}
	if p.TriggerReason != "time" {
		t.Errorf("trigger_reason = %q, want %q", p.TriggerReason, "time")
	}
	if p.Status != "pending" {
		t.Errorf("status = %q, want pending", p.Status)
	}
}

// ---------------------------------------------------------------------------
// TestProposal_NoDuplicate
// ---------------------------------------------------------------------------

func TestProposal_NoDuplicate(t *testing.T) {
	db := database.TestDB(t)
	ctx := context.Background()
	seedInstance(t, db)
	svc := heartbeat.NewService(db, firedEval("time", "overdue"))

	// First tick — creates one proposal.
	if _, err := svc.EvaluateAll(ctx); err != nil {
		t.Fatalf("EvaluateAll #1: %v", err)
	}
	// Second tick — trigger still fires, but proposal already pending → no duplicate.
	if _, err := svc.EvaluateAll(ctx); err != nil {
		t.Fatalf("EvaluateAll #2: %v", err)
	}

	// Only one proposal should exist across both ticks.
	// We use listAll (no status filter) by passing empty status.
	var allCount int
	_ = db.NewSelect().TableExpr("cycle_proposals").ColumnExpr("COUNT(*)").Scan(ctx, &allCount)
	if allCount != 1 {
		t.Errorf("expected 1 total proposal, got %d", allCount)
	}
}

// ---------------------------------------------------------------------------
// TestProposal_GetProposal
// ---------------------------------------------------------------------------

func TestProposal_GetProposal(t *testing.T) {
	db := database.TestDB(t)
	ctx := context.Background()
	instID := seedInstance(t, db)
	svc := heartbeat.NewService(db, firedEval("signals", "too many signals"))

	if _, err := svc.EvaluateAll(ctx); err != nil {
		t.Fatalf("EvaluateAll: %v", err)
	}

	proposals, _ := svc.ListProposals(ctx, instID, "pending")
	if len(proposals) == 0 {
		t.Fatal("expected at least one proposal")
	}

	got, err := svc.GetProposal(ctx, proposals[0].ID)
	if err != nil {
		t.Fatalf("GetProposal: %v", err)
	}
	if got.ID != proposals[0].ID {
		t.Errorf("GetProposal returned wrong proposal: %s", got.ID)
	}
}

// ---------------------------------------------------------------------------
// TestProposal_GetProposal_NotFound
// ---------------------------------------------------------------------------

func TestProposal_GetProposal_NotFound(t *testing.T) {
	db := database.TestDB(t)
	ctx := context.Background()
	svc := heartbeat.NewService(db, &mockEvaluator{})

	_, err := svc.GetProposal(ctx, uuid.New())
	if !errors.Is(err, heartbeat.ErrProposalNotFound) {
		t.Errorf("expected ErrProposalNotFound, got %v", err)
	}
}

// ---------------------------------------------------------------------------
// TestProposal_Approve
// ---------------------------------------------------------------------------

func TestProposal_Approve(t *testing.T) {
	db := database.TestDB(t)
	ctx := context.Background()
	instID := seedInstance(t, db)
	svc := heartbeat.NewService(db, firedEval("time", "overdue"))

	if _, err := svc.EvaluateAll(ctx); err != nil {
		t.Fatalf("EvaluateAll: %v", err)
	}
	proposals, _ := svc.ListProposals(ctx, instID, "pending")
	if len(proposals) == 0 {
		t.Fatal("expected a pending proposal")
	}

	runID := uuid.New()
	starter := &mockStarter{runID: runID}
	approved, err := svc.ApproveProposal(ctx, proposals[0].ID, starter, "aim_cycle")
	if err != nil {
		t.Fatalf("ApproveProposal: %v", err)
	}
	if approved.Status != "approved" {
		t.Errorf("status = %q, want approved", approved.Status)
	}
	if approved.ApprovedRunID == nil || *approved.ApprovedRunID != runID {
		t.Errorf("approved_run_id = %v, want %s", approved.ApprovedRunID, runID)
	}
	if approved.ResolvedAt == nil {
		t.Error("resolved_at should be set after approval")
	}

	// After approval, proposal is no longer pending.
	pending, _ := svc.ListProposals(ctx, instID, "pending")
	if len(pending) != 0 {
		t.Errorf("expected 0 pending proposals after approval, got %d", len(pending))
	}
}

// ---------------------------------------------------------------------------
// TestProposal_Approve_AlreadyApproved
// ---------------------------------------------------------------------------

func TestProposal_Approve_AlreadyApproved(t *testing.T) {
	db := database.TestDB(t)
	ctx := context.Background()
	instID := seedInstance(t, db)
	svc := heartbeat.NewService(db, firedEval("time", "overdue"))

	if _, err := svc.EvaluateAll(ctx); err != nil {
		t.Fatalf("EvaluateAll: %v", err)
	}
	proposals, _ := svc.ListProposals(ctx, instID, "pending")
	if len(proposals) == 0 {
		t.Fatal("expected pending proposal")
	}
	proposalID := proposals[0].ID

	starter := &mockStarter{runID: uuid.New()}
	if _, err := svc.ApproveProposal(ctx, proposalID, starter, "aim_cycle"); err != nil {
		t.Fatalf("first ApproveProposal: %v", err)
	}
	// Second approval should fail.
	_, err := svc.ApproveProposal(ctx, proposalID, starter, "aim_cycle")
	if !errors.Is(err, heartbeat.ErrProposalNotPending) {
		t.Errorf("expected ErrProposalNotPending on second approval, got %v", err)
	}
}

// ---------------------------------------------------------------------------
// TestProposal_Defer
// ---------------------------------------------------------------------------

func TestProposal_Defer(t *testing.T) {
	db := database.TestDB(t)
	ctx := context.Background()
	instID := seedInstance(t, db)
	svc := heartbeat.NewService(db, firedEval("time", "overdue"))

	if _, err := svc.EvaluateAll(ctx); err != nil {
		t.Fatalf("EvaluateAll: %v", err)
	}
	proposals, _ := svc.ListProposals(ctx, instID, "pending")
	if len(proposals) == 0 {
		t.Fatal("expected pending proposal")
	}

	deferred, err := svc.DeferProposal(ctx, proposals[0].ID, 3*24*time.Hour)
	if err != nil {
		t.Fatalf("DeferProposal: %v", err)
	}
	if deferred.Status != "deferred" {
		t.Errorf("status = %q, want deferred", deferred.Status)
	}
	if deferred.SnoozedUntil == nil {
		t.Error("snooze_until should be set")
	}
	expected := time.Now().Add(3 * 24 * time.Hour)
	if deferred.SnoozedUntil.Before(expected.Add(-5*time.Second)) ||
		deferred.SnoozedUntil.After(expected.Add(5*time.Second)) {
		t.Errorf("snooze_until = %v, want ~%v", deferred.SnoozedUntil, expected)
	}

	// Deferred proposal is NOT pending — still guards against new proposals.
	pending, _ := svc.ListProposals(ctx, instID, "pending")
	if len(pending) != 0 {
		t.Errorf("expected 0 pending after defer, got %d", len(pending))
	}
}

// ---------------------------------------------------------------------------
// TestProposal_Defer_DefaultDuration
// ---------------------------------------------------------------------------

func TestProposal_Defer_DefaultDuration(t *testing.T) {
	db := database.TestDB(t)
	ctx := context.Background()
	instID := seedInstance(t, db)
	svc := heartbeat.NewService(db, firedEval("time", "overdue"))

	if _, err := svc.EvaluateAll(ctx); err != nil {
		t.Fatalf("EvaluateAll: %v", err)
	}
	proposals, _ := svc.ListProposals(ctx, instID, "pending")
	if len(proposals) == 0 {
		t.Fatal("expected pending proposal")
	}

	// Zero duration → uses DefaultSnoozeDuration (7 days).
	deferred, err := svc.DeferProposal(ctx, proposals[0].ID, 0)
	if err != nil {
		t.Fatalf("DeferProposal(0): %v", err)
	}
	expected := time.Now().Add(heartbeat.DefaultSnoozeDuration)
	if deferred.SnoozedUntil.Before(expected.Add(-5*time.Second)) ||
		deferred.SnoozedUntil.After(expected.Add(5*time.Second)) {
		t.Errorf("default snooze_until = %v, want ~%v", deferred.SnoozedUntil, expected)
	}
}

// ---------------------------------------------------------------------------
// TestProposal_ExpireStale
// ---------------------------------------------------------------------------

func TestProposal_ExpireStale(t *testing.T) {
	db := database.TestDB(t)
	ctx := context.Background()
	instID := seedInstance(t, db)
	svc := heartbeat.NewService(db, firedEval("time", "overdue"))

	// Create and defer a proposal.
	if _, err := svc.EvaluateAll(ctx); err != nil {
		t.Fatalf("EvaluateAll: %v", err)
	}
	proposals, _ := svc.ListProposals(ctx, instID, "pending")
	if len(proposals) == 0 {
		t.Fatal("expected pending proposal")
	}
	if _, err := svc.DeferProposal(ctx, proposals[0].ID, time.Millisecond); err != nil {
		t.Fatalf("DeferProposal: %v", err)
	}

	// Sleep past the snooze window.
	time.Sleep(10 * time.Millisecond)

	// Expire stale — should transition deferred → expired.
	n, err := svc.ExpireStaleProposals(ctx)
	if err != nil {
		t.Fatalf("ExpireStaleProposals: %v", err)
	}
	if n != 1 {
		t.Errorf("expected 1 expired proposal, got %d", n)
	}

	expired, _ := svc.ListProposals(ctx, instID, "expired")
	if len(expired) != 1 {
		t.Errorf("expected 1 expired proposal in list, got %d", len(expired))
	}
}

// ---------------------------------------------------------------------------
// TestProposal_ReproposesAfterExpiry
// ---------------------------------------------------------------------------

func TestProposal_ReproposesAfterExpiry(t *testing.T) {
	db := database.TestDB(t)
	ctx := context.Background()
	instID := seedInstance(t, db)
	svc := heartbeat.NewService(db, firedEval("time", "overdue"))

	// Tick 1 — creates signal + proposal.
	results1, err := svc.EvaluateAll(ctx)
	if err != nil {
		t.Fatalf("EvaluateAll #1: %v", err)
	}
	if len(results1) == 0 {
		t.Fatal("expected trigger result from tick 1")
	}

	proposals, _ := svc.ListProposals(ctx, instID, "pending")
	if len(proposals) == 0 {
		t.Fatal("expected pending proposal after tick 1")
	}

	// Defer with 1ms snooze.
	if _, err := svc.DeferProposal(ctx, proposals[0].ID, time.Millisecond); err != nil {
		t.Fatalf("DeferProposal: %v", err)
	}

	// Acknowledge the heartbeat signal so tick 2 can re-fire the trigger.
	if err := svc.Acknowledge(ctx, results1[0].Signal.ID); err != nil {
		t.Fatalf("Acknowledge: %v", err)
	}

	// Sleep past snooze.
	time.Sleep(10 * time.Millisecond)

	// Tick 2 — EvaluateAll expires stale proposals, trigger fires again, new proposal created.
	if _, err := svc.EvaluateAll(ctx); err != nil {
		t.Fatalf("EvaluateAll #2: %v", err)
	}

	// Should have one expired + one new pending.
	pending, _ := svc.ListProposals(ctx, instID, "pending")
	if len(pending) != 1 {
		t.Errorf("expected 1 new pending proposal after expiry, got %d", len(pending))
	}
	expired, _ := svc.ListProposals(ctx, instID, "expired")
	if len(expired) != 1 {
		t.Errorf("expected 1 expired proposal, got %d", len(expired))
	}
}
