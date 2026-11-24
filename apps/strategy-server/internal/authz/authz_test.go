package authz

import (
	"context"
	"errors"
	"testing"

	"github.com/google/uuid"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/domain"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/web"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/pkg/apperror"
)

// fakes ------------------------------------------------------------------

type fakeOrgs struct {
	members map[[2]uuid.UUID]string // {org, user} -> role
	err     error
}

func (f *fakeOrgs) IsMember(_ context.Context, orgID, userID uuid.UUID) (bool, string, error) {
	if f.err != nil {
		return false, "", f.err
	}
	role, ok := f.members[[2]uuid.UUID{orgID, userID}]
	return ok, role, nil
}

func (f *fakeOrgs) UserOrgIDs(_ context.Context, userID uuid.UUID) ([]uuid.UUID, error) {
	if f.err != nil {
		return nil, f.err
	}
	var out []uuid.UUID
	for k := range f.members {
		if k[1] == userID {
			out = append(out, k[0])
		}
	}
	return out, nil
}

type fakeWorkspaces map[uuid.UUID]uuid.UUID // workspace -> org

func (f fakeWorkspaces) OrgIDForWorkspace(_ context.Context, id uuid.UUID) (uuid.UUID, error) {
	org, ok := f[id]
	if !ok {
		return uuid.Nil, apperror.ErrNotFound
	}
	return org, nil
}

type fakeInstances map[uuid.UUID]uuid.UUID // instance -> workspace

func (f fakeInstances) GetInstance(_ context.Context, id uuid.UUID) (*domain.StrategyInstance, error) {
	ws, ok := f[id]
	if !ok {
		return nil, apperror.ErrInstanceNotFound
	}
	return &domain.StrategyInstance{ID: id, WorkspaceID: ws}, nil
}

// world: org A (alice admin, vic viewer) with workspace wsA and instance instA;
// org B (bob admin) with workspace wsB and instance instB.
type world struct {
	a                    *Authorizer
	orgA, orgB           uuid.UUID
	wsA, wsB             uuid.UUID
	instA, instB         uuid.UUID
	alice, vic, bob, eve *web.User
}

func newWorld() *world {
	w := &world{
		orgA: uuid.New(), orgB: uuid.New(),
		wsA: uuid.New(), wsB: uuid.New(),
		instA: uuid.New(), instB: uuid.New(),
		alice: &web.User{ID: uuid.New()}, vic: &web.User{ID: uuid.New()},
		bob: &web.User{ID: uuid.New()}, eve: &web.User{ID: uuid.New()},
	}
	orgs := &fakeOrgs{members: map[[2]uuid.UUID]string{
		{w.orgA, w.alice.ID}: domain.OrgRoleAdmin,
		{w.orgA, w.vic.ID}:   domain.OrgRoleViewer,
		{w.orgB, w.bob.ID}:   domain.OrgRoleAdmin,
	}}
	w.a = &Authorizer{
		Orgs:       orgs,
		Workspaces: fakeWorkspaces{w.wsA: w.orgA, w.wsB: w.orgB},
		Instances:  fakeInstances{w.instA: w.wsA, w.instB: w.wsB},
	}
	return w
}

func as(u *web.User) context.Context { return web.ContextWithUser(context.Background(), u) }

func code(t *testing.T, err error) int {
	t.Helper()
	var ae *apperror.AppError
	if !errors.As(err, &ae) {
		t.Fatalf("not an app error: %v", err)
	}
	return ae.Code
}

// tests ------------------------------------------------------------------

func TestWorkspaceAccessFailsClosed(t *testing.T) {
	w := newWorld()
	if err := (&Authorizer{}).WorkspaceAccess(as(w.alice), w.wsA); err == nil {
		t.Fatal("an authorizer with no org service must deny")
	}
	if err := w.a.WorkspaceAccess(context.Background(), w.wsA); err == nil {
		t.Fatal("no principal must deny")
	}
}

func TestWorkspaceAccessByMembership(t *testing.T) {
	w := newWorld()
	if err := w.a.WorkspaceAccess(as(w.alice), w.wsA); err != nil {
		t.Errorf("admin of A: %v", err)
	}
	if err := w.a.WorkspaceAccess(as(w.vic), w.wsA); err != nil {
		t.Errorf("viewer of A: %v", err)
	}
	if err := w.a.WorkspaceAccess(as(w.bob), w.wsA); code(t, err) != apperror.ErrForbidden.Code {
		t.Errorf("member of B on a workspace of A: %v", err)
	}
}

func TestInstanceAccessAnswersLikeAMissingInstance(t *testing.T) {
	w := newWorld()
	if err := w.a.InstanceAccess(as(w.alice), w.instA); err != nil {
		t.Fatalf("member: %v", err)
	}
	foreign := w.a.InstanceAccess(as(w.bob), w.instA)
	missing := w.a.InstanceAccess(as(w.bob), uuid.New())
	if foreign == nil || missing == nil {
		t.Fatal("a non-member and a missing instance must both be refused")
	}
	if code(t, foreign) != code(t, missing) {
		t.Errorf("foreign instance answers %d, missing answers %d: ids can be probed", code(t, foreign), code(t, missing))
	}
}

