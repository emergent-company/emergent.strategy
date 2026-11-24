package handler

import (
	"net/http"
	"testing"

	workspacedom "github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/workspace"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/domain"
)

// Moving an instance goes only to a workspace of an organisation the caller
// administers, from an organisation they administer.
func TestMoveTargetIsAWorkspaceTheCallerAdministers(t *testing.T) {
	tn := newTenancy(t)

	got, err := tn.s.resolveMoveTarget(asUser(tn.alice), tn.instA.ID, moveRequest{WorkspaceID: tn.wsA2.ID.String()})
	if err != nil || got != tn.wsA2.ID {
		t.Fatalf("a move between two workspaces of A: %v %v, want wsA2", got, err)
	}
	if _, err := tn.s.resolveMoveTarget(asUser(tn.alice), tn.instA.ID, moveRequest{WorkspaceID: tn.wsB.ID.String()}); status(t, err) != http.StatusNotFound {
		t.Error("a move into a workspace of another organisation must answer 404")
	}
	// The source must be the caller's too, whatever the target.
	if _, err := tn.s.resolveMoveTarget(asUser(tn.alice), tn.instB.ID, moveRequest{WorkspaceID: tn.wsA.ID.String()}); status(t, err) != http.StatusNotFound {
		t.Error("moving an instance of another organisation into one's own must answer 404")
	}
	if _, err := tn.s.resolveMoveTarget(asUser(tn.vic), tn.instA.ID, moveRequest{WorkspaceID: tn.wsA2.ID.String()}); status(t, err) != http.StatusForbidden {
		t.Error("a viewer moving an instance must answer 403")
	}
	if _, err := tn.s.resolveMoveTarget(asUser(tn.alice), tn.instA.ID, moveRequest{WorkspaceID: "nope"}); status(t, err) != http.StatusBadRequest {
		t.Error("a malformed workspace id must answer 400")
	}
}

// The takeover again, through move: naming an existing organisation as the new
// workspace used to return it and add the caller to it.
func TestMoveNeverJoinsAnExistingOrganisation(t *testing.T) {
	tn := newTenancy(t)
	before := tn.orgCount(t)
	for _, name := range []string{"Org B", "org b", " ORG B "} {
		_, err := tn.s.resolveMoveTarget(asUser(tn.alice), tn.instA.ID, moveRequest{WorkspaceID: "__new__", NewName: name})
		if got := status(t, err); got != http.StatusConflict {
			t.Errorf("name %q answered %d, want 409", name, got)
		}
	}
	if tn.isMember(t, tn.orgB, tn.alice) {
		t.Fatal("the caller joined an organisation they only named")
	}
	if tn.orgCount(t) != before {
		t.Error("a refused move created an organisation")
	}
}

func TestMoveCreatesANewOrganisationForTheCaller(t *testing.T) {
	tn := newTenancy(t)
	id, err := tn.s.resolveMoveTarget(asUser(tn.alice), tn.instA.ID, moveRequest{WorkspaceID: "__new__", NewName: "Alice Studio"})
	if err != nil {
		t.Fatalf("a new name: %v", err)
	}
	org, err := tn.orgSvc.GetByName(importCtx(), "Alice Studio")
	if err != nil {
		t.Fatal(err)
	}
	ok, role, _ := tn.orgSvc.IsMember(importCtx(), org.ID, tn.alice.ID)
	if !ok || role != domain.OrgRoleAdmin {
		t.Errorf("the caller is member=%v role=%q of the new organisation, want org_admin", ok, role)
	}
	ws, err := workspacedom.NewService(tn.db).GetWorkspaceByOwner(importCtx(), "Alice Studio")
	if err != nil || ws.ID != id || ws.OrgID != org.ID {
		t.Errorf("workspace %v/%v is not the new organisation's", ws, err)
	}
}

func TestMoveRequiresAName(t *testing.T) {
	tn := newTenancy(t)
	if _, err := tn.s.resolveMoveTarget(asUser(tn.alice), tn.instA.ID, moveRequest{WorkspaceID: "__new__", NewName: "  "}); status(t, err) != http.StatusBadRequest {
		t.Error("a new workspace with no name must answer 400")
	}
}
