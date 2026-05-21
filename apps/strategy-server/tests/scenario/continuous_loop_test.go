// Package scenario contains multi-service integration tests for the continuous
// READY-FIRE-AIM loop. Each test exercises a full scenario across domain packages
// using a real Postgres database (via database.TestDB).
//
// Unlike the browser-based tests in tests/e2e, these tests do not require a
// running server or Chrome. They run as part of the normal test suite:
//
//	go test ./tests/scenario/...
package scenario

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/uptrace/bun"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/aim"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/evidence"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/heartbeat"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/instance"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/strategy"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/version"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/workspace"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/audit"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/database"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/domain"
)

// ---------------------------------------------------------------------------
// Test infrastructure
// ---------------------------------------------------------------------------

func seedOrg(t *testing.T, db *bun.DB) uuid.UUID {
	t.Helper()
	orgID := uuid.New()
	_, err := db.ExecContext(context.Background(),
		"INSERT INTO orgs (id, name, slug, created_at, updated_at) VALUES (?, ?, ?, NOW(), NOW())",
		orgID, "Scenario Org", "scenario-"+orgID.String()[:8])
	if err != nil {
		t.Fatalf("seed org: %v", err)
	}
	return orgID
}

func seedInstance(t *testing.T, db *bun.DB) uuid.UUID {
	t.Helper()
	ctx := context.Background()
	orgID := seedOrg(t, db)

	wsID := uuid.New()
	_, err := db.NewInsert().Model(&domain.Workspace{
		ID:          wsID,
		GithubOwner: "scenario-ws-" + wsID.String()[:8],
		OrgID:       orgID,
	}).Exec(ctx)
	if err != nil {
		t.Fatalf("seed workspace: %v", err)
	}

	instID := uuid.New()
	_, err = db.NewInsert().Model(&domain.StrategyInstance{
		ID:          instID,
		WorkspaceID: wsID,
		Name:        "scenario-test-instance",
		Status:      domain.InstanceStatusActive,
	}).Exec(ctx)
	if err != nil {
		t.Fatalf("seed instance: %v", err)
	}
	return instID
}

// aimEvaluatorAdapter adapts *aim.Service to heartbeat.TriggerEvaluator.
// The heartbeat package uses its own TriggerState type to avoid a circular import.
type aimEvaluatorAdapter struct{ svc *aim.Service }

func (a *aimEvaluatorAdapter) EvaluateTriggers(ctx context.Context, instanceID uuid.UUID) heartbeat.TriggerState {
	s := a.svc.EvaluateTriggers(ctx, instanceID)
	return heartbeat.TriggerState{
		Fired:            s.Fired,
		Reason:           s.Reason,
		ReasonMessage:    s.ReasonMessage,
		TriggerSignalIDs: s.TriggerSignalIDs,
		LastAssessmentAt: s.LastAssessmentAt,
	}
}

// mockCycleStarter records StartRun calls and returns a fixed run ID.
type mockCycleStarter struct {
	calls  []startRunCall
	runID  uuid.UUID
	errOut error
}

type startRunCall struct {
	workflowName   string
	concurrencyKey string
	input          map[string]any
}

func (m *mockCycleStarter) StartRun(_ context.Context, wf, ck string, input map[string]any) (heartbeat.CycleRun, error) {
	m.calls = append(m.calls, startRunCall{workflowName: wf, concurrencyKey: ck, input: input})
	if m.errOut != nil {
		return heartbeat.CycleRun{}, m.errOut
	}
	return heartbeat.CycleRun{ID: m.runID}, nil
}

// ---------------------------------------------------------------------------
// Scenario: Evidence → Trigger → Proposal → Approval → Evidence processed
// ---------------------------------------------------------------------------

