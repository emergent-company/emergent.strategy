package workspace_test

import (
	"context"
	"testing"

	"github.com/google/uuid"
	"github.com/uptrace/bun"

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

func TestCreateWorkspace(t *testing.T) {
	db := database.TestDB(t)
	svc := workspace.NewService(db)
	ctx := newCtx()

	orgID := seedTestOrg(t, db)
	name := "Acme Corp"
	ws, err := svc.CreateWorkspace(ctx, "acme-corp", &name, orgID)
	if err != nil {
		t.Fatalf("CreateWorkspace: %v", err)
	}
	if ws.GithubOwner != "acme-corp" {
		t.Errorf("expected owner %q, got %q", "acme-corp", ws.GithubOwner)
	}
	if ws.ID == uuid.Nil {
		t.Error("expected non-nil UUID")
	}
}

func TestCreateWorkspace_Duplicate(t *testing.T) {
	db := database.TestDB(t)
	svc := workspace.NewService(db)
	ctx := newCtx()

	orgID := seedTestOrg(t, db)
	if _, err := svc.CreateWorkspace(ctx, "dup-org", nil, orgID); err != nil {
		t.Fatalf("first create: %v", err)
	}

	_, err := svc.CreateWorkspace(ctx, "dup-org", nil, orgID)
	ae := apperror.AsAppError(err)
	if ae == nil {
		t.Fatalf("expected AppError on duplicate, got %v", err)
	}
	if ae.Code != 110002 {
		t.Errorf("expected conflict code 110002, got %d", ae.Code)
	}
}

func TestGetWorkspace_NotFound(t *testing.T) {
	db := database.TestDB(t)
	svc := workspace.NewService(db)
	ctx := newCtx()

	_, err := svc.GetWorkspace(ctx, uuid.MustParse("00000000-0000-0000-0000-000000000099"))
	ae := apperror.AsAppError(err)
	if ae == nil {
		t.Fatalf("expected AppError, got %v", err)
	}
	if ae.Code != 110001 {
		t.Errorf("expected not-found code 110001, got %d", ae.Code)
	}
}

func TestListWorkspaces_Pagination(t *testing.T) {
	db := database.TestDB(t)
	svc := workspace.NewService(db)
	ctx := newCtx()

	for _, owner := range []string{"org-a", "org-b", "org-c"} {
		orgID := seedTestOrg(t, db)
		if _, err := svc.CreateWorkspace(ctx, owner, nil, orgID); err != nil {
			t.Fatalf("create %q: %v", owner, err)
		}
	}

	result, err := svc.ListWorkspaces(ctx, workspace.ListParams{Limit: 2})
	if err != nil {
		t.Fatalf("ListWorkspaces: %v", err)
	}
	if len(result.Workspaces) != 2 {
		t.Errorf("expected 2 (limited), got %d", len(result.Workspaces))
	}
	if result.NextCursor == "" {
		t.Error("expected a next cursor for page 2")
	}

	page2, err := svc.ListWorkspaces(ctx, workspace.ListParams{Limit: 10, Cursor: result.NextCursor})
	if err != nil {
		t.Fatalf("ListWorkspaces page2: %v", err)
	}
	if len(page2.Workspaces) < 1 {
		t.Error("expected at least one workspace on page 2")
	}
}

func TestDeleteWorkspace_SoftDelete(t *testing.T) {
	db := database.TestDB(t)
	svc := workspace.NewService(db)
	ctx := newCtx()

	orgID := seedTestOrg(t, db)
	ws, err := svc.CreateWorkspace(ctx, "delete-me", nil, orgID)
	if err != nil {
		t.Fatalf("create: %v", err)
	}

	if err := svc.DeleteWorkspace(ctx, ws.ID); err != nil {
		t.Fatalf("delete: %v", err)
	}

	_, err = svc.GetWorkspace(ctx, ws.ID)
	if apperror.AsAppError(err) == nil {
		t.Fatal("expected not-found error after soft delete")
	}
}
