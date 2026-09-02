package orchestration_test

import (
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/pkg/orchestration"
)

func TestOpenGate_UsesGateOpenedAtWhenPresent(t *testing.T) {
	opened := time.Date(2026, 6, 2, 8, 0, 0, 0, time.UTC)
	run := &orchestration.Run{
		CreatedAt: opened.Add(-time.Hour), // would be wrong if used
		Steps: []orchestration.StepLog{
			{Name: "draft_assessment", Status: "done"},
			{Name: "adapt_strategy", Status: "awaiting_human", GateOpenedAt: &opened},
		},
	}

	idx, parkedSince := orchestration.OpenGate(run)
	if idx != 1 {
		t.Errorf("stepIndex = %d, want 1", idx)
	}
	if !parkedSince.Equal(opened) {
		t.Errorf("parkedSince = %v, want %v", parkedSince, opened)
	}
}

// TestOpenGate_FallsBackToCreatedAt reproduces the run parked in the dev
// database since June: it predates GateOpenedAt, and its UpdatedAt was
// touched by something unrelated to the workflow. CreatedAt is the only
// timestamp on the row that has not drifted.
func TestOpenGate_FallsBackToCreatedAt(t *testing.T) {
	created := time.Date(2026, 6, 2, 8, 47, 54, 0, time.UTC)
	run := &orchestration.Run{
		CreatedAt: created,
		UpdatedAt: created.Add(90 * 24 * time.Hour), // the phantom touch
		Steps: []orchestration.StepLog{
			{Name: "adapt_strategy", Status: "awaiting_human"}, // no GateOpenedAt
		},
	}

	_, parkedSince := orchestration.OpenGate(run)
	if !parkedSince.Equal(created) {
		t.Errorf("parkedSince = %v, want CreatedAt %v (not UpdatedAt)", parkedSince, created)
	}
}

func TestOpenGate_NoOpenStepReturnsNegativeIndex(t *testing.T) {
	run := &orchestration.Run{
		Steps: []orchestration.StepLog{{Name: "draft_assessment", Status: "done"}},
	}
	idx, _ := orchestration.OpenGate(run)
	if idx != -1 {
		t.Errorf("stepIndex = %d, want -1 for a run with no open gate", idx)
	}
}

func TestFindAbandonedGates_RespectsThreshold(t *testing.T) {
	now := time.Now().UTC()
	old := now.Add(-100 * 24 * time.Hour)
	recent := now.Add(-time.Hour)

	abandonedID, recentID := uuid.New(), uuid.New()
	runs := []*orchestration.Run{
		{ID: abandonedID, CreatedAt: old, Steps: []orchestration.StepLog{
			{Name: "adapt_strategy", Status: "awaiting_human", GateOpenedAt: &old},
		}},
		{ID: recentID, CreatedAt: recent, Steps: []orchestration.StepLog{
			{Name: "adapt_strategy", Status: "awaiting_human", GateOpenedAt: &recent},
		}},
	}

	got := orchestration.FindAbandonedGates(runs, 60*24*time.Hour, now)
	if len(got) != 1 {
		t.Fatalf("got %d abandoned gates, want 1: %+v", len(got), got)
	}
	if got[0].Run.ID != abandonedID {
		t.Errorf("abandoned run = %s, want %s", got[0].Run.ID, abandonedID)
	}
	if got[0].StepIndex != 0 {
		t.Errorf("StepIndex = %d, want 0", got[0].StepIndex)
	}
}

func TestFindAbandonedGates_EmptyWhenNoneExceedThreshold(t *testing.T) {
	now := time.Now().UTC()
	recent := now.Add(-time.Minute)
	runs := []*orchestration.Run{
		{CreatedAt: recent, Steps: []orchestration.StepLog{
			{Name: "adapt_strategy", Status: "awaiting_human", GateOpenedAt: &recent},
		}},
	}

	got := orchestration.FindAbandonedGates(runs, time.Hour, now)
	if len(got) != 0 {
		t.Errorf("got %d abandoned gates, want 0", len(got))
	}
}