// TestContinuousLoop_EvidenceToProposalToApproval tests the end-to-end path:
//
//  1. Evidence is ingested for an instance.
//  2. The heartbeat evaluates triggers — the evidence trigger fires because the
//     instance has no prior assessment and the evidence threshold is enabled.
//  3. A CycleProposal is created (pending).
//  4. The human approves the proposal via ApproveProposal.
//  5. The mockCycleStarter records that StartRun was called with the right params.
//  6. The proposal is marked approved with the returned run ID.
//  7. Evidence is explicitly marked processed (simulating what commit_batch does
//     after an assessment report batch is committed).
//  8. Evidence items are confirmed processed.
func TestContinuousLoop_EvidenceToProposalToApproval(t *testing.T) {
	db := database.TestDB(t)
	ctx := context.Background()
	instID := seedInstance(t, db)

	// --- Step 1: Ingest evidence ---
	evSvc := evidence.NewService(db)
	ev1Key, err := evSvc.Ingest(ctx, evidence.IngestRequest{
		InstanceID:  instID,
		Source:      evidence.Source{Name: "User interviews Q2", Type: "user_interview"},
		CollectedAt: time.Now().UTC(),
		Summary:     "Users report friction in onboarding",
		Tags:        []string{"ux", "onboarding"},
		Content:     map[string]any{"note": "3 of 5 users could not complete onboarding without help"},
	})
	if err != nil {
		t.Fatalf("Ingest ev1: %v", err)
	}

	ev2Key, err := evSvc.Ingest(ctx, evidence.IngestRequest{
		InstanceID:  instID,
		Source:      evidence.Source{Name: "Analytics export May", Type: "analytics_export"},
		CollectedAt: time.Now().UTC(),
		Summary:     "Activation rate dropped 8% MoM",
		Tags:        []string{"activation", "metric"},
		Content:     map[string]any{"activation_rate": 0.42, "prev_rate": 0.50},
	})
	if err != nil {
		t.Fatalf("Ingest ev2: %v", err)
	}

	// Confirm evidence is stored and unprocessed.
	count, err := evSvc.CountUnprocessed(ctx, instID, nil)
	if err != nil {
		t.Fatalf("CountUnprocessed: %v", err)
	}
	if count != 2 {
		t.Fatalf("expected 2 unprocessed evidence items, got %d", count)
	}

	// --- Step 2: Wire aim.Service as the trigger evaluator ---
	// aim.Service will fire the time trigger (no prior assessment) on this fresh instance.
	aimSvc := aim.NewService(db, nil) // no LLM needed for trigger evaluation
	hbSvc := heartbeat.NewService(db, &aimEvaluatorAdapter{svc: aimSvc}).WithEvidenceCounter(evSvc)

	results, err := hbSvc.EvaluateAll(ctx)
	if err != nil {
		t.Fatalf("EvaluateAll: %v", err)
	}
	if len(results) != 1 {
		t.Fatalf("expected 1 trigger result (time trigger: no prior assessment), got %d", len(results))
	}
	if results[0].InstanceID != instID {
		t.Errorf("trigger instance_id = %s, want %s", results[0].InstanceID, instID)
	}
	if results[0].Signal.Reason != "time" {
		t.Errorf("trigger reason = %q, want \"time\"", results[0].Signal.Reason)
	}

	// --- Step 3: Verify proposal was created ---
	proposals, err := hbSvc.ListProposals(ctx, instID, "pending")
	if err != nil {
		t.Fatalf("ListProposals: %v", err)
	}
	if len(proposals) != 1 {
		t.Fatalf("expected 1 pending proposal, got %d", len(proposals))
	}
	prop := proposals[0]
	if prop.InstanceID != instID {
		t.Errorf("proposal instance_id = %s, want %s", prop.InstanceID, instID)
	}
	// The proposal's EvidenceCount should reflect the 2 unprocessed items.
	if prop.EvidenceCount != 2 {
		t.Errorf("proposal evidence_count = %d, want 2", prop.EvidenceCount)
	}
	t.Logf("Proposal created: id=%s reason=%s evidence_count=%d", prop.ID, prop.TriggerReason, prop.EvidenceCount)

	// --- Step 4: Human approves the proposal ---
	runID := uuid.New()
	starter := &mockCycleStarter{runID: runID}
	approved, err := hbSvc.ApproveProposal(ctx, prop.ID, starter, "aim_cycle")
	if err != nil {
		t.Fatalf("ApproveProposal: %v", err)
	}

	// --- Step 5: Verify StartRun was called correctly ---
	if len(starter.calls) != 1 {
		t.Fatalf("expected 1 StartRun call, got %d", len(starter.calls))
	}
	call := starter.calls[0]
	if call.workflowName != "aim_cycle" {
		t.Errorf("StartRun workflowName = %q, want \"aim_cycle\"", call.workflowName)
	}
	if call.concurrencyKey != instID.String() {
		t.Errorf("StartRun concurrencyKey = %q, want %q", call.concurrencyKey, instID.String())
	}
	if call.input["instance_id"] != instID.String() {
		t.Errorf("StartRun input[instance_id] = %v, want %s", call.input["instance_id"], instID)
	}
	if call.input["proposal_id"] != prop.ID.String() {
		t.Errorf("StartRun input[proposal_id] = %v, want %s", call.input["proposal_id"], prop.ID)
	}

	// --- Step 6: Verify proposal is marked approved with the run ID ---
	if approved.Status != "approved" {
		t.Errorf("proposal status = %q, want \"approved\"", approved.Status)
	}
	if approved.ApprovedRunID == nil || *approved.ApprovedRunID != runID {
		t.Errorf("proposal approved_run_id = %v, want %s", approved.ApprovedRunID, runID)
	}
	if approved.ResolvedAt == nil {
		t.Error("proposal resolved_at should be set after approval")
	}
	t.Logf("Proposal approved: run_id=%s", runID)

	// Confirm no pending proposals remain.
	pending, _ := hbSvc.ListProposals(ctx, instID, "pending")
	if len(pending) != 0 {
		t.Errorf("expected 0 pending proposals after approval, got %d", len(pending))
	}

	// --- Step 7: Simulate post-assessment MarkProcessed ---
	// In production this is called by the strategy service's CommitBatch hook
	// when it finds assessment_report mutations referencing evidence keys.
	// Here we call it directly to verify the evidence lifecycle completes.
	batchRef := "assessment-batch-" + uuid.New().String() // simulated batch/assessment reference
	if err := evSvc.MarkProcessed(ctx, instID, []string{ev1Key, ev2Key}, batchRef); err != nil {
		t.Fatalf("MarkProcessed: %v", err)
	}

	// --- Step 8: Verify all evidence is now processed ---
	remaining, err := evSvc.CountUnprocessed(ctx, instID, nil)
	if err != nil {
		t.Fatalf("CountUnprocessed after MarkProcessed: %v", err)
	}
	if remaining != 0 {
		t.Errorf("expected 0 unprocessed evidence after MarkProcessed, got %d", remaining)
	}

	// Verify individual items show processed status.
	item1, err := evSvc.Get(ctx, instID, ev1Key)
	if err != nil {
		t.Fatalf("Get ev1: %v", err)
	}
	if item1.ProcessingStatus != "processed" {
		t.Errorf("ev1 processing_status = %q, want \"processed\"", item1.ProcessingStatus)
	}
	if item1.ProcessedBy == nil || *item1.ProcessedBy != batchRef {
		t.Errorf("ev1 processed_by = %v, want %q", item1.ProcessedBy, batchRef)
	}
	if item1.ProcessedAt == nil {
		t.Error("ev1 processed_at should be set")
	}

	item2, err := evSvc.Get(ctx, instID, ev2Key)
	if err != nil {
		t.Fatalf("Get ev2: %v", err)
	}
	if item2.ProcessingStatus != "processed" {
		t.Errorf("ev2 processing_status = %q, want \"processed\"", item2.ProcessingStatus)
	}

	t.Logf("Full loop verified: evidence ingested → trigger fired → proposal created → approved → evidence processed")
}

