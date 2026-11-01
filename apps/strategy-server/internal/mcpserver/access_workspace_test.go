package mcpserver_test

import (
	"context"
	"testing"

	"github.com/google/uuid"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/domain"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/mcpserver"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/web"
)

type workspaceRow struct {
	Deleted bool      `bun:"deleted"`
	OrgID   uuid.UUID `bun:"org_id"`
}

func loadWorkspace(t *testing.T, svc mcpserver.Services, ws uuid.UUID) workspaceRow {
	t.Helper()
	var r workspaceRow
	if err := svc.Strategy.DB().NewRaw(
		"SELECT deleted_at IS NOT NULL AS deleted, org_id FROM workspaces WHERE id = ?", ws).
		Scan(context.Background(), &r); err != nil {
		t.Fatalf("load workspace: %v", err)
	}
	return r
}

func instanceDeleted(t *testing.T, svc mcpserver.Services, inst uuid.UUID) bool {
	t.Helper()
	var deleted bool
	if err := svc.Strategy.DB().NewRaw(
		"SELECT deleted_at IS NOT NULL FROM strategy_instances WHERE id = ?", inst).
		Scan(context.Background(), &deleted); err != nil {
		t.Fatalf("load instance: %v", err)
	}
	return deleted
}

// delete_workspace had no tenant check: any caller with write scope could delete
// another organisation's workspace, and its instances, by naming its id.
func TestDeleteWorkspace_IsRefusedForAWorkspaceOfAnotherTenant(t *testing.T) {
	svc := buildSvc(t)
	foreignWS, foreignInst := seedInstanceWithoutDevMembership(t, svc, "tenant-b-"+uuid.New().String()[:8])

	c := newMCPClient(t, svc) // DevUser, not a member of the foreign org
	c.call(1, "delete_workspace", map[string]any{"workspace_id": foreignWS.String()}).assertError()

	if loadWorkspace(t, svc, foreignWS).Deleted {
		t.Error("another tenant's workspace was deleted")
	}
	if instanceDeleted(t, svc, foreignInst) {
		t.Error("an instance of another tenant's workspace was deleted")
	}
}

func TestDeleteWorkspace_AMemberStillDeletesTheirOwn(t *testing.T) {
	svc := buildSvc(t)
	ws, inst := seedInstance(t, svc, "own-"+uuid.New().String()[:8], map[string]any{
		"north_star": map[string]any{"vision": "mine"},
	})

	c := newMCPClient(t, svc)
	c.call(1, "delete_workspace", map[string]any{"workspace_id": ws.String()}).assertOK()

	if !loadWorkspace(t, svc, ws).Deleted || !instanceDeleted(t, svc, inst) {
		t.Error("the member's own workspace and instance were not deleted")
	}
}

// A token is a narrowing of its owner's authority. Its owner is a member of the
// org, but a write grant on one instance is not authority over the workspace.
func TestDeleteWorkspace_IsRefusedForAScopedToken(t *testing.T) {
	svc := buildSvc(t)
	ws, inst := seedInstance(t, svc, "tok-"+uuid.New().String()[:8], map[string]any{
		"north_star": map[string]any{"vision": "mine"},
	})

	c := newMCPClientAs(t, svc, tokenPrincipal(inst, web.PermissionWrite))
	c.call(1, "delete_workspace", map[string]any{"workspace_id": ws.String()}).assertError()

	if loadWorkspace(t, svc, ws).Deleted || instanceDeleted(t, svc, inst) {
		t.Error("a token scoped to one instance deleted the whole workspace")
	}
}

