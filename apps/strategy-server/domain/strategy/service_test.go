package strategy_test

import (
	"context"
	"encoding/json"
	"testing"

	"github.com/google/uuid"
	"github.com/uptrace/bun"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/instance"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/strategy"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/workspace"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/audit"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/database"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/pkg/apperror"
)

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

func newCtx() context.Context {
	ctx := context.Background()
	return audit.ContextWithSource(ctx, audit.SourceSystem)
}

func TestStageAndCommitBatch(t *testing.T) {
	db := database.TestDB(t)
	wsSvc := workspace.NewService(db)
	instSvc := instance.NewService(db)
	svc := strategy.NewService(db)
	ctx := newCtx()

	orgID := seedTestOrg(t, db)
	ws, err := wsSvc.CreateWorkspace(ctx, "strategy-org-1", nil, orgID)
	if err != nil {
		t.Fatalf("CreateWorkspace: %v", err)
	}
	inst, err := instSvc.ImportInstance(ctx, instance.ImportParams{
		WorkspaceID: ws.ID,
		Name:        "Test Product",
	})
	if err != nil {
		t.Fatalf("ImportInstance: %v", err)
	}

	payload := map[string]string{"vision": "disrupt the market"}
	batchID, err := svc.Stage(ctx, strategy.StageParams{
		InstanceID:   inst.ID,
		ArtifactType: "north_star",
		ArtifactKey:  "north_star",
		Action:       "create",
		Payload:      payload,
	})
	if err != nil {
		t.Fatalf("Stage: %v", err)
	}
	if batchID == uuid.Nil {
		t.Error("expected non-nil batch ID")
	}

	// Staged mutation should NOT appear in committed reads.
	_, err = svc.GetCurrentArtifact(ctx, inst.ID, "north_star")
	if apperror.AsAppError(err) == nil {
		t.Error("expected not-found before commit, but got no error")
	}

	// Commit the batch.
	n, err := svc.CommitBatch(ctx, batchID)
	if err != nil {
		t.Fatalf("CommitBatch: %v", err)
	}
	if n != 1 {
		t.Errorf("expected 1 committed mutation, got %d", n)
	}

	// Now the committed artifact should be readable.
	raw, err := svc.GetCurrentArtifact(ctx, inst.ID, "north_star")
	if err != nil {
		t.Fatalf("GetCurrentArtifact after commit: %v", err)
	}
	var got map[string]string
	if err := json.Unmarshal(raw, &got); err != nil {
		t.Fatalf("unmarshal artifact: %v", err)
	}
	if got["vision"] != "disrupt the market" {
		t.Errorf("expected vision %q, got %q", "disrupt the market", got["vision"])
	}
}

func TestStageAndDiscardBatch(t *testing.T) {
	db := database.TestDB(t)
	wsSvc := workspace.NewService(db)
	instSvc := instance.NewService(db)
	svc := strategy.NewService(db)
	ctx := newCtx()

	orgID := seedTestOrg(t, db)
	ws, err := wsSvc.CreateWorkspace(ctx, "strategy-org-2", nil, orgID)
	if err != nil {
		t.Fatalf("CreateWorkspace: %v", err)
	}
	inst, err := instSvc.ImportInstance(ctx, instance.ImportParams{
		WorkspaceID: ws.ID,
		Name:        "Discard Test",
	})
	if err != nil {
		t.Fatalf("ImportInstance: %v", err)
	}

	batchID, err := svc.Stage(ctx, strategy.StageParams{
		InstanceID:   inst.ID,
		ArtifactType: "north_star",
		ArtifactKey:  "north_star",
		Action:       "create",
		Payload:      map[string]string{"vision": "will be discarded"},
	})
	if err != nil {
		t.Fatalf("Stage: %v", err)
	}

	n, err := svc.DiscardBatch(ctx, batchID)
	if err != nil {
		t.Fatalf("DiscardBatch: %v", err)
	}
	if n != 1 {
		t.Errorf("expected 1 discarded mutation, got %d", n)
	}

	// Artifact should still not be readable after discard.
	_, err = svc.GetCurrentArtifact(ctx, inst.ID, "north_star")
	if apperror.AsAppError(err) == nil {
		t.Error("expected not-found after discard")
	}
}

func TestCommitBatch_NotFound(t *testing.T) {
	db := database.TestDB(t)
	svc := strategy.NewService(db)
	ctx := newCtx()

	_, err := svc.CommitBatch(ctx, uuid.New())
	ae := apperror.AsAppError(err)
	if ae == nil {
		t.Fatalf("expected AppError, got %v", err)
	}
	if ae.Code != 112002 {
		t.Errorf("expected batch not-found code 112002, got %d", ae.Code)
	}
}