// ---------------------------------------------------------------------------
// Scenario: Second heartbeat tick does not create a duplicate proposal
// ---------------------------------------------------------------------------

// TestContinuousLoop_NoDuplicateProposal verifies that the heartbeat deduplication
// guard prevents creating a second proposal while the first is still pending.
func TestContinuousLoop_NoDuplicateProposal(t *testing.T) {
	db := database.TestDB(t)
	ctx := context.Background()
	seedInstance(t, db)

	aimSvc := aim.NewService(db, nil)
	hbSvc := heartbeat.NewService(db, &aimEvaluatorAdapter{svc: aimSvc})

	// Tick 1 — trigger fires, proposal created.
	if _, err := hbSvc.EvaluateAll(ctx); err != nil {
		t.Fatalf("EvaluateAll #1: %v", err)
	}

	// Tick 2 — trigger fires again (signal is deduped; no second signal is created either).
	// The signal deduplication also prevents a second proposal.
	if _, err := hbSvc.EvaluateAll(ctx); err != nil {
		t.Fatalf("EvaluateAll #2: %v", err)
	}

	var totalProposals int
	_ = db.NewSelect().TableExpr("cycle_proposals").ColumnExpr("COUNT(*)").Scan(ctx, &totalProposals)
	if totalProposals != 1 {
		t.Errorf("expected 1 total proposal across 2 ticks, got %d", totalProposals)
	}
}

