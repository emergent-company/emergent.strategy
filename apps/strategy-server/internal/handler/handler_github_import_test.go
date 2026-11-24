package handler

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"testing"

	"github.com/google/uuid"
	"github.com/uptrace/bun"

	instancedom "github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/instance"
	orgdom "github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/org"
	userdom "github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/user"
	workspacedom "github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/workspace"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/audit"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/authz"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/database"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/domain"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/web"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/pkg/apperror"
)

// tenancy is two organisations, each with a workspace and an instance linked to
// a repository, and the people around them:
//
//	A: alice (admin), vic (viewer)   workspace wsA (owner "owner-a")   instance instA ("owner-a/repo-a")
//	B: bob (admin)                   workspace wsB (owner "owner-b")   instance instB ("owner-b/repo-b")
//
// A second workspace wsA2 (owner "owner-a2") belongs to A as well.
type tenancy struct {
	s               *Server
	db              *bun.DB
	orgA, orgB      *domain.Org
	wsA, wsA2, wsB  *domain.Workspace
	instA, instB    *domain.StrategyInstance
	alice, vic, bob *domain.User
	eve             *domain.User // belongs to no organisation
	orgSvc          *orgdom.Service
	instSvc         *instancedom.Service
}

func importCtx() context.Context {
	ctx := audit.ContextWithSource(context.Background(), audit.SourceSystem)
	return audit.ContextWithAudit(ctx, audit.NewSlogWriter())
}

func asUser(u *domain.User) context.Context {
	return web.ContextWithUser(importCtx(), &web.User{ID: u.ID, Sub: u.Sub, Email: u.Email})
}

func newTenancy(t *testing.T) *tenancy {
	t.Helper()
	db := database.TestDB(t)
	ctx := importCtx()
	users := userdom.NewService(db)
	mk := func(name string) *domain.User {
		u, err := users.EnsureUser(ctx, name+"-sub", name+"@example.com", name)
		if err != nil {
			t.Fatalf("seed user %s: %v", name, err)
		}
		return u
	}
	tn := &tenancy{db: db, alice: mk("alice"), vic: mk("vic"), bob: mk("bob"), eve: mk("eve")}
	tn.orgSvc = orgdom.NewService(db)
	wsSvc := workspacedom.NewService(db)
	tn.instSvc = instancedom.NewService(db)

	var err error
	if tn.orgA, err = tn.orgSvc.Create(ctx, orgdom.CreateParams{Name: "Org A"}, tn.alice.ID); err != nil {
		t.Fatal(err)
	}
	if _, err = tn.orgSvc.AddMember(ctx, tn.orgA.ID, tn.vic.ID, domain.OrgRoleViewer); err != nil {
		t.Fatal(err)
	}
	if tn.orgB, err = tn.orgSvc.Create(ctx, orgdom.CreateParams{Name: "Org B"}, tn.bob.ID); err != nil {
		t.Fatal(err)
	}
	ws := func(owner string, org *domain.Org) *domain.Workspace {
		name := owner
		w, err := wsSvc.CreateWorkspace(ctx, owner, &name, org.ID)
		if err != nil {
			t.Fatalf("seed workspace %s: %v", owner, err)
		}
		return w
	}
	tn.wsA, tn.wsA2, tn.wsB = ws("owner-a", tn.orgA), ws("owner-a2", tn.orgA), ws("owner-b", tn.orgB)
	inst := func(w *domain.Workspace, repo, name string) *domain.StrategyInstance {
		r := repo
		i, err := tn.instSvc.ImportInstance(ctx, instancedom.ImportParams{WorkspaceID: w.ID, Name: name, GithubRepo: &r})
		if err != nil {
			t.Fatalf("seed instance %s: %v", repo, err)
		}
		return i
	}
	tn.instA, tn.instB = inst(tn.wsA, "owner-a/repo-a", "Instance Of Org A"), inst(tn.wsB, "owner-b/repo-b", "Instance Of Org B")
	tn.s = &Server{db: db, log: slog.New(slog.NewTextHandler(io.Discard, nil))}
	return tn
}

func (tn *tenancy) workspaceOf(t *testing.T, instanceID uuid.UUID) uuid.UUID {
	t.Helper()
	inst, err := tn.instSvc.GetInstance(importCtx(), instanceID)
	if err != nil {
		t.Fatal(err)
	}
	return inst.WorkspaceID
}