func TestInstanceAccessOfAScopedTokenUsesItsGrantsAlone(t *testing.T) {
	w := newWorld()
	// Bob belongs to B only, but holds a read grant on instA: grants decide.
	p := &web.Principal{User: w.bob, TokenID: ptr(uuid.New()),
		Grants: []web.InstanceGrant{{InstanceID: w.instA, Permission: web.PermissionRead}}}
	ctx := web.ContextWithPrincipal(context.Background(), p)
	if err := w.a.InstanceAccess(ctx, w.instA); err != nil {
		t.Errorf("granted instance: %v", err)
	}
	// Alice administers B? No: she belongs to A only; a grant on instB she lacks.
	p2 := &web.Principal{User: w.alice, TokenID: ptr(uuid.New()),
		Grants: []web.InstanceGrant{{InstanceID: w.instB, Permission: web.PermissionRead}}}
	ctx2 := web.ContextWithPrincipal(context.Background(), p2)
	if err := w.a.InstanceAccess(ctx2, w.instA); code(t, err) != apperror.ErrInstanceNotFound.Code {
		t.Errorf("a member's token without a grant for the instance must not reach it: %v", err)
	}
}

func TestInstanceWriteOfAScopedTokenNeedsAWriteGrant(t *testing.T) {
	w := newWorld()
	read := &web.Principal{User: w.alice, TokenID: ptr(uuid.New()),
		Grants: []web.InstanceGrant{{InstanceID: w.instA, Permission: web.PermissionRead}}}
	if err := w.a.InstanceWrite(web.ContextWithPrincipal(context.Background(), read), w.instA); code(t, err) != apperror.ErrForbidden.Code {
		t.Errorf("read grant: %v", err)
	}
	write := &web.Principal{User: w.alice, TokenID: ptr(uuid.New()),
		Grants: []web.InstanceGrant{{InstanceID: w.instA, Permission: web.PermissionWrite}}}
	if err := w.a.InstanceWrite(web.ContextWithPrincipal(context.Background(), write), w.instA); err != nil {
		t.Errorf("write grant: %v", err)
	}
}

func TestOrgAdminNeedsTheAdminRole(t *testing.T) {
	w := newWorld()
	if err := w.a.OrgAdmin(as(w.alice), w.orgA); err != nil {
		t.Errorf("admin: %v", err)
	}
	if err := w.a.OrgAdmin(as(w.vic), w.orgA); code(t, err) != apperror.ErrForbidden.Code {
		t.Errorf("viewer: %v", err)
	}
	if err := w.a.OrgAdmin(as(w.bob), w.orgA); code(t, err) != apperror.ErrNotFound.Code {
		t.Errorf("non-member must get not-found, not a confirmation the org exists: %v", err)
	}
	if err := w.a.OrgAdmin(as(w.eve), w.orgA); err == nil {
		t.Error("a user in no organisation must be refused")
	}
}

func TestOrgAdminRefusesTokens(t *testing.T) {
	w := newWorld()
	p := &web.Principal{User: w.alice, TokenID: ptr(uuid.New())}
	if err := w.a.OrgAdmin(web.ContextWithPrincipal(context.Background(), p), w.orgA); err == nil {
		t.Fatal("a token must never pass an organisation-admin check")
	}
}

func TestWorkspaceAdminResolvesTheOrganisation(t *testing.T) {
	w := newWorld()
	if err := w.a.WorkspaceAdmin(as(w.alice), w.wsA); err != nil {
		t.Errorf("admin of the workspace's org: %v", err)
	}
	if err := w.a.WorkspaceAdmin(as(w.alice), w.wsB); err == nil {
		t.Error("admin of A on a workspace of B must be refused")
	}
	if err := w.a.WorkspaceAdmin(as(w.alice), uuid.New()); err == nil {
		t.Error("an unknown workspace must be refused")
	}
}

func TestInstanceAdminNeedsAdminOfTheInstancesOrganisation(t *testing.T) {
	w := newWorld()
	if err := w.a.InstanceAdmin(as(w.alice), w.instA); err != nil {
		t.Errorf("admin of A on an instance of A: %v", err)
	}
	if err := w.a.InstanceAdmin(as(w.vic), w.instA); err == nil {
		t.Error("a viewer must not administer an instance")
	}
	foreign := w.a.InstanceAdmin(as(w.alice), w.instB)
	missing := w.a.InstanceAdmin(as(w.alice), uuid.New())
	if foreign == nil || missing == nil || code(t, foreign) != code(t, missing) {
		t.Errorf("a foreign instance must answer like a missing one: %v vs %v", foreign, missing)
	}
}

func TestUserOrgIDs(t *testing.T) {
	w := newWorld()
	if got := w.a.UserOrgIDs(as(w.alice)); len(got) != 1 || got[0] != w.orgA {
		t.Errorf("alice: %v", got)
	}
	if got := w.a.UserOrgIDs(context.Background()); got != nil {
		t.Errorf("no user: %v", got)
	}
	if got := (&Authorizer{}).UserOrgIDs(as(w.alice)); got != nil {
		t.Errorf("no org service: %v", got)
	}
}

func TestMembershipLookupFailureIsAnError(t *testing.T) {
	w := newWorld()
	w.a.Orgs = &fakeOrgs{err: errors.New("db down")}
	if err := w.a.WorkspaceAccess(as(w.alice), w.wsA); err == nil {
		t.Fatal("a failed membership lookup must not allow")
	}
}

func ptr[T any](v T) *T { return &v }