// ---------------------------------------------------------------------------
// Scenario: Defer → snooze expires → new proposal created on next tick
// ---------------------------------------------------------------------------

// TestContinuousLoop_DeferAndReproposeAfterExpiry verifies that a deferred
// proposal expires and a new one is created once the snooze window passes.
func TestContinuousLoop_DeferAndReproposeAfterExpiry(t *testing.T) {
	db := database.TestDB(t)
	ctx := context.Background()
	instID := seedInstance(t, db)

	aimSvc := aim.NewService(db, nil)
	hbSvc := heartbeat.NewService(db, &aimEvaluatorAdapter{svc: aimSvc})

	// Tick 1 → signal + proposal.
	results1, err := hbSvc.EvaluateAll(ctx)
	if err != nil {
		t.Fatalf("EvaluateAll #1: %v", err)
	}
	if len(results1) == 0 {
		t.Fatal("expected trigger result from tick 1")
	}
	proposals, _ := hbSvc.ListProposals(ctx, instID, "pending")
	if len(proposals) == 0 {
		t.Fatal("expected pending proposal after tick 1")
	}

	// Defer with 1ms snooze.
	if _, err := hbSvc.DeferProposal(ctx, proposals[0].ID, time.Millisecond); err != nil {
		t.Fatalf("DeferProposal: %v", err)
	}

	// Acknowledge the heartbeat signal so tick 2 can re-fire the trigger.
	if err := hbSvc.Acknowledge(ctx, results1[0].Signal.ID); err != nil {
		t.Fatalf("Acknowledge: %v", err)
	}

	time.Sleep(10 * time.Millisecond) // wait for snooze to expire

	// Tick 2 — expires stale proposal, fires trigger, creates new proposal.
	if _, err := hbSvc.EvaluateAll(ctx); err != nil {
		t.Fatalf("EvaluateAll #2: %v", err)
	}

	pending, _ := hbSvc.ListProposals(ctx, instID, "pending")
	if len(pending) != 1 {
		t.Errorf("expected 1 new pending proposal after snooze expired, got %d", len(pending))
	}

	expired, _ := hbSvc.ListProposals(ctx, instID, "expired")
	if len(expired) != 1 {
		t.Errorf("expected 1 expired proposal, got %d", len(expired))
	}

	t.Logf("Reproposal after snooze expiry confirmed: pending=%d expired=%d", len(pending), len(expired))
}

// ---------------------------------------------------------------------------
// Scenario: SnapshotCycle → strategy_versions row with source='aim_cycle'
// ---------------------------------------------------------------------------