func status(t *testing.T, err error) int {
	t.Helper()
	if err == nil {
		t.Fatal("expected a refusal, got none")
	}
	ae := apperror.AsAppError(err)
	if ae == nil {
		t.Fatalf("not an app error: %v", err)
	}
	return ae.HTTPStatus
}

func (tn *tenancy) isMember(t *testing.T, org *domain.Org, u *domain.User) bool {
	t.Helper()
	ok, _, err := tn.orgSvc.IsMember(importCtx(), org.ID, u.ID)
	if err != nil {
		t.Fatal(err)
	}
	return ok
}

func (tn *tenancy) orgCount(t *testing.T) int {
	t.Helper()
	n, err := tn.db.NewSelect().Model((*domain.Org)(nil)).Count(importCtx())
	if err != nil {
		t.Fatal(err)
	}
	return n
}

// --- an existing workspace picked from the list ------------------------------

func TestImportRefusesAWorkspaceOfAnotherOrganisation(t *testing.T) {
	tn := newTenancy(t)
	_, err := tn.s.resolveImportTarget(asUser(tn.alice), importTargetRequest{
		WorkspaceID: tn.wsB.ID.String(), GithubRepo: "owner-x/repo-x", RepoOwner: "owner-x", InstanceName: "X"})
	if got := status(t, err); got != http.StatusNotFound {
		t.Errorf("foreign workspace answered %d, want 404 (as for a workspace that does not exist)", got)
	}
}

func TestImportRefusesAViewer(t *testing.T) {
	tn := newTenancy(t)
	_, err := tn.s.resolveImportTarget(asUser(tn.vic), importTargetRequest{
		WorkspaceID: tn.wsA.ID.String(), GithubRepo: "owner-x/repo-x", RepoOwner: "owner-x", InstanceName: "X"})
	if got := status(t, err); got != http.StatusForbidden {
		t.Errorf("viewer answered %d, want 403", got)
	}
}

func TestImportIntoOwnWorkspaceAsAdmin(t *testing.T) {
	tn := newTenancy(t)
	got, err := tn.s.resolveImportTarget(asUser(tn.alice), importTargetRequest{
		WorkspaceID: tn.wsA.ID.String(), GithubRepo: "owner-x/repo-x", RepoOwner: "owner-x", InstanceName: "X"})
	if err != nil {
		t.Fatalf("admin of A into a workspace of A: %v", err)
	}
	if got.WorkspaceID != tn.wsA.ID || got.Existing != nil || got.NeedsMove {
		t.Errorf("target = %+v, want workspace A, no existing instance, no move", got)
	}
}

func TestImportRefusesAnUnknownOrMalformedWorkspace(t *testing.T) {
	tn := newTenancy(t)
	if _, err := tn.s.resolveImportTarget(asUser(tn.alice), importTargetRequest{
		WorkspaceID: uuid.New().String(), GithubRepo: "o/r", RepoOwner: "o"}); status(t, err) != http.StatusNotFound {
		t.Error("an unknown workspace id must answer 404")
	}
	if _, err := tn.s.resolveImportTarget(asUser(tn.alice), importTargetRequest{
		WorkspaceID: "not-a-uuid", GithubRepo: "o/r", RepoOwner: "o"}); status(t, err) != http.StatusBadRequest {
		t.Error("a malformed workspace id must answer 400")
	}
}

// --- creating the organisation inline -----------------------------------------

