package web

import (
	"context"
	"testing"

	"github.com/google/uuid"
)

// TestUserFromContext_StillWorksAfterPrincipal guards the compatibility shim.
//
// Principal replaced *User as the context value, but ~40 call sites read
// UserFromContext. If that stopped returning the user, every one of them would
// see nil — and since authorisation now fails closed, the symptom would be
// blanket denial rather than a compile error.
func TestUserFromContext_StillWorksAfterPrincipal(t *testing.T) {
	ctx := ContextWithUser(context.Background(), DevUser)

	u := UserFromContext(ctx)
	if u == nil {
		t.Fatal("UserFromContext returned nil for a context built by ContextWithUser")
	}
	if u.ID != DevUser.ID {
		t.Errorf("ID = %v, want %v", u.ID, DevUser.ID)
	}

	p := PrincipalFromContext(ctx)
	if p == nil {
		t.Fatal("PrincipalFromContext returned nil")
	}
	if p.Scoped() {
		t.Error("a principal from ContextWithUser must be unscoped — grants would " +
			"narrow an interactive session to nothing")
	}
	if p.ReadOnly {
		t.Error("a principal from ContextWithUser must not be read-only")
	}
}

func TestUserFromContext_NilWhenAbsent(t *testing.T) {
	if u := UserFromContext(context.Background()); u != nil {
		t.Errorf("UserFromContext on an empty context = %v, want nil", u)
	}
	if p := PrincipalFromContext(context.Background()); p != nil {
		t.Errorf("PrincipalFromContext on an empty context = %v, want nil", p)
	}
}

// TestPrincipal_GrantFor covers the lookup that decides read vs write on a
// scoped credential.
func TestPrincipal_GrantFor(t *testing.T) {
	instA, instB := uuid.New(), uuid.New()
	p := &Principal{
		User:     DevUser,
		Grants:   []InstanceGrant{{InstanceID: instA, Permission: PermissionRead}},
		ReadOnly: true,
	}

	g, ok := p.GrantFor(instA)
	if !ok {
		t.Fatal("GrantFor(granted instance) returned not-found")
	}
	if g.Permission != PermissionRead {
		t.Errorf("permission = %q, want %q", g.Permission, PermissionRead)
	}

	if _, ok := p.GrantFor(instB); ok {
		t.Error("GrantFor(ungranted instance) returned a grant — a scoped token " +
			"must not reach instances outside its grants")
	}

	if !p.Scoped() {
		t.Error("a principal with grants must report Scoped()")
	}
}

// TestDevPrincipal_IsPresentAndUnscoped records that dev mode is expressed as
// a present principal, not an absent one. If DevPrincipal were nil or scoped,
// fail-closed authorisation would deny every request in dev.
func TestDevPrincipal_IsPresentAndUnscoped(t *testing.T) {
	if DevPrincipal == nil || DevPrincipal.User == nil {
		t.Fatal("DevPrincipal must be a present principal — authorisation fails " +
			"closed, so dev mode cannot rely on absence")
	}
	if DevPrincipal.User.ID != DevUser.ID {
		t.Errorf("DevPrincipal.User.ID = %v, want %v", DevPrincipal.User.ID, DevUser.ID)
	}
	if DevPrincipal.Scoped() {
		t.Error("DevPrincipal must be unscoped")
	}
	if DevPrincipal.ReadOnly {
		t.Error("DevPrincipal must not be read-only")
	}
}