// TestSnapshotCycle_PublishesVersionRow verifies that aim.Service.SnapshotCycle
// creates a strategy_versions row stamped with source='aim_cycle' and a label
// of the form "Cycle N — <Decision>".
//
// This test exercises the full path:
//
//	aim.Service.WithVersionPublisher(versionSvc)
//	→ SnapshotCycle(ctx, instanceID, 0, "persevere")
//	→ version.Service.PublishAIMCycle(...)
//	→ INSERT INTO strategy_versions (source='aim_cycle')
func TestSnapshotCycle_PublishesVersionRow(t *testing.T) {
	db := database.TestDB(t)
	ctx := audit.ContextWithSource(context.Background(), audit.SourceSystem)

	// Seed org, workspace, instance with at least one committed artifact so
	// Publish can take a non-empty snapshot.
	orgID := seedOrg(t, db)

	wsSvc := workspace.NewService(db)
	ws, err := wsSvc.CreateWorkspace(ctx, "snapshot-cycle-test", nil, orgID)
	if err != nil {
		t.Fatalf("CreateWorkspace: %v", err)
	}

	instSvc := instance.NewService(db)
	inst, err := instSvc.ImportInstance(ctx, instance.ImportParams{
		WorkspaceID: ws.ID,
		Name:        "Snapshot Cycle Test",
	})
	if err != nil {
		t.Fatalf("ImportInstance: %v", err)
	}

	stratSvc := strategy.NewService(db)
	batchID, err := stratSvc.Stage(ctx, strategy.StageParams{
		InstanceID:   inst.ID,
		ArtifactType: "north_star",
		ArtifactKey:  "north_star",
		Action:       "create",
		Payload:      map[string]any{"north_star": map[string]any{"vision": "test vision"}},
	})
	if err != nil {
		t.Fatalf("Stage north_star: %v", err)
	}
	if _, err := stratSvc.CommitBatch(ctx, batchID); err != nil {
		t.Fatalf("CommitBatch: %v", err)
	}

	// Wire aim service with version publisher.
	verSvc := version.NewService(db)
	aimSvc := aim.NewService(db, nil).WithVersionPublisher(verSvc)

	// --- Call SnapshotCycle ---
	if err := aimSvc.SnapshotCycle(ctx, inst.ID, 0, "persevere"); err != nil {
		t.Fatalf("SnapshotCycle: %v", err)
	}

	// --- Verify a version row was created ---
	versions, err := verSvc.List(ctx, inst.ID)
	if err != nil {
		t.Fatalf("List versions: %v", err)
	}
	if len(versions) != 1 {
		t.Fatalf("expected 1 version after SnapshotCycle, got %d", len(versions))
	}
	v := versions[0]

	if v.Source != "aim_cycle" {
		t.Errorf("version source = %q, want \"aim_cycle\"", v.Source)
	}
	wantLabel := "Cycle 1 — Persevere"
	if v.Label == nil || *v.Label != wantLabel {
		t.Errorf("version label = %v, want %q", v.Label, wantLabel)
	}
	t.Logf("Version published: id=%s label=%s source=%s", v.ID, *v.Label, v.Source)

	// --- Second cycle increments the cycle number ---
	if err := aimSvc.SnapshotCycle(ctx, inst.ID, 0, "pivot"); err != nil {
		t.Fatalf("SnapshotCycle #2: %v", err)
	}

	versions2, err := verSvc.List(ctx, inst.ID)
	if err != nil {
		t.Fatalf("List versions #2: %v", err)
	}
	if len(versions2) != 2 {
		t.Fatalf("expected 2 versions after second SnapshotCycle, got %d", len(versions2))
	}
	// List returns newest first.
	v2 := versions2[0]
	wantLabel2 := "Cycle 2 — Pivot"
	if v2.Label == nil || *v2.Label != wantLabel2 {
		t.Errorf("second version label = %v, want %q", v2.Label, wantLabel2)
	}
	if v2.Source != "aim_cycle" {
		t.Errorf("second version source = %q, want \"aim_cycle\"", v2.Source)
	}

	// --- CountAIMCycles returns the right count ---
	count, err := verSvc.CountAIMCycles(ctx, inst.ID)
	if err != nil {
		t.Fatalf("CountAIMCycles: %v", err)
	}
	if count != 2 {
		t.Errorf("CountAIMCycles = %d, want 2", count)
	}
	t.Logf("CountAIMCycles = %d (correct)", count)
}
