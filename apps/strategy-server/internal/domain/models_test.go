package domain_test

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/uptrace/bun"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/database"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/domain"
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

func TestWorkspace_InsertAndSelect(t *testing.T) {
	db := database.TestDB(t)
	ctx := context.Background()

	orgID := seedTestOrg(t, db)
	name := "acme"
	ws := &domain.Workspace{
		ID:          uuid.New(),
		GithubOwner: "acme-corp",
		DisplayName: &name,
		OrgID:       orgID,
	}

	_, err := db.NewInsert().Model(ws).Exec(ctx)
	if err != nil {
		t.Fatalf("insert workspace: %v", err)
	}

	var got domain.Workspace
	err = db.NewSelect().Model(&got).Where("id = ?", ws.ID).Scan(ctx)
	if err != nil {
		t.Fatalf("select workspace: %v", err)
	}
	if got.GithubOwner != ws.GithubOwner {
		t.Errorf("expected owner %q, got %q", ws.GithubOwner, got.GithubOwner)
	}
}

func TestStrategyInstance_InsertAndSelect(t *testing.T) {
	db := database.TestDB(t)
	ctx := context.Background()

	ws := insertWorkspace(t, db, ctx, "test-org")

	repo := "test-org/strategy"
	inst := &domain.StrategyInstance{
		ID:          uuid.New(),
		WorkspaceID: ws.ID,
		Name:        "Test Strategy",
		GithubRepo:  &repo,
		Status:      domain.InstanceStatusDraft,
	}

	_, err := db.NewInsert().Model(inst).Exec(ctx)
	if err != nil {
		t.Fatalf("insert instance: %v", err)
	}

	var got domain.StrategyInstance
	err = db.NewSelect().Model(&got).Where("id = ?", inst.ID).Scan(ctx)
	if err != nil {
		t.Fatalf("select instance: %v", err)
	}
	if got.Status != domain.InstanceStatusDraft {
		t.Errorf("expected status %q, got %q", domain.InstanceStatusDraft, got.Status)
	}
}

func TestStrategyMutation_AppendOnly(t *testing.T) {
	db := database.TestDB(t)
	ctx := context.Background()

	ws := insertWorkspace(t, db, ctx, "mutation-org")
	inst := insertInstance(t, db, ctx, ws.ID, "Mutation Test")

	batchID := uuid.New()

	// Insert two mutations for the same artifact key
	for i, action := range []string{domain.MutationActionCreate, domain.MutationActionUpdate} {
		m := &domain.StrategyMutation{
			ID:           uuid.New(),
			InstanceID:   inst.ID,
			BatchID:      &batchID,
			ArtifactType: "north_star",
			ArtifactKey:  "north_star",
			Action:       action,
			Payload:      []byte(`{"version": ` + string(rune('1'+i)) + `}`),
			Status:       domain.MutationStatusCommitted,
			Source:       domain.MutationSourceSystem,
			CreatedAt:    time.Now().Add(time.Duration(i) * time.Second),
		}
		_, err := db.NewInsert().Model(m).Exec(ctx)
		if err != nil {
			t.Fatalf("insert mutation %d: %v", i, err)
		}
	}

	// Verify both rows exist (append-only)
	count, err := db.NewSelect().Model((*domain.StrategyMutation)(nil)).
		Where("instance_id = ? AND artifact_key = ?", inst.ID, "north_star").
		Count(ctx)
	if err != nil {
		t.Fatalf("count mutations: %v", err)
	}
	if count != 2 {
		t.Errorf("expected 2 mutations, got %d", count)
	}
}

func TestAuditLog_Insert(t *testing.T) {
	db := database.TestDB(t)
	ctx := context.Background()

	entry := &domain.AuditLog{
		ID:         uuid.New(),
		EntityType: "workspace",
		Action:     "create",
		Source:     "system",
	}

	_, err := db.NewInsert().Model(entry).Exec(ctx)
	if err != nil {
		t.Fatalf("insert audit log: %v", err)
	}
}

// helpers

func insertWorkspace(t *testing.T, db *bun.DB, ctx context.Context, owner string) *domain.Workspace {
	t.Helper()
	orgID := seedTestOrg(t, db)
	ws := &domain.Workspace{
		ID:          uuid.New(),
		GithubOwner: owner,
		OrgID:       orgID,
	}
	_, err := db.NewInsert().Model(ws).Exec(ctx)
	if err != nil {
		t.Fatalf("insertWorkspace: %v", err)
	}
	return ws
}

func insertInstance(t *testing.T, db *bun.DB, ctx context.Context, workspaceID uuid.UUID, name string) *domain.StrategyInstance {
	t.Helper()
	inst := &domain.StrategyInstance{
		ID:          uuid.New(),
		WorkspaceID: workspaceID,
		Name:        name,
		Status:      domain.InstanceStatusDraft,
	}
	_, err := db.NewInsert().Model(inst).Exec(ctx)
	if err != nil {
		t.Fatalf("insertInstance: %v", err)
	}
	return inst
}
