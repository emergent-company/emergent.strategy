package aim

import (
	"context"
	"encoding/json"
	"testing"

	"github.com/google/uuid"
	"github.com/uptrace/bun"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/database"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/domain"
)

// ---------------------------------------------------------------------------
// Test scaffolding — seeds the FK chain strategy_artifacts requires
// (orgs -> workspaces -> strategy_instances -> strategy_mutations ->
// strategy_artifacts). Local to this file: domain/aim has no shared
// DB-backed test helper today (its other tests are pure unit tests), and
// this exact shape is not exported by any other package's test file.
// ---------------------------------------------------------------------------

func seedTestOrg(t *testing.T, db *bun.DB) uuid.UUID {
	t.Helper()
	orgID := uuid.New()
	_, err := db.ExecContext(context.Background(),
		"INSERT INTO orgs (id, name, slug, created_at, updated_at) VALUES (?, ?, ?, NOW(), NOW())",
		orgID, "Test Org", "test-org-"+orgID.String()[:8])
	if err != nil {
		t.Fatalf("seed org: %v", err)
	}
	return orgID
}

func seedInstance(t *testing.T, db *bun.DB) uuid.UUID {
	t.Helper()
	ctx := context.Background()
	orgID := seedTestOrg(t, db)

	wsID := uuid.New()
	if _, err := db.NewInsert().Model(&domain.Workspace{
		ID:          wsID,
		GithubOwner: "test-" + wsID.String()[:8],
		OrgID:       orgID,
	}).Exec(ctx); err != nil {
		t.Fatalf("seed workspace: %v", err)
	}

	instID := uuid.New()
	if _, err := db.NewInsert().Model(&domain.StrategyInstance{
		ID:          instID,
		WorkspaceID: wsID,
		Name:        "test-instance",
		Status:      "active",
	}).Exec(ctx); err != nil {
		t.Fatalf("seed instance: %v", err)
	}
	return instID
}

// seedTriggerConfig commits a TriggerConfig artifact for instID. Mirrors
// domain/ripple/convergence_e2e_test.go's mutation-then-artifact pattern,
// hand-inserted rather than routed through strategy.Service.CommitBatch:
// GetTriggerConfig only ever reads strategy_artifacts directly
// (service.go's loadTriggerConfig), so exercising the full commit pipeline
// here would test nothing this test needs.
func seedTriggerConfig(t *testing.T, db *bun.DB, instID uuid.UUID, cfg TriggerConfig) {
	t.Helper()
	ctx := context.Background()

	payload, err := json.Marshal(cfg)
	if err != nil {
		t.Fatalf("marshal trigger config: %v", err)
	}

	mutID := uuid.New()
	if _, err := db.NewInsert().Model(&domain.StrategyMutation{
		ID:           mutID,
		InstanceID:   instID,
		ArtifactType: domain.ArtifactTypeAIMTriggerConfig,
		ArtifactKey:  "aim_trigger_config",
		Action:       domain.MutationActionCreate,
		Payload:      payload,
		Status:       domain.MutationStatusCommitted,
		Source:       "system",
	}).Exec(ctx); err != nil {
		t.Fatalf("seed mutation: %v", err)
	}

	if _, err := db.NewInsert().Model(&domain.StrategyArtifact{
		ID:           uuid.New(),
		InstanceID:   instID,
		ArtifactKey:  "aim_trigger_config",
		ArtifactType: domain.ArtifactTypeAIMTriggerConfig,
		Status:       domain.ArtifactStatusActive,
		Payload:      payload,
		MutationID:   mutID,
	}).Exec(ctx); err != nil {
		t.Fatalf("seed artifact: %v", err)
	}
}

// ---------------------------------------------------------------------------
// CycleWorkflow.Plan
// ---------------------------------------------------------------------------

// TestPlan_DefaultOrder_NoTriggerConfigArtifact confirms an instance that
// has never set a trigger config artifact gets exactly CycleSteps()'s
// six-step default order — the "every existing instance is unaffected"
// guarantee Part C4 depends on.
func TestPlan_DefaultOrder_NoTriggerConfigArtifact(t *testing.T) {
	db := database.TestDB(t)
	instID := seedInstance(t, db)

	w := NewCycleWorkflow(NewService(db), nil)
	got, err := w.Plan(context.Background(), instID, nil)
	if err != nil {
		t.Fatalf("Plan: %v", err)
	}

	want := []string{"draft_assessment", "draft_calibration", "adapt_strategy", "adapt_foundations", "align_portfolio", "snapshot_cycle"}
	assertStepNames(t, got, want)
}

// TestPlan_SkipFoundations_DifferentInstancesDifferentPlans is Part C4's
// core requirement: two different instances, decided once at cycle start,
// genuinely run different step SETS — not just different data — driven by
// a real, already-existing per-instance config surface (TriggerConfig),
// not a synthetic field invented only for this test.
func TestPlan_SkipFoundations_DifferentInstancesDifferentPlans(t *testing.T) {
	db := database.TestDB(t)
	svc := NewService(db)
	w := NewCycleWorkflow(svc, nil)
	ctx := context.Background()

	skipInstance := seedInstance(t, db)
	seedTriggerConfig(t, db, skipInstance, TriggerConfig{SkipFoundations: true})

	keepInstance := seedInstance(t, db)
	seedTriggerConfig(t, db, keepInstance, TriggerConfig{SkipFoundations: false})

	skipPlan, err := w.Plan(ctx, skipInstance, nil)
	if err != nil {
		t.Fatalf("Plan(skipInstance): %v", err)
	}
	keepPlan, err := w.Plan(ctx, keepInstance, nil)
	if err != nil {
		t.Fatalf("Plan(keepInstance): %v", err)
	}

	assertStepNames(t, skipPlan, []string{"draft_assessment", "draft_calibration", "adapt_strategy", "align_portfolio", "snapshot_cycle"})
	assertStepNames(t, keepPlan, []string{"draft_assessment", "draft_calibration", "adapt_strategy", "adapt_foundations", "align_portfolio", "snapshot_cycle"})

	if len(skipPlan) == len(keepPlan) {
		t.Fatalf("expected different step SETS (different lengths), got equal length %d for both", len(skipPlan))
	}
}

// TestPlan_FiltersCompleted confirms Plan never re-includes a name already
// present in completed, regardless of where in the order it falls —
// exercised at a mid-cycle boundary, not just cycle start.
func TestPlan_FiltersCompleted(t *testing.T) {
	db := database.TestDB(t)
	instID := seedInstance(t, db)
	w := NewCycleWorkflow(NewService(db), nil)

	completed := []StepOutput{
		{Step: "draft_assessment"},
		{Step: "draft_calibration"},
	}
	got, err := w.Plan(context.Background(), instID, completed)
	if err != nil {
		t.Fatalf("Plan: %v", err)
	}
	assertStepNames(t, got, []string{"adapt_strategy", "adapt_foundations", "align_portfolio", "snapshot_cycle"})
}

func assertStepNames(t *testing.T, got, want []string) {
	t.Helper()
	if len(got) != len(want) {
		t.Fatalf("step names = %v, want %v", got, want)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("step names = %v, want %v", got, want)
		}
	}
}
