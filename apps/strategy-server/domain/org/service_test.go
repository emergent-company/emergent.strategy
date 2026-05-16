package org_test

import (
	"context"
	"testing"

	"github.com/google/uuid"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/org"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/user"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/audit"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/database"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/domain"
)

func newCtx() context.Context {
	ctx := context.Background()
	ctx = audit.ContextWithSource(ctx, audit.SourceSystem)
	return audit.ContextWithAudit(ctx, audit.NewSlogWriter())
}

func seedUser(t *testing.T, db *database.DB, sub, email, name string) *domain.User {
	t.Helper()
	ctx := newCtx()
	svc := user.NewService(db)
	u, err := svc.EnsureUser(ctx, sub, email, name)
	if err != nil {
		t.Fatalf("seed user %q: %v", email, err)
	}
	return u
}

func TestCreate(t *testing.T) {
	db := database.TestDB(t)
	ctx := newCtx()
	svc := org.NewService(db)
	u := seedUser(t, db, "create-sub", "create@example.com", "Creator")

	o, err := svc.Create(ctx, "Test Org", u.ID)
	if err != nil {
		t.Fatalf("Create: %v", err)
	}
	if o.Name != "Test Org" {
		t.Errorf("name=%q, want Test Org", o.Name)
	}
	if o.Slug == "" {
		t.Error("slug should not be empty")
	}

	// Creator should be admin.
	isMember, role, err := svc.IsMember(ctx, o.ID, u.ID)
	if err != nil {
		t.Fatalf("IsMember: %v", err)
	}
	if !isMember {
		t.Error("creator should be a member")
	}
	if role != "org_admin" {
		t.Errorf("role=%q, want org_admin", role)
	}
}

func TestList(t *testing.T) {
	db := database.TestDB(t)
	ctx := newCtx()
	svc := org.NewService(db)
	u := seedUser(t, db, "list-sub", "list@example.com", "Lister")

	// No orgs initially.
	orgs, err := svc.List(ctx, u.ID)
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	if len(orgs) != 0 {
		t.Errorf("expected 0 orgs, got %d", len(orgs))
	}

	// After creating one.
	svc.Create(ctx, "Org One", u.ID) //nolint:errcheck
	orgs, err = svc.List(ctx, u.ID)
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	if len(orgs) != 1 {
		t.Errorf("expected 1 org, got %d", len(orgs))
	}
}

func TestAddMember(t *testing.T) {
	db := database.TestDB(t)
	ctx := newCtx()
	svc := org.NewService(db)
	admin := seedUser(t, db, "admin-sub", "admin@example.com", "Admin")
	viewer := seedUser(t, db, "viewer-sub", "viewer@example.com", "Viewer")

	o, _ := svc.Create(ctx, "Member Org", admin.ID)

	membership, err := svc.AddMember(ctx, o.ID, viewer.ID, "org_viewer")
	if err != nil {
		t.Fatalf("AddMember: %v", err)
	}
	if membership.Role != "org_viewer" {
		t.Errorf("role=%q, want org_viewer", membership.Role)
	}

	// Verify via ListMembers.
	members, err := svc.ListMembers(ctx, o.ID)
	if err != nil {
		t.Fatalf("ListMembers: %v", err)
	}
	if len(members) != 2 { // admin + viewer
		t.Errorf("expected 2 members, got %d", len(members))
	}
}

func TestRemoveMember(t *testing.T) {
	db := database.TestDB(t)
	ctx := newCtx()
	svc := org.NewService(db)
	admin := seedUser(t, db, "rm-admin", "rm-admin@example.com", "Admin")
	viewer := seedUser(t, db, "rm-viewer", "rm-viewer@example.com", "Viewer")

	o, _ := svc.Create(ctx, "Remove Org", admin.ID)
	svc.AddMember(ctx, o.ID, viewer.ID, "org_viewer") //nolint:errcheck

	// Remove the viewer.
	err := svc.RemoveMember(ctx, o.ID, viewer.ID)
	if err != nil {
		t.Fatalf("RemoveMember: %v", err)
	}

	isMember, _, _ := svc.IsMember(ctx, o.ID, viewer.ID)
	if isMember {
		t.Error("viewer should no longer be a member")
	}
}

func TestRemoveMember_LastAdmin(t *testing.T) {
	db := database.TestDB(t)
	ctx := newCtx()
	svc := org.NewService(db)
	admin := seedUser(t, db, "last-admin", "last@example.com", "Admin")

	o, _ := svc.Create(ctx, "Solo Org", admin.ID)

	// Should fail — can't remove the last admin.
	err := svc.RemoveMember(ctx, o.ID, admin.ID)
	if err == nil {
		t.Fatal("expected error when removing last admin")
	}
	t.Logf("got expected error: %v", err)
}

