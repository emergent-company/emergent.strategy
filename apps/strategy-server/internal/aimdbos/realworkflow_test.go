package aimdbos_test

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/uptrace/bun"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/aim"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/aimdbos"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/database"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/domain"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/pkg/orchestration"
)

// Package aimdbos_test's other files exercise DBOSEngine's mechanics against
// fakeWorkflow/fakePlannerWorkflow fixtures — deliberately, since that lets
// each test isolate one engine behaviour without needing real Postgres
// data. This file exists because that isolation is exactly what let a real
// bug through undetected: a fakeStep's default body ignores aim.StepInput
// entirely, so nothing here would have noticed internal/aimdbos passing
// the wrong instanceID to real domain/aim code that reads it from
// Postgres. That was found only by manually running a real cycle against
// real data through the web UI, where it surfaced as a confusing generic
// error ("No roadmap found for instance") on an instance that, in fact,
// had one.
//
// This test reproduces that exact incident directly: it runs
// aim.Service.AssembleAssessmentParams — the real function whose
// loadArtifactPayload call failed — through the real DBOSEngine, against a
// real (test) Postgres database seeded with a real roadmap_recipe
// artifact, and asserts it succeeds. Before the instanceID fix, this test
// would have failed with exactly the production symptom: "No roadmap
// found for instance", on an instance that has one.
func TestDBOSEngine_RealDomainStep_ReadsRealDataByTheCorrectInstanceID(t *testing.T) {
	db := database.TestDB(t)
	instanceID := seedRealInstance(t, db)
	seedRealRoadmap(t, db, instanceID)

	svc := aim.NewService(db)

	// A step built directly on the real, exported
	// aim.Service.AssembleAssessmentParams — not routed through
	// stepDraftAssessment/DraftAssessment, which require a configured
	// skill executor (itself needing a real or fake LLM) to get anywhere.
	// This isolates exactly the part of the real incident that was
	// actually broken: the instanceID a step body receives, and whether a
	// real domain method's DB read keyed by it succeeds.
	var stepErr error
	realStep := aim.Step{
		Name: "assemble_params",
		Run: func(ctx context.Context, in aim.StepInput) (aim.StepOutput, error) {
			_, err := svc.AssembleAssessmentParams(ctx, in.InstanceID)
			stepErr = err
			return aim.StepOutput{}, err
		},
	}

	wf := &fakeWorkflow{name: "real_domain_step_wf", steps: []aim.Step{realStep}}
	engine := newEngine(t, wf)

	run, err := engine.StartRun(t.Context(), "real_domain_step_wf", instanceID.String(), nil)
	if err != nil {
		t.Fatalf("start: %v", err)
	}

	final := awaitEngineTerminal(t, engine, run.ID)
	if final.Status != orchestration.StatusCompleted {
		t.Fatalf("run did not complete: status=%s error=%q (underlying: %v)", final.Status, final.Error, stepErr)
	}
}

// awaitEngineTerminal polls until run reaches completed or failed, for a
// test that needs to inspect which one happened (and report the real
// underlying error) rather than asserting a single expected status.
func awaitEngineTerminal(t *testing.T, engine *aimdbos.DBOSEngine, runID uuid.UUID) *orchestration.Run {
	t.Helper()
	deadline := time.Now().Add(10 * time.Second)
	var last *orchestration.Run
	for time.Now().Before(deadline) {
		run, err := engine.GetRun(context.Background(), runID)
		if err == nil {
			last = run
			if run.Status == orchestration.StatusCompleted || run.Status == orchestration.StatusFailed {
				return run
			}
		}
		time.Sleep(20 * time.Millisecond)
	}
	if last == nil {
		t.Fatalf("run %s never became queryable", runID)
	}
	t.Fatalf("run %s never reached a terminal status (last status %q)", runID, last.Status)
	return nil
}

// ---------------------------------------------------------------------------
// Test scaffolding — seeds the minimal FK chain a real aim.Service needs
// (orgs -> workspaces -> strategy_instances -> strategy_mutations ->
// strategy_artifacts). Deliberately not shared with
// domain/aim/planner_test.go's near-identical helpers: different package
// (aimdbos_test vs aim), and there is no exported testutil package these
// could both import from.
// ---------------------------------------------------------------------------

func seedRealTestOrg(t *testing.T, db *bun.DB) uuid.UUID {
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

func seedRealInstance(t *testing.T, db *bun.DB) uuid.UUID {
	t.Helper()
	ctx := context.Background()
	orgID := seedRealTestOrg(t, db)

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

// seedRealRoadmap commits a minimal but real roadmap_recipe artifact —
// domain.ArtifactTypeRoadmap's actual stored value, matching the real
// instance's data shape this test reproduces: extractOKRAssessments and
// friends (domain/aim/service.go) are already defensive about a roadmap
// with no tracks, so this does not need to be realistic beyond having the
// right top-level shape.
func seedRealRoadmap(t *testing.T, db *bun.DB, instanceID uuid.UUID) {
	t.Helper()
	ctx := context.Background()

	payload, err := json.Marshal(map[string]any{
		"roadmap": map[string]any{
			"cycle":  "Q1-2027",
			"tracks": map[string]any{},
		},
	})
	if err != nil {
		t.Fatalf("marshal roadmap payload: %v", err)
	}

	mutID := uuid.New()
	if _, err := db.NewInsert().Model(&domain.StrategyMutation{
		ID:           mutID,
		InstanceID:   instanceID,
		ArtifactType: domain.ArtifactTypeRoadmap,
		ArtifactKey:  domain.ArtifactTypeRoadmap,
		Action:       domain.MutationActionCreate,
		Payload:      payload,
		Status:       domain.MutationStatusCommitted,
		Source:       "system",
	}).Exec(ctx); err != nil {
		t.Fatalf("seed roadmap mutation: %v", err)
	}

	if _, err := db.NewInsert().Model(&domain.StrategyArtifact{
		ID:           uuid.New(),
		InstanceID:   instanceID,
		ArtifactKey:  domain.ArtifactTypeRoadmap,
		ArtifactType: domain.ArtifactTypeRoadmap,
		Status:       domain.ArtifactStatusActive,
		Payload:      payload,
		MutationID:   mutID,
	}).Exec(ctx); err != nil {
		t.Fatalf("seed roadmap artifact: %v", err)
	}
}
