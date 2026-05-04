package instance_test

import (
	"context"
	"testing"

	"github.com/google/uuid"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/instance"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/workspace"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/audit"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/database"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/pkg/apperror"
)

func newCtx() context.Context {
	ctx := context.Background()
	return audit.ContextWithSource(ctx, audit.SourceSystem)
}

// createWorkspace is a test helper that creates a workspace and returns its ID.
func createWorkspace(t *testing.T, svc *workspace.Service, ctx context.Context, owner string) uuid.UUID {
	t.Helper()
	ws, err := svc.CreateWorkspace(ctx, owner, nil)
	if err != nil {
		t.Fatalf("create workspace %q: %v", owner, err)
	}
	return ws.ID
}

func TestImportInstance(t *testing.T) {
	db := database.TestDB(t)
	wsSvc := workspace.NewService(db)
	svc := instance.NewService(db)
	ctx := newCtx()

	wsID := createWorkspace(t, wsSvc, ctx, "import-org")

	repo := "import-org/my-product"
	inst, err := svc.ImportInstance(ctx, instance.ImportParams{
		WorkspaceID: wsID,
		Name:        "My Product",
		GithubRepo:  &repo,
		InitialPayloads: map[string]any{
			"north_star": map[string]string{"vision": "be the best"},
		},
	})
	if err != nil {
		t.Fatalf("ImportInstance: %v", err)
	}
	if inst.ID == uuid.Nil {
		t.Error("expected non-nil instance ID")
	}
	if inst.WorkspaceID != wsID {
		t.Errorf("expected workspace_id %s, got %s", wsID, inst.WorkspaceID)
	}
	if inst.Name != "My Product" {
		t.Errorf("expected name %q, got %q", "My Product", inst.Name)
	}
}

func TestGetInstance_NotFound(t *testing.T) {
	db := database.TestDB(t)
	svc := instance.NewService(db)
	ctx := newCtx()

	_, err := svc.GetInstance(ctx, uuid.New())
	ae := apperror.AsAppError(err)
	if ae == nil {
		t.Fatalf("expected AppError, got %v", err)
	}
	if ae.Code != 111001 {
		t.Errorf("expected instance not-found code 111001, got %d", ae.Code)
	}
}

func TestActivateInstance(t *testing.T) {
	db := database.TestDB(t)
	wsSvc := workspace.NewService(db)
	svc := instance.NewService(db)
	ctx := newCtx()

	wsID := createWorkspace(t, wsSvc, ctx, "activate-org")

	inst1, err := svc.ImportInstance(ctx, instance.ImportParams{
		WorkspaceID: wsID,
		Name:        "Instance A",
	})
	if err != nil {
		t.Fatalf("import instance A: %v", err)
	}
	inst2, err := svc.ImportInstance(ctx, instance.ImportParams{
		WorkspaceID: wsID,
		Name:        "Instance B",
	})
	if err != nil {
		t.Fatalf("import instance B: %v", err)
	}

	// Activate first instance.
	if err := svc.ActivateInstance(ctx, inst1.ID); err != nil {
		t.Fatalf("ActivateInstance A: %v", err)
	}

	// Activate second instance — should demote first.
	if err := svc.ActivateInstance(ctx, inst2.ID); err != nil {
		t.Fatalf("ActivateInstance B: %v", err)
	}

	// inst1 should be demoted back to draft.
	a, err := svc.GetInstance(ctx, inst1.ID)
	if err != nil {
		t.Fatalf("GetInstance A: %v", err)
	}
	if a.Status != "draft" {
		t.Errorf("expected instance A status 'draft' after demotion, got %q", a.Status)
	}

	// inst2 should be active.
	b, err := svc.GetInstance(ctx, inst2.ID)
	if err != nil {
		t.Fatalf("GetInstance B: %v", err)
	}
	if b.Status != "active" {
		t.Errorf("expected instance B status 'active', got %q", b.Status)
	}
}

func TestActivateInstance_NotFound(t *testing.T) {
	db := database.TestDB(t)
	svc := instance.NewService(db)
	ctx := newCtx()

	err := svc.ActivateInstance(ctx, uuid.New())
	ae := apperror.AsAppError(err)
	if ae == nil {
		t.Fatalf("expected AppError, got %v", err)
	}
	if ae.Code != 111001 {
		t.Errorf("expected instance not-found code 111001, got %d", ae.Code)
	}
}

func TestArchiveInstance_DiscardsStaged(t *testing.T) {
	db := database.TestDB(t)
	wsSvc := workspace.NewService(db)
	svc := instance.NewService(db)
	ctx := newCtx()

	wsID := createWorkspace(t, wsSvc, ctx, "archive-org")

	inst, err := svc.ImportInstance(ctx, instance.ImportParams{
		WorkspaceID: wsID,
		Name:        "To Archive",
	})
	if err != nil {
		t.Fatalf("ImportInstance: %v", err)
	}

	if err := svc.ArchiveInstance(ctx, inst.ID); err != nil {
		t.Fatalf("ArchiveInstance: %v", err)
	}

	// Instance should no longer appear in active list.
	result, err := svc.ListInstances(ctx, instance.ListParams{
		WorkspaceID:     wsID,
		IncludeArchived: false,
	})
	if err != nil {
		t.Fatalf("ListInstances: %v", err)
	}
	for _, i := range result.Instances {
		if i.ID == inst.ID {
			t.Error("archived instance should not appear in non-archived list")
		}
	}

	// But it should appear when IncludeArchived = true.
	result2, err := svc.ListInstances(ctx, instance.ListParams{
		WorkspaceID:     wsID,
		IncludeArchived: true,
	})
	if err != nil {
		t.Fatalf("ListInstances with archived: %v", err)
	}
	found := false
	for _, i := range result2.Instances {
		if i.ID == inst.ID {
			found = true
			if i.Status != "archived" {
				t.Errorf("expected status 'archived', got %q", i.Status)
			}
		}
	}
	if !found {
		t.Error("archived instance should appear when IncludeArchived = true")
	}
}

func TestArchiveInstance_NotFound(t *testing.T) {
	db := database.TestDB(t)
	svc := instance.NewService(db)
	ctx := newCtx()

	err := svc.ArchiveInstance(ctx, uuid.New())
	ae := apperror.AsAppError(err)
	if ae == nil {
		t.Fatalf("expected AppError, got %v", err)
	}
	if ae.Code != 111001 {
		t.Errorf("expected instance not-found code 111001, got %d", ae.Code)
	}
}
