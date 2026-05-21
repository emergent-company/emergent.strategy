package scenario

// Tests for the signal novelty filter in EvaluateTriggers.
//
// The core invariant: the signal-based trigger counts only ripple signals
// created AFTER the last committed assessment_report. This prevents chronic
// signal backlogs from perpetually re-firing the trigger between cycles.

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/uptrace/bun"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/aim"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/audit"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/database"
)

// seedRippleSignalAt inserts an active critical ripple signal at the given time.
func seedRippleSignalAt(t *testing.T, ctx context.Context, db *bun.DB, instID uuid.UUID, severity string, at time.Time) uuid.UUID {
	t.Helper()
	id := uuid.New()
	_, err := db.ExecContext(ctx,
		`INSERT INTO ripple_signals
		 (id, instance_id, signal_type, severity, source_key, target_key, description, status, created_at)
		 VALUES (?, ?, 'drift', ?, 'fd-001', 'north_star', 'test signal', 'active', ?)`,
		id, instID, severity, at)
	if err != nil {
		t.Fatalf("seed ripple signal: %v", err)
	}
	return id
}

// seedAssessmentReportAt inserts a committed assessment_report artifact updated at the given time.
// strategy_mutations has no committed_at column — status defaults to 'committed'.
func seedAssessmentReportAt(t *testing.T, ctx context.Context, db *bun.DB, instID uuid.UUID, at time.Time) {
	t.Helper()
	mutID := uuid.New()
	batchID := uuid.New()
	_, err := db.ExecContext(ctx,
		`INSERT INTO strategy_mutations
		 (id, batch_id, instance_id, artifact_type, artifact_key, action, payload, source, created_at)
		 VALUES (?, ?, ?, 'assessment_report', 'assessment-draft', 'create', '{}', 'system', ?)`,
		mutID, batchID, instID, at)
	if err != nil {
		t.Fatalf("seed mutation: %v", err)
	}
	_, err = db.ExecContext(ctx,
		`INSERT INTO strategy_artifacts
		 (id, instance_id, artifact_type, artifact_key, payload, mutation_id, created_at, updated_at)
		 VALUES (?, ?, 'assessment_report', 'assessment-draft', '{}', ?, ?, ?)`,
		uuid.New(), instID, mutID, at, at)
	if err != nil {
		t.Fatalf("seed assessment artifact: %v", err)
	}
}

// ---------------------------------------------------------------------------
// TestSignalNoveltyFilter_OldSignalsIgnored
// ---------------------------------------------------------------------------

// TestSignalNoveltyFilter_OldSignalsIgnored verifies that signals created
// BEFORE the last assessment do not fire the signal trigger, even if there
// are enough of them to exceed the threshold.
func TestSignalNoveltyFilter_OldSignalsIgnored(t *testing.T) {
	db := database.TestDB(t)
	ctx := audit.ContextWithSource(context.Background(), audit.SourceSystem)
	instID := seedInstance(t, db)

	now := time.Now().UTC()
	assessmentAt := now.Add(-1 * time.Hour) // assessment happened 1 hour ago
	oldSignalAt := now.Add(-2 * time.Hour)  // signals from 2 hours ago (before assessment)

	// Seed an assessment, then 5 old signals (all before assessment).
	seedAssessmentReportAt(t, ctx, db, instID, assessmentAt)
	for i := 0; i < 5; i++ {
		seedRippleSignalAt(t, ctx, db, instID, "critical", oldSignalAt)
	}

	state := aim.NewService(db, nil).EvaluateTriggers(ctx, instID)

	// Signal trigger must NOT fire — all signals are old (pre-assessment).
	if state.Fired && state.Reason == "signals" {
		t.Errorf("signal trigger fired on old signals — novelty filter broken: %q", state.ReasonMessage)
	}
	if len(state.TriggerSignalIDs) > 0 {
		t.Errorf("TriggerSignalIDs should be empty for old signals, got %v", state.TriggerSignalIDs)
	}
	t.Logf("Old-signal trigger correctly suppressed: fired=%v reason=%q", state.Fired, state.Reason)
}

// ---------------------------------------------------------------------------
// TestSignalNoveltyFilter_NewSignalsFire
// ---------------------------------------------------------------------------

// TestSignalNoveltyFilter_NewSignalsFire verifies that signals created AFTER
// the last assessment fire the trigger when above the threshold, and that the
// triggering signal IDs are returned in TriggerState.
func TestSignalNoveltyFilter_NewSignalsFire(t *testing.T) {
	db := database.TestDB(t)
	ctx := audit.ContextWithSource(context.Background(), audit.SourceSystem)
	instID := seedInstance(t, db)

	now := time.Now().UTC()
	assessmentAt := now.Add(-2 * time.Hour)
	newSignalAt := now.Add(-30 * time.Minute) // after assessment

	seedAssessmentReportAt(t, ctx, db, instID, assessmentAt)

	// 4 novel critical signals (default threshold is 3 → 4 > 3 → should fire).
	var seededIDs []uuid.UUID
	for i := 0; i < 4; i++ {
		id := seedRippleSignalAt(t, ctx, db, instID, "critical", newSignalAt)
		seededIDs = append(seededIDs, id)
	}

	state := aim.NewService(db, nil).EvaluateTriggers(ctx, instID)

	if !state.Fired {
		t.Fatalf("expected trigger to fire for novel signals, got Fired=false")
	}
	if state.Reason != "signals" {
		t.Errorf("expected reason=signals, got %q", state.Reason)
	}
	if len(state.TriggerSignalIDs) != 4 {
		t.Errorf("expected 4 TriggerSignalIDs, got %d", len(state.TriggerSignalIDs))
	}
	// All returned IDs must be from the seeded set.
	seededSet := make(map[string]bool, len(seededIDs))
	for _, id := range seededIDs {
		seededSet[id.String()] = true
	}
	for _, id := range state.TriggerSignalIDs {
		if !seededSet[id] {
			t.Errorf("TriggerSignalIDs contains unexpected ID %q", id)
		}
	}
	t.Logf("Novel signals fired correctly: reason=%q ids=%d", state.Reason, len(state.TriggerSignalIDs))
}

