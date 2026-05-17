package strategy_test

import (
	"context"
	"testing"

	"github.com/google/uuid"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/strategy"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/database"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/domain"
)

func TestCommitAuto_CreatesMutation(t *testing.T) {
	db := database.TestDB(t)
	svc := strategy.NewService(db)
	ctx := context.Background()

	// Seed a workspace and instance.
	orgID := seedTestOrg(t, db)
	wsID := uuid.New()
	_, err := db.NewInsert().Model(&domain.Workspace{
		ID:          wsID,
		GithubOwner: "test-" + wsID.String()[:8],
		OrgID:       orgID,
	}).Exec(ctx)
	if err != nil {
		t.Fatalf("seed workspace: %v", err)
	}
	instID := uuid.New()
	_, err = db.NewInsert().Model(&domain.StrategyInstance{
		ID:          instID,
		WorkspaceID: wsID,
		Name:        "test-instance",
		Status:      domain.InstanceStatusActive,
	}).Exec(ctx)
	if err != nil {
		t.Fatalf("seed instance: %v", err)
	}

	signalID := uuid.New()
	payload := map[string]string{
		"name":        "Updated Feature",
		"description": "Auto-resolved alignment fix",
	}

	m, err := svc.CommitAuto(ctx, strategy.CommitAutoParams{
		InstanceID:   instID,
		ArtifactType: "feature",
		ArtifactKey:  "fd-001",
		Action:       domain.MutationActionCreate,
		Payload:      payload,
		SignalID:     &signalID,
	})
	if err != nil {
		t.Fatalf("commit auto: %v", err)
	}

	// Verify mutation was created with correct fields.
	if m.Status != domain.MutationStatusCommitted {
		t.Errorf("status=%s, want committed", m.Status)
	}
	if m.Source != "ripple_auto" {
		t.Errorf("source=%s, want ripple_auto", m.Source)
	}
	if m.ArtifactKey != "fd-001" {
		t.Errorf("artifact_key=%s, want fd-001", m.ArtifactKey)
	}

	// Verify mutation is visible in list.
	mutations, _, err := svc.ListMutations(ctx, instID, "", false, 100, "", "")
	if err != nil {
		t.Fatalf("list mutations: %v", err)
	}
	found := false
	for _, mut := range mutations {
		if mut.ID == m.ID {
			found = true
			if mut.Source != "ripple_auto" {
				t.Errorf("listed mutation source=%s, want ripple_auto", mut.Source)
			}
			break
		}
	}
	if !found {
		t.Error("auto-committed mutation not found in list_mutations")
	}

	// Verify the strategic index was derived (artifact should exist).
	art, err := svc.GetCurrentArtifactFull(ctx, instID, "fd-001")
	if err != nil {
		t.Fatalf("get artifact: %v", err)
	}
	if art.ArtifactType != "feature" {
		t.Errorf("artifact type=%s, want feature", art.ArtifactType)
	}
}

func TestCommitAuto_WithoutSignalID(t *testing.T) {
	db := database.TestDB(t)
	svc := strategy.NewService(db)
	ctx := context.Background()

	// Seed workspace + instance.
	orgID := seedTestOrg(t, db)
	wsID := uuid.New()
	_, _ = db.NewInsert().Model(&domain.Workspace{
		ID:          wsID,
		GithubOwner: "test-nosig-" + wsID.String()[:8],
		OrgID:       orgID,
	}).Exec(ctx)
	instID := uuid.New()
	_, _ = db.NewInsert().Model(&domain.StrategyInstance{
		ID:          instID,
		WorkspaceID: wsID,
		Name:        "test",
		Status:      domain.InstanceStatusActive,
	}).Exec(ctx)

	// CommitAuto without signal ID should still work.
	m, err := svc.CommitAuto(ctx, strategy.CommitAutoParams{
		InstanceID:   instID,
		ArtifactType: "north_star",
		ArtifactKey:  "north_star",
		Action:       domain.MutationActionCreate,
		Payload:      map[string]string{"vision": "test vision"},
	})
	if err != nil {
		t.Fatalf("commit auto without signal: %v", err)
	}
	if m.Source != "ripple_auto" {
		t.Errorf("source=%s, want ripple_auto", m.Source)
	}
}