func TestDiscardBatch_NotFound(t *testing.T) {
	db := database.TestDB(t)
	svc := strategy.NewService(db)
	ctx := newCtx()

	_, err := svc.DiscardBatch(ctx, uuid.New())
	ae := apperror.AsAppError(err)
	if ae == nil {
		t.Fatalf("expected AppError, got %v", err)
	}
	if ae.Code != 112002 {
		t.Errorf("expected batch not-found code 112002, got %d", ae.Code)
	}
}

func TestListCurrentArtifacts(t *testing.T) {
	db := database.TestDB(t)
	wsSvc := workspace.NewService(db)
	instSvc := instance.NewService(db)
	svc := strategy.NewService(db)
	ctx := newCtx()

	orgID := seedTestOrg(t, db)
	ws, err := wsSvc.CreateWorkspace(ctx, "strategy-org-3", nil, orgID)
	if err != nil {
		t.Fatalf("CreateWorkspace: %v", err)
	}
	inst, err := instSvc.ImportInstance(ctx, instance.ImportParams{
		WorkspaceID: ws.ID,
		Name:        "List Test",
	})
	if err != nil {
		t.Fatalf("ImportInstance: %v", err)
	}

	// Stage + commit two different artifacts in one batch.
	batchID, err := svc.Stage(ctx, strategy.StageParams{
		InstanceID:   inst.ID,
		ArtifactType: "north_star",
		ArtifactKey:  "north_star",
		Action:       "create",
		Payload:      map[string]string{"vision": "v1"},
	})
	if err != nil {
		t.Fatalf("Stage north_star: %v", err)
	}

	_, err = svc.Stage(ctx, strategy.StageParams{
		InstanceID:   inst.ID,
		ArtifactType: "feature",
		ArtifactKey:  "fd-001",
		Action:       "create",
		Payload:      map[string]string{"title": "Feature 1"},
		BatchID:      &batchID,
	})
	if err != nil {
		t.Fatalf("Stage fd-001: %v", err)
	}

	if _, err := svc.CommitBatch(ctx, batchID); err != nil {
		t.Fatalf("CommitBatch: %v", err)
	}

	// List all artifacts — expect 2.
	all, err := svc.ListCurrentArtifacts(ctx, inst.ID, "")
	if err != nil {
		t.Fatalf("ListCurrentArtifacts: %v", err)
	}
	if len(all) != 2 {
		t.Errorf("expected 2 artifacts, got %d", len(all))
	}

	// Filter by type — expect 1 feature.
	features, err := svc.ListCurrentArtifacts(ctx, inst.ID, "feature")
	if err != nil {
		t.Fatalf("ListCurrentArtifacts (feature): %v", err)
	}
	if len(features) != 1 {
		t.Errorf("expected 1 feature, got %d", len(features))
	}
}

func TestStageBatchID_Grouping(t *testing.T) {
	db := database.TestDB(t)
	wsSvc := workspace.NewService(db)
	instSvc := instance.NewService(db)
	svc := strategy.NewService(db)
	ctx := newCtx()

	orgID := seedTestOrg(t, db)
	ws, err := wsSvc.CreateWorkspace(ctx, "strategy-org-4", nil, orgID)
	if err != nil {
		t.Fatalf("CreateWorkspace: %v", err)
	}
	inst, err := instSvc.ImportInstance(ctx, instance.ImportParams{
		WorkspaceID: ws.ID,
		Name:        "BatchID Grouping",
	})
	if err != nil {
		t.Fatalf("ImportInstance: %v", err)
	}

	// First stage — creates a new batch.
	batchID, err := svc.Stage(ctx, strategy.StageParams{
		InstanceID:   inst.ID,
		ArtifactType: "north_star",
		ArtifactKey:  "north_star",
		Action:       "create",
		Payload:      "payload-a",
	})
	if err != nil {
		t.Fatalf("Stage 1: %v", err)
	}

	// Second stage — joins existing batch.
	batchID2, err := svc.Stage(ctx, strategy.StageParams{
		InstanceID:   inst.ID,
		ArtifactType: "north_star",
		ArtifactKey:  "north_star",
		Action:       "update",
		Payload:      "payload-b",
		BatchID:      &batchID,
	})
	if err != nil {
		t.Fatalf("Stage 2: %v", err)
	}

	if batchID != batchID2 {
		t.Errorf("expected same batch ID %s, got %s", batchID, batchID2)
	}

	// Committing the batch commits both mutations.
	n, err := svc.CommitBatch(ctx, batchID)
	if err != nil {
		t.Fatalf("CommitBatch: %v", err)
	}
	if n != 2 {
		t.Errorf("expected 2 committed mutations, got %d", n)
	}
}