// The takeover: naming an existing organisation as the "new workspace" used to
// return that organisation and add the caller to it.
func TestInlineCreationNeverJoinsAnExistingOrganisation(t *testing.T) {
	tn := newTenancy(t)
	before := tn.orgCount(t)
	for _, name := range []string{"Org B", "org b", "  ORG B  "} {
		_, err := tn.s.resolveImportTarget(asUser(tn.eve), importTargetRequest{
			WorkspaceID: "__new__", NewName: name, GithubRepo: "owner-x/repo-x", RepoOwner: "owner-x", InstanceName: "X"})
		if got := status(t, err); got != http.StatusConflict {
			t.Errorf("name %q answered %d, want 409", name, got)
		}
	}
	if tn.isMember(t, tn.orgB, tn.eve) {
		t.Fatal("the caller was added to an organisation they only named")
	}
	// Membership is what the access checks accept (web and MCP share them), so
	// the instances of the named organisation must stay out of reach.
	az := authz.New(orgdom.NewService(tn.db), workspacedom.NewService(tn.db), instancedom.NewService(tn.db))
	if err := az.InstanceAccess(asUser(tn.eve), tn.instB.ID); err == nil {
		t.Fatal("the caller reaches an instance of the organisation they only named")
	}
	if got := tn.orgCount(t); got != before {
		t.Errorf("organisations: %d before, %d after; a refused import must create nothing", before, got)
	}
}

func TestInlineCreationMakesTheCallerAdminOfANewOrganisation(t *testing.T) {
	tn := newTenancy(t)
	got, err := tn.s.resolveImportTarget(asUser(tn.eve), importTargetRequest{
		WorkspaceID: "__new__", NewName: "Eve Studio", GithubRepo: "eve-gh/repo", RepoOwner: "eve-gh", InstanceName: "Repo"})
	if err != nil {
		t.Fatalf("inline creation: %v", err)
	}
	org, err := tn.orgSvc.GetByName(importCtx(), "Eve Studio")
	if err != nil {
		t.Fatalf("the new organisation is missing: %v", err)
	}
	ok, role, _ := tn.orgSvc.IsMember(importCtx(), org.ID, tn.eve.ID)
	if !ok || role != domain.OrgRoleAdmin {
		t.Errorf("creator is member=%v role=%q, want org_admin", ok, role)
	}
	ws, err := workspacedom.NewService(tn.db).GetWorkspaceByOwner(importCtx(), "eve-gh")
	if err != nil || ws.ID != got.WorkspaceID || ws.OrgID != org.ID {
		t.Errorf("workspace %v/%v is not the new organisation's workspace for the repository owner", ws, err)
	}
}

func TestInlineCreationRefusesAGitHubOwnerAnotherOrganisationHolds(t *testing.T) {
	tn := newTenancy(t)
	before := tn.orgCount(t)
	_, err := tn.s.resolveImportTarget(asUser(tn.eve), importTargetRequest{
		WorkspaceID: "__new__", NewName: "Eve Studio", GithubRepo: "owner-b/other", RepoOwner: "owner-b", InstanceName: "Other"})
	if got := status(t, err); got != http.StatusConflict {
		t.Errorf("answered %d, want 409: a workspace for that GitHub owner belongs to another organisation", got)
	}
	if got := tn.orgCount(t); got != before {
		t.Errorf("a refused import left %d new organisation(s) behind", got-before)
	}
}

func TestInlineCreationReusesAWorkspaceOfTheCallersOwnOrganisation(t *testing.T) {
	tn := newTenancy(t)
	before := tn.orgCount(t)
	got, err := tn.s.resolveImportTarget(asUser(tn.alice), importTargetRequest{
		WorkspaceID: "__new__", NewName: "Whatever", GithubRepo: "owner-a/second", RepoOwner: "owner-a", InstanceName: "Second"})
	if err != nil {
		t.Fatalf("the caller administers the organisation that holds this owner's workspace: %v", err)
	}
	if got.WorkspaceID != tn.wsA.ID {
		t.Errorf("workspace = %v, want the existing workspace of A", got.WorkspaceID)
	}
	if tn.orgCount(t) != before {
		t.Error("an organisation was created although the workspace already exists")
	}
}

// --- a repository that is already connected ----------------------------------

func TestImportNeverTakesOverAnInstanceOfAnotherOrganisation(t *testing.T) {
	tn := newTenancy(t)
	for _, wsID := range []string{tn.wsA.ID.String(), "__existing__", "__new__"} {
		_, err := tn.s.resolveImportTarget(asUser(tn.alice), importTargetRequest{
			WorkspaceID: wsID, NewName: "Takeover", GithubRepo: "owner-b/repo-b", RepoOwner: "owner-b", InstanceName: "B"})
		if got := status(t, err); got != http.StatusConflict {
			t.Errorf("workspace %q answered %d, want 409", wsID, got)
		}
	}
	if got := tn.workspaceOf(t, tn.instB.ID); got != tn.wsB.ID {
		t.Fatal("another tenant's instance was moved")
	}
}