func TestIsMember_NotMember(t *testing.T) {
	db := database.TestDB(t)
	ctx := newCtx()
	svc := org.NewService(db)
	admin := seedUser(t, db, "is-admin", "is-admin@example.com", "Admin")
	stranger := seedUser(t, db, "stranger", "stranger@example.com", "Stranger")

	o, _ := svc.Create(ctx, "Private Org", admin.ID)

	isMember, _, err := svc.IsMember(ctx, o.ID, stranger.ID)
	if err != nil {
		t.Fatalf("IsMember: %v", err)
	}
	if isMember {
		t.Error("stranger should not be a member")
	}
}

func TestUserOrgIDs(t *testing.T) {
	db := database.TestDB(t)
	ctx := newCtx()
	svc := org.NewService(db)
	u := seedUser(t, db, "multi-org", "multi@example.com", "Multi")

	svc.Create(ctx, "Org A", u.ID) //nolint:errcheck
	svc.Create(ctx, "Org B", u.ID) //nolint:errcheck

	orgIDs, err := svc.UserOrgIDs(ctx, u.ID)
	if err != nil {
		t.Fatalf("UserOrgIDs: %v", err)
	}
	if len(orgIDs) != 2 {
		t.Errorf("expected 2 org IDs, got %d", len(orgIDs))
	}
}

func TestInvite_ExistingUser(t *testing.T) {
	db := database.TestDB(t)
	ctx := newCtx()
	svc := org.NewService(db)
	admin := seedUser(t, db, "inv-admin", "inv-admin@example.com", "Admin")
	invitee := seedUser(t, db, "inv-user", "invitee@example.com", "Invitee")

	o, _ := svc.Create(ctx, "Invite Org", admin.ID)

	// Invite an existing user — should create membership directly.
	err := svc.Invite(ctx, o.ID, invitee.Email, "org_viewer", admin.ID)
	if err != nil {
		t.Fatalf("Invite: %v", err)
	}

	isMember, role, _ := svc.IsMember(ctx, o.ID, invitee.ID)
	if !isMember {
		t.Error("invitee should be a member after invitation")
	}
	if role != "org_viewer" {
		t.Errorf("role=%q, want org_viewer", role)
	}
}

func TestInvite_PendingUser(t *testing.T) {
	db := database.TestDB(t)
	ctx := newCtx()
	svc := org.NewService(db)
	admin := seedUser(t, db, "pend-admin", "pend-admin@example.com", "Admin")

	o, _ := svc.Create(ctx, "Pending Org", admin.ID)

	// Invite a non-existent user — should create a pending invitation.
	err := svc.Invite(ctx, o.ID, "future@example.com", "org_viewer", admin.ID)
	if err != nil {
		t.Fatalf("Invite: %v", err)
	}

	// Check pending invitations.
	invitations, err := svc.ListPendingInvitations(ctx, o.ID)
	if err != nil {
		t.Fatalf("ListPendingInvitations: %v", err)
	}
	if len(invitations) != 1 {
		t.Fatalf("expected 1 pending invitation, got %d", len(invitations))
	}
	if invitations[0].Email != "future@example.com" {
		t.Errorf("email=%q, want future@example.com", invitations[0].Email)
	}
}

func TestEnsureDevOrg(t *testing.T) {
	db := database.TestDB(t)
	ctx := newCtx()
	svc := org.NewService(db)
	devUserID := uuid.MustParse("00000000-0000-0000-0000-000000000001")

	// Seed the dev user.
	userSvc := user.NewService(db)
	userSvc.EnsureUser(ctx, "dev-user", "dev@local", "Dev User") //nolint:errcheck
	// Override ID to match the dev user constant.
	db.NewUpdate().TableExpr("users").
		Set("id = ?", devUserID).
		Where("sub = ?", "dev-user").
		Exec(ctx) //nolint:errcheck

	o, err := svc.EnsureDevOrg(ctx, devUserID)
	if err != nil {
		t.Fatalf("EnsureDevOrg: %v", err)
	}
	if o.Slug != "dev" {
		t.Errorf("slug=%q, want dev", o.Slug)
	}

	// Idempotent.
	o2, err := svc.EnsureDevOrg(ctx, devUserID)
	if err != nil {
		t.Fatalf("second EnsureDevOrg: %v", err)
	}
	if o2.ID != o.ID {
		t.Error("expected same org on second call")
	}
}