// ---------------------------------------------------------------------------
// TestSignalNoveltyFilter_MixedSignals
// ---------------------------------------------------------------------------

// TestSignalNoveltyFilter_MixedSignals verifies that only novel signals count
// when there is a mix of old and new signals. 2 old + 4 new → only the 4 new
// ones count toward the threshold.
func TestSignalNoveltyFilter_MixedSignals(t *testing.T) {
	db := database.TestDB(t)
	ctx := audit.ContextWithSource(context.Background(), audit.SourceSystem)
	instID := seedInstance(t, db)

	now := time.Now().UTC()
	assessmentAt := now.Add(-2 * time.Hour)
	oldSignalAt := now.Add(-3 * time.Hour)    // before assessment
	newSignalAt := now.Add(-30 * time.Minute) // after assessment

	seedAssessmentReportAt(t, ctx, db, instID, assessmentAt)

	// 2 old signals (should not count toward threshold).
	for i := 0; i < 2; i++ {
		seedRippleSignalAt(t, ctx, db, instID, "critical", oldSignalAt)
	}
	// 4 new signals (should count → above threshold of 3 → fires).
	for i := 0; i < 4; i++ {
		seedRippleSignalAt(t, ctx, db, instID, "critical", newSignalAt)
	}

	state := aim.NewService(db, nil).EvaluateTriggers(ctx, instID)

	if !state.Fired || state.Reason != "signals" {
		t.Fatalf("expected signal trigger with 4 novel signals, got fired=%v reason=%q", state.Fired, state.Reason)
	}
	// Only the 4 new signals should appear in TriggerSignalIDs.
	if len(state.TriggerSignalIDs) != 4 {
		t.Errorf("expected 4 TriggerSignalIDs (novel only), got %d", len(state.TriggerSignalIDs))
	}
	t.Logf("Mixed signals: %d novel counted, old suppressed", len(state.TriggerSignalIDs))
}

// ---------------------------------------------------------------------------
// TestSignalNoveltyFilter_BelowThreshold
// ---------------------------------------------------------------------------

// TestSignalNoveltyFilter_BelowThreshold verifies that novel signals below
// the threshold do not fire the signal trigger, and also don't fire the time
// trigger when the assessment was recent.
func TestSignalNoveltyFilter_BelowThreshold(t *testing.T) {
	db := database.TestDB(t)
	ctx := audit.ContextWithSource(context.Background(), audit.SourceSystem)
	instID := seedInstance(t, db)

	now := time.Now().UTC()
	// Assessment was 1 hour ago — well within the 90-day default cadence.
	seedAssessmentReportAt(t, ctx, db, instID, now.Add(-1*time.Hour))

	// Only 2 novel critical signals — below default threshold of 3.
	for i := 0; i < 2; i++ {
		seedRippleSignalAt(t, ctx, db, instID, "critical", now.Add(-10*time.Minute))
	}

	state := aim.NewService(db, nil).EvaluateTriggers(ctx, instID)

	if state.Fired {
		t.Errorf("expected no trigger (2 signals < threshold 3, recent assessment), got fired=true reason=%q: %q",
			state.Reason, state.ReasonMessage)
	}
	t.Logf("Correctly quiet: 2 novel signals below threshold, assessment recent")
}

// ---------------------------------------------------------------------------
// TestSignalNoveltyFilter_NoAssessment_AllSignalsCount
// ---------------------------------------------------------------------------

// TestSignalNoveltyFilter_NoAssessment_AllSignalsCount verifies that when
// there has never been an assessment, all active critical signals count
// (no cutoff applies). This is the "first cycle" scenario.
func TestSignalNoveltyFilter_NoAssessment_AllSignalsCount(t *testing.T) {
	db := database.TestDB(t)
	ctx := audit.ContextWithSource(context.Background(), audit.SourceSystem)
	instID := seedInstance(t, db)

	// No assessment — seed 4 critical signals (> default threshold of 3).
	for i := 0; i < 4; i++ {
		seedRippleSignalAt(t, ctx, db, instID, "critical",
			time.Now().UTC().Add(-time.Duration(i)*time.Minute))
	}

	state := aim.NewService(db, nil).EvaluateTriggers(ctx, instID)

	if !state.Fired {
		t.Fatalf("expected trigger for first-cycle instance with 4 signals, got Fired=false")
	}
	// Signal trigger should fire first (checked before time trigger).
	if state.Reason == "signals" && len(state.TriggerSignalIDs) == 0 {
		t.Errorf("signal trigger fired but TriggerSignalIDs is empty")
	}
	t.Logf("First-cycle trigger: reason=%q signals=%d", state.Reason, len(state.TriggerSignalIDs))
}