func TestReimportIntoOwnInstanceStaysInItsWorkspace(t *testing.T) {
	tn := newTenancy(t)
	for _, wsID := range []string{"__existing__", tn.wsA.ID.String()} {
		got, err := tn.s.resolveImportTarget(asUser(tn.alice), importTargetRequest{
			WorkspaceID: wsID, GithubRepo: "owner-a/repo-a", RepoOwner: "owner-a", InstanceName: "A"})
		if err != nil {
			t.Fatalf("workspace %q: %v", wsID, err)
		}
		if got.Existing == nil || got.Existing.ID != tn.instA.ID || got.WorkspaceID != tn.wsA.ID || got.NeedsMove {
			t.Errorf("workspace %q: target = %+v, want the existing instance in its own workspace, no move", wsID, got)
		}
	}
}

func TestMovingAnOwnInstanceNeedsAdminOfBothSides(t *testing.T) {
	tn := newTenancy(t)
	got, err := tn.s.resolveImportTarget(asUser(tn.alice), importTargetRequest{
		WorkspaceID: tn.wsA2.ID.String(), GithubRepo: "owner-a/repo-a", RepoOwner: "owner-a", InstanceName: "A"})
	if err != nil || !got.NeedsMove || got.WorkspaceID != tn.wsA2.ID {
		t.Errorf("a move between two workspaces of A: target=%+v err=%v, want a move to wsA2", got, err)
	}
	// Into a workspace of B: alice does not administer B.
	_, err = tn.s.resolveImportTarget(asUser(tn.alice), importTargetRequest{
		WorkspaceID: tn.wsB.ID.String(), GithubRepo: "owner-a/repo-a", RepoOwner: "owner-a", InstanceName: "A"})
	if got := status(t, err); got != http.StatusNotFound {
		t.Errorf("a move into a foreign workspace answered %d, want 404", got)
	}
}

func TestViewerCannotReimportOrMove(t *testing.T) {
	tn := newTenancy(t)
	_, err := tn.s.resolveImportTarget(asUser(tn.vic), importTargetRequest{
		WorkspaceID: "__existing__", GithubRepo: "owner-a/repo-a", RepoOwner: "owner-a", InstanceName: "A"})
	if got := status(t, err); got != http.StatusForbidden {
		t.Errorf("viewer answered %d, want 403", got)
	}
}

func TestExistingChoiceWithoutAnExistingInstance(t *testing.T) {
	tn := newTenancy(t)
	_, err := tn.s.resolveImportTarget(asUser(tn.alice), importTargetRequest{
		WorkspaceID: "__existing__", GithubRepo: "owner-a/never-linked", RepoOwner: "owner-a", InstanceName: "N"})
	if got := status(t, err); got != http.StatusBadRequest {
		t.Errorf("answered %d, want 400: there is no instance to re-import into", got)
	}
}

// The error a handler maps to a response carries a status, never a raw database error.
func TestRefusalsAreAppErrors(t *testing.T) {
	tn := newTenancy(t)
	_, err := tn.s.resolveImportTarget(asUser(tn.alice), importTargetRequest{
		WorkspaceID: tn.wsB.ID.String(), GithubRepo: "o/r", RepoOwner: "o"})
	var ae *apperror.AppError
	if !errors.As(err, &ae) {
		t.Fatalf("a refusal must be an app error, got %T", err)
	}
}

// A repository that already has an instance cannot be given a second one through
// the inline path, even by the administrator of the organisation that holds it.
func TestInlineCreationForAnAlreadyConnectedRepositoryIsAConflict(t *testing.T) {
	tn := newTenancy(t)
	before := tn.orgCount(t)
	_, err := tn.s.resolveImportTarget(asUser(tn.alice), importTargetRequest{
		WorkspaceID: "__new__", NewName: "Another", GithubRepo: "owner-a/repo-a", RepoOwner: "owner-a", InstanceName: "A"})
	if got := status(t, err); got != http.StatusConflict {
		t.Errorf("answered %d, want 409", got)
	}
	if tn.orgCount(t) != before {
		t.Error("a refused import created an organisation")
	}
}
