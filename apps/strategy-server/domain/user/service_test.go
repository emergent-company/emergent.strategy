package user_test

import (
	"context"
	"testing"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/org"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/user"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/audit"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/database"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/pkg/apperror"
)

func newCtx() context.Context {
	ctx := context.Background()
	ctx = audit.ContextWithSource(ctx, audit.SourceSystem)
	return audit.ContextWithAudit(ctx, audit.NewSlogWriter())
}

func TestEnsureUser_CreateNew(t *testing.T) {
	db := database.TestDB(t)
	svc := user.NewService(db)
	ctx := newCtx()

	u, err := svc.EnsureUser(ctx, "sub-1", "alice@example.com", "Alice")
	if err != nil {
		t.Fatalf("EnsureUser: %v", err)
	}
	if u.Sub != "sub-1" {
		t.Errorf("sub=%q, want sub-1", u.Sub)
	}
	if u.Email != "alice@example.com" {
		t.Errorf("email=%q, want alice@example.com", u.Email)
	}
}

func TestEnsureUser_Idempotent(t *testing.T) {
	db := database.TestDB(t)
	svc := user.NewService(db)
	ctx := newCtx()

	u1, err := svc.EnsureUser(ctx, "sub-2", "bob@example.com", "Bob")
	if err != nil {
		t.Fatalf("first EnsureUser: %v", err)
	}

	u2, err := svc.EnsureUser(ctx, "sub-2", "bob-new@example.com", "Bob Updated")
	if err != nil {
		t.Fatalf("second EnsureUser: %v", err)
	}

	if u1.ID != u2.ID {
		t.Error("expected same user ID on second call")
	}
	// Email should be updated.
	if u2.Email != "bob-new@example.com" {
		t.Errorf("email=%q, want bob-new@example.com (should be updated)", u2.Email)
	}
}

func TestGetByID(t *testing.T) {
	db := database.TestDB(t)
	svc := user.NewService(db)
	ctx := newCtx()

	u, _ := svc.EnsureUser(ctx, "sub-3", "carol@example.com", "Carol")

	found, err := svc.GetByID(ctx, u.ID)
	if err != nil {
		t.Fatalf("GetByID: %v", err)
	}
	if found.Sub != "sub-3" {
		t.Errorf("sub=%q, want sub-3", found.Sub)
	}
}

func TestGetBySub(t *testing.T) {
	db := database.TestDB(t)
	svc := user.NewService(db)
	ctx := newCtx()

	svc.EnsureUser(ctx, "sub-4", "dave@example.com", "Dave") //nolint:errcheck

	found, err := svc.GetBySub(ctx, "sub-4")
	if err != nil {
		t.Fatalf("GetBySub: %v", err)
	}
	if found.Email != "dave@example.com" {
		t.Errorf("email=%q, want dave@example.com", found.Email)
	}
}

func TestGetBySub_NotFound(t *testing.T) {
	db := database.TestDB(t)
	svc := user.NewService(db)
	ctx := newCtx()

	_, err := svc.GetBySub(ctx, "nonexistent-sub")
	if err == nil {
		t.Fatal("expected error for nonexistent sub")
	}
	if apperror.AsAppError(err) == nil {
		t.Errorf("expected AppError, got %T", err)
	}
}

func TestEnsureUser_AcceptsPendingInvitations(t *testing.T) {
	db := database.TestDB(t)
	userSvc := user.NewService(db)
	orgSvc := org.NewService(db)
	ctx := newCtx()

	// Create an admin user and org.
	admin, _ := userSvc.EnsureUser(ctx, "admin-sub", "admin@example.com", "Admin")
	o, _ := orgSvc.Create(ctx, "Test Org", admin.ID)

	// Invite a new user by email.
	err := orgSvc.Invite(ctx, o.ID, "newuser@example.com", "org_viewer", admin.ID)
	if err != nil {
		t.Fatalf("Invite: %v", err)
	}

	// When the new user logs in, EnsureUser should auto-accept the invitation.
	newUser, err := userSvc.EnsureUser(ctx, "newuser-sub", "newuser@example.com", "New User")
	if err != nil {
		t.Fatalf("EnsureUser (new user): %v", err)
	}

	// Verify membership was created.
	isMember, role, err := orgSvc.IsMember(ctx, o.ID, newUser.ID)
	if err != nil {
		t.Fatalf("IsMember: %v", err)
	}
	if !isMember {
		t.Error("new user should be a member after accepting invitation")
	}
	if role != "org_viewer" {
		t.Errorf("role=%q, want org_viewer", role)
	}
}