// assign_workspace_to_org checked only that the caller administers the target
// org. Naming another tenant's workspace and one's own org moved it across.
func TestAssignWorkspaceToOrg_IsRefusedForAWorkspaceOfAnotherTenant(t *testing.T) {
	svc := buildSvc(t)
	foreignWS, _ := seedInstanceWithoutDevMembership(t, svc, "tenant-b-"+uuid.New().String()[:8])
	_, ownInst := seedInstance(t, svc, "own-"+uuid.New().String()[:8], map[string]any{
		"north_star": map[string]any{"vision": "mine"},
	})
	var ownOrg uuid.UUID
	if err := svc.Strategy.DB().NewRaw(
		`SELECT w.org_id FROM workspaces w JOIN strategy_instances i ON i.workspace_id = w.id WHERE i.id = ?`, ownInst).
		Scan(context.Background(), &ownOrg); err != nil {
		t.Fatal(err)
	}
	before := loadWorkspace(t, svc, foreignWS).OrgID

	c := newMCPClient(t, svc) // DevUser administers ownOrg
	c.call(1, "assign_workspace_to_org", map[string]any{
		"workspace_id": foreignWS.String(), "org_id": ownOrg.String(),
	}).assertError()

	if got := loadWorkspace(t, svc, foreignWS).OrgID; got != before {
		t.Errorf("another tenant's workspace moved from org %s to %s", before, got)
	}
}

func TestAssignWorkspaceToOrg_AnAdminStillMovesTheirOwnWorkspace(t *testing.T) {
	svc := buildSvc(t)
	ws, _ := seedInstance(t, svc, "mv-"+uuid.New().String()[:8], map[string]any{
		"north_star": map[string]any{"vision": "mine"},
	})
	_, otherInst := seedInstance(t, svc, "target-"+uuid.New().String()[:8], map[string]any{
		"north_star": map[string]any{"vision": "target"},
	})
	var target uuid.UUID
	if err := svc.Strategy.DB().NewRaw(
		`SELECT w.org_id FROM workspaces w JOIN strategy_instances i ON i.workspace_id = w.id WHERE i.id = ?`, otherInst).
		Scan(context.Background(), &target); err != nil {
		t.Fatal(err)
	}

	c := newMCPClient(t, svc) // administers both orgs
	c.call(1, "assign_workspace_to_org", map[string]any{
		"workspace_id": ws.String(), "org_id": target.String(),
	}).assertOK()

	if got := loadWorkspace(t, svc, ws).OrgID; got != target {
		t.Errorf("workspace org = %s, want %s", got, target)
	}
}

// Deleting a workspace removes every instance in it, so membership of the org is
// not enough: a viewer may read the workspace but not delete or move it.
func TestWorkspaceWideTools_AreRefusedForAViewerOfTheOwningOrg(t *testing.T) {
	svc := buildSvc(t)
	ws, inst := seedInstanceWithoutDevMembership(t, svc, "viewer-"+uuid.New().String()[:8])
	ctx := context.Background()
	orgID := loadWorkspace(t, svc, ws).OrgID
	if _, err := svc.Strategy.DB().NewInsert().Model(&domain.User{
		ID: web.DevUser.ID, Sub: web.DevUser.Sub, Email: web.DevUser.Email,
	}).On("CONFLICT (id) DO NOTHING").Exec(ctx); err != nil {
		t.Fatal(err)
	}
	if _, err := svc.Strategy.DB().NewInsert().Model(&domain.OrgMembership{
		ID: uuid.New(), OrgID: orgID, UserID: web.DevUser.ID, Role: domain.OrgRoleViewer,
	}).Exec(ctx); err != nil {
		t.Fatal(err)
	}

	c := newMCPClient(t, svc)
	c.call(1, "get_workspace", map[string]any{"workspace_id": ws.String()}).assertOK() // a viewer reads
	c.call(2, "delete_workspace", map[string]any{"workspace_id": ws.String()}).assertError()
	c.call(3, "assign_workspace_to_org", map[string]any{
		"workspace_id": ws.String(), "org_id": orgID.String(),
	}).assertError()

	if loadWorkspace(t, svc, ws).Deleted || instanceDeleted(t, svc, inst) {
		t.Error("a viewer deleted the workspace")
	}
}
