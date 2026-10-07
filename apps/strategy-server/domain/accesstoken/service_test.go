package accesstoken_test

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/uptrace/bun"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/accesstoken"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/audit"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/database"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/domain"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/pkg/apperror"
)

// fakeOrg is an in-memory OrgChecker. Membership is revocable mid-test, which
// is the point: the owner-loses-access path cannot be exercised otherwise.
type fakeOrg struct {
	members map[string]bool // "orgID|userID"
	err     error
}

func newFakeOrg() *fakeOrg { return &fakeOrg{members: map[string]bool{}} }

func key(orgID, userID uuid.UUID) string { return orgID.String() + "|" + userID.String() }

func (f *fakeOrg) add(orgID, userID uuid.UUID)    { f.members[key(orgID, userID)] = true }
func (f *fakeOrg) remove(orgID, userID uuid.UUID) { delete(f.members, key(orgID, userID)) }

func (f *fakeOrg) IsMember(_ context.Context, orgID, userID uuid.UUID) (bool, string, error) {
	if f.err != nil {
		return false, "", f.err
	}
	if f.members[key(orgID, userID)] {
		return true, domain.OrgRoleAdmin, nil
	}
	return false, "", nil
}

type fixture struct {
	svc    *accesstoken.Service
	org    *fakeOrg
	db     *bun.DB
	orgID  uuid.UUID
	userID uuid.UUID
	instID uuid.UUID
	ctx    context.Context
}

func newFixture(t *testing.T) *fixture {
	t.Helper()
	db := database.TestDB(t)
	ctx := audit.ContextWithAudit(
		audit.ContextWithSource(context.Background(), audit.SourceSystem),
		audit.NewSlogWriter(),
	)

	userID, orgID, wsID, instID := uuid.New(), uuid.New(), uuid.New(), uuid.New()

	mustExec(t, db, ctx, &domain.User{
		ID: userID, Sub: "sub-" + userID.String()[:8], Email: userID.String()[:8] + "@t.io",
	})
	mustExec(t, db, ctx, &domain.Org{ID: orgID, Name: "Org", Slug: "org-" + orgID.String()[:8]})
	mustExec(t, db, ctx, &domain.Workspace{
		ID: wsID, GithubOwner: "own-" + wsID.String()[:8], OrgID: orgID,
	})
	mustExec(t, db, ctx, &domain.StrategyInstance{ID: instID, WorkspaceID: wsID, Name: "Inst"})

	org := newFakeOrg()
	org.add(orgID, userID)

	return &fixture{
		svc: accesstoken.NewService(db, org), org: org, db: db,
		orgID: orgID, userID: userID, instID: instID, ctx: ctx,
	}
}

func mustExec(t *testing.T, db *bun.DB, ctx context.Context, model any) {
	t.Helper()
	if _, err := db.NewInsert().Model(model).Exec(ctx); err != nil {
		t.Fatalf("seed %T: %v", model, err)
	}
}

func (f *fixture) mint(t *testing.T, perm string) *accesstoken.MintResult {
	t.Helper()
	res, err := f.svc.Mint(f.ctx, accesstoken.MintParams{
		OrgID: f.orgID, UserID: f.userID, Name: "test",
		Grants: []accesstoken.GrantRequest{{InstanceID: f.instID, Permission: perm}},
	})
	if err != nil {
		t.Fatalf("Mint: %v", err)
	}
	return res
}

// assertTokenInvalid checks the error is the single opaque auth failure.
func assertTokenInvalid(t *testing.T, err error) {
	t.Helper()
	if err == nil {
		t.Fatal("expected the token to be rejected, got nil error")
	}
	var ae *apperror.AppError
	if !errors.As(err, &ae) || ae.Code != apperror.ErrTokenInvalid.Code {
		t.Fatalf("error = %v, want ErrTokenInvalid (%d)", err, apperror.ErrTokenInvalid.Code)
	}
}

func TestMint_Resolve_RoundTrip(t *testing.T) {
	f := newFixture(t)
	res := f.mint(t, domain.TokenPermissionRead)

	if res.Plaintext == "" {
		t.Fatal("Mint returned no plaintext; it is the only time the caller can see it")
	}
	if res.Token.TokenHash == res.Plaintext {
		t.Fatal("the stored hash is the plaintext")
	}

	resolved, err := f.svc.Resolve(f.ctx, res.Plaintext)
	if err != nil {
		t.Fatalf("Resolve: %v", err)
	}
	if resolved.TokenID != res.Token.ID {
		t.Errorf("TokenID = %v, want %v", resolved.TokenID, res.Token.ID)
	}
	if resolved.UserID != f.userID {
		t.Errorf("UserID = %v, want %v", resolved.UserID, f.userID)
	}
	if len(resolved.Grants) != 1 || resolved.Grants[0].InstanceID != f.instID {
		t.Fatalf("grants = %+v, want one grant for %v", resolved.Grants, f.instID)
	}
	if resolved.Grants[0].Permission != domain.TokenPermissionRead {
		t.Errorf("permission = %q, want read", resolved.Grants[0].Permission)
	}
}

func TestResolve_WrongTokenRejected(t *testing.T) {
	f := newFixture(t)
	real := f.mint(t, domain.TokenPermissionRead)

	cases := map[string]string{
		"empty":            "",
		"garbage":          "est_notarealtokenatall",
		"right prefix":     real.Plaintext[:accesstoken.PrefixLen] + "XXXXXXXXXXXXXX",
		"one char changed": real.Plaintext[:len(real.Plaintext)-1] + "Z",
	}
	for name, candidate := range cases {
		t.Run(name, func(t *testing.T) {
			if candidate == real.Plaintext {
				t.Skip("mutation produced the real token")
			}
			_, err := f.svc.Resolve(f.ctx, candidate)
			assertTokenInvalid(t, err)
		})
	}
}

// TestResolve_PrefixCollisionHandled proves lookup iterates candidates rather
// than assuming the prefix is unique.
//
// The prefix is only 8 characters, so two tokens *can* share one. If Resolve
// took the first candidate row and compared only that, one of the two
// colliding tokens would stop authenticating — intermittently, and only for
// whichever row the planner returned first.
//
// Generate cannot be made to collide on demand, so the second token is
// constructed directly: a plaintext sharing the first PrefixLen characters of
// the real one, with its own independently computed hash.
func TestResolve_PrefixCollisionHandled(t *testing.T) {
	f := newFixture(t)
	a := f.mint(t, domain.TokenPermissionRead)

	// Same first 8 characters, different secret.
	collider := a.Plaintext[:accesstoken.PrefixLen] + "ZZZZcolliderZZZZ"
	if collider == a.Plaintext {
		t.Fatal("constructed collider equals the real token")
	}
	colliderHash, err := accesstoken.Hash(collider)
	if err != nil {
		t.Fatalf("Hash(collider): %v", err)
	}

	bID := uuid.New()
	mustExec(t, f.db, f.ctx, &domain.AccessToken{
		ID: bID, OrgID: f.orgID, UserID: f.userID, Name: "collider",
		TokenPrefix: accesstoken.LookupPrefix(collider),
		TokenHash:   colliderHash,
		ExpiresAt:   time.Now().Add(time.Hour),
	})
	mustExec(t, f.db, f.ctx, &domain.AccessTokenGrant{
		ID: uuid.New(), TokenID: bID, InstanceID: f.instID,
		Permission: domain.TokenPermissionWrite,
	})

	// Both rows now share one prefix, so each lookup returns two candidates
	// and only the Argon2id comparison can tell them apart.
	ra, err := f.svc.Resolve(f.ctx, a.Plaintext)
	if err != nil {
		t.Fatalf("Resolve(real) under prefix collision: %v", err)
	}
	if ra.TokenID != a.Token.ID {
		t.Errorf("real token resolved to %v, want %v", ra.TokenID, a.Token.ID)
	}
	if ra.Grants[0].Permission != domain.TokenPermissionRead {
		t.Errorf("real token got permission %q, want read — it resolved to the wrong row",
			ra.Grants[0].Permission)
	}

	rb, err := f.svc.Resolve(f.ctx, collider)
	if err != nil {
		t.Fatalf("Resolve(collider): %v", err)
	}
	if rb.TokenID != bID {
		t.Errorf("collider resolved to %v, want %v — candidate iteration is broken",
			rb.TokenID, bID)
	}
	if rb.Grants[0].Permission != domain.TokenPermissionWrite {
		t.Errorf("collider got permission %q, want write", rb.Grants[0].Permission)
	}
}

func TestResolve_ExpiredRejected(t *testing.T) {
	f := newFixture(t)
	res := f.mint(t, domain.TokenPermissionRead)

	if _, err := f.db.NewUpdate().Model((*domain.AccessToken)(nil)).
		Set("expires_at = ?", time.Now().Add(-time.Minute)).
		Where("id = ?", res.Token.ID).Exec(f.ctx); err != nil {
		t.Fatalf("expire token: %v", err)
	}

	_, err := f.svc.Resolve(f.ctx, res.Plaintext)
	assertTokenInvalid(t, err)
}

func TestResolve_RevokedRejected(t *testing.T) {
	f := newFixture(t)
	res := f.mint(t, domain.TokenPermissionRead)

	if err := f.svc.Revoke(f.ctx, f.orgID, res.Token.ID); err != nil {
		t.Fatalf("Revoke: %v", err)
	}

	_, err := f.svc.Resolve(f.ctx, res.Plaintext)
	assertTokenInvalid(t, err)
}

// TestRevoke_PurgesCache is the one that matters for revocation latency.
//
// A successful Resolve populates the cache. If Revoke did not purge it, the
// token would keep authenticating for the full cache TTL after being
// revoked — on the very replica that processed the revocation.
func TestRevoke_PurgesCache(t *testing.T) {
	f := newFixture(t)
	res := f.mint(t, domain.TokenPermissionRead)

	if _, err := f.svc.Resolve(f.ctx, res.Plaintext); err != nil {
		t.Fatalf("priming Resolve: %v", err)
	}
	if err := f.svc.Revoke(f.ctx, f.orgID, res.Token.ID); err != nil {
		t.Fatalf("Revoke: %v", err)
	}

	_, err := f.svc.Resolve(f.ctx, res.Plaintext)
	assertTokenInvalid(t, err)
}

// TestResolve_UsesCache verifies the cache is actually consulted, by deleting
// the row behind the service's back. A second Resolve that still succeeds
// could only have come from cache.
func TestResolve_UsesCache(t *testing.T) {
	f := newFixture(t)
	res := f.mint(t, domain.TokenPermissionRead)

	if _, err := f.svc.Resolve(f.ctx, res.Plaintext); err != nil {
		t.Fatalf("first Resolve: %v", err)
	}

	if _, err := f.db.NewDelete().Model((*domain.AccessToken)(nil)).
		Where("id = ?", res.Token.ID).Exec(f.ctx); err != nil {
		t.Fatalf("delete row: %v", err)
	}

	if _, err := f.svc.Resolve(f.ctx, res.Plaintext); err != nil {
		t.Errorf("second Resolve failed, so the cache was not used: %v", err)
	}
}

// TestResolve_OwnerLostMembershipDenies covers Key Decision 4.
//
// A grant is a narrowing of the owner's authority, evaluated at use time. If
// the owner is removed from the org, the token must stop working immediately
// — without anyone remembering to revoke it.
func TestResolve_OwnerLostMembershipDenies(t *testing.T) {
	f := newFixture(t)
	res := f.mint(t, domain.TokenPermissionRead)

	if _, err := f.svc.Resolve(f.ctx, res.Plaintext); err != nil {
		t.Fatalf("Resolve before revocation: %v", err)
	}

	f.org.remove(f.orgID, f.userID)

	// Bypass the cache, which legitimately holds the earlier success for its
	// TTL. This asserts the re-check itself, not the cache window.
	fresh := accesstoken.NewService(f.db, f.org)
	_, err := fresh.Resolve(f.ctx, res.Plaintext)
	assertTokenInvalid(t, err)
}

// TestMint_BeyondMinterAuthorityRejected covers the other half of Decision 4:
// minting must not be a privilege-escalation primitive.
func TestMint_BeyondMinterAuthorityRejected(t *testing.T) {
	f := newFixture(t)

	// An instance in an org the minter does not belong to.
	otherOrg, otherWS, otherInst := uuid.New(), uuid.New(), uuid.New()
	mustExec(t, f.db, f.ctx, &domain.Org{
		ID: otherOrg, Name: "Other", Slug: "other-" + otherOrg.String()[:8],
	})
	mustExec(t, f.db, f.ctx, &domain.Workspace{
		ID: otherWS, GithubOwner: "oth-" + otherWS.String()[:8], OrgID: otherOrg,
	})
	mustExec(t, f.db, f.ctx, &domain.StrategyInstance{
		ID: otherInst, WorkspaceID: otherWS, Name: "Other Inst",
	})

	_, err := f.svc.Mint(f.ctx, accesstoken.MintParams{
		OrgID: f.orgID, UserID: f.userID, Name: "escalation attempt",
		Grants: []accesstoken.GrantRequest{
			{InstanceID: otherInst, Permission: domain.TokenPermissionRead},
		},
	})
	if err == nil {
		t.Fatal("minted a token granting access to an instance the minter cannot reach")
	}

	// Not-found, not forbidden — distinguishing them would confirm the
	// instance exists.
	var ae *apperror.AppError
	if !errors.As(err, &ae) || ae.Code != apperror.ErrInstanceNotFound.Code {
		t.Errorf("error = %v, want ErrInstanceNotFound (%d)", err, apperror.ErrInstanceNotFound.Code)
	}
}

func TestMint_Validation(t *testing.T) {
	f := newFixture(t)
	base := func() accesstoken.MintParams {
		return accesstoken.MintParams{
			OrgID: f.orgID, UserID: f.userID, Name: "t",
			Grants: []accesstoken.GrantRequest{
				{InstanceID: f.instID, Permission: domain.TokenPermissionRead},
			},
		}
	}

	t.Run("name required", func(t *testing.T) {
		p := base()
		p.Name = ""
		if _, err := f.svc.Mint(f.ctx, p); err == nil {
			t.Error("minted a token with no name")
		}
	})

	t.Run("at least one grant", func(t *testing.T) {
		p := base()
		p.Grants = nil
		if _, err := f.svc.Mint(f.ctx, p); err == nil {
			t.Error("minted a token with no grants; it could never be used for anything")
		}
	})

	t.Run("invalid permission", func(t *testing.T) {
		p := base()
		p.Grants[0].Permission = "readonly"
		if _, err := f.svc.Mint(f.ctx, p); err == nil {
			t.Error("accepted permission 'readonly'")
		}
	})

	t.Run("expiry in the past", func(t *testing.T) {
		p := base()
		p.ExpiresAt = time.Now().Add(-time.Hour)
		if _, err := f.svc.Mint(f.ctx, p); err == nil {
			t.Error("accepted an expiry in the past")
		}
	})

	t.Run("expiry beyond max", func(t *testing.T) {
		p := base()
		p.ExpiresAt = time.Now().Add(accesstoken.MaxTTL + 24*time.Hour)
		if _, err := f.svc.Mint(f.ctx, p); err == nil {
			t.Error("accepted an expiry beyond MaxTTL; 'expiry is mandatory' " +
				"is meaningless if a caller can ask for a century")
		}
	})

	t.Run("default expiry applied", func(t *testing.T) {
		res, err := f.svc.Mint(f.ctx, base())
		if err != nil {
			t.Fatalf("Mint: %v", err)
		}
		want := time.Now().Add(accesstoken.DefaultTTL)
		if diff := res.Token.ExpiresAt.Sub(want); diff > time.Minute || diff < -time.Minute {
			t.Errorf("default expiry = %v, want ~%v", res.Token.ExpiresAt, want)
		}
	})
}

func TestRevoke_UnknownOrAlreadyRevoked(t *testing.T) {
	f := newFixture(t)

	if err := f.svc.Revoke(f.ctx, f.orgID, uuid.New()); err == nil {
		t.Error("revoking an unknown token id succeeded")
	}

	res := f.mint(t, domain.TokenPermissionRead)
	if err := f.svc.Revoke(f.ctx, f.orgID, res.Token.ID); err != nil {
		t.Fatalf("first Revoke: %v", err)
	}
	if err := f.svc.Revoke(f.ctx, f.orgID, res.Token.ID); err == nil {
		t.Error("revoking an already-revoked token reported success")
	}
}

func TestList_ScopedToOrgAndCarriesGrants(t *testing.T) {
	f := newFixture(t)
	res := f.mint(t, domain.TokenPermissionRead)

	tokens, err := f.svc.List(f.ctx, f.orgID)
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	if len(tokens) != 1 {
		t.Fatalf("got %d tokens, want 1", len(tokens))
	}
	if tokens[0].ID != res.Token.ID {
		t.Errorf("ID = %v, want %v", tokens[0].ID, res.Token.ID)
	}
	if len(tokens[0].Grants) != 1 {
		t.Errorf("got %d grants, want 1", len(tokens[0].Grants))
	}

	// Another org sees nothing.
	other, err := f.svc.List(f.ctx, uuid.New())
	if err != nil {
		t.Fatalf("List(other org): %v", err)
	}
	if len(other) != 0 {
		t.Errorf("an unrelated org saw %d tokens, want 0", len(other))
	}
}

func TestGet_ScopedToOrg(t *testing.T) {
	f := newFixture(t)
	res := f.mint(t, domain.TokenPermissionRead)

	if _, err := f.svc.Get(f.ctx, f.orgID, res.Token.ID); err != nil {
		t.Fatalf("Get: %v", err)
	}
	if _, err := f.svc.Get(f.ctx, uuid.New(), res.Token.ID); err == nil {
		t.Error("fetched a token from an org that does not own it")
	}
}

// seedForeignInstance creates a second org with its own workspace and
// instance, and makes the fixture's user a member of it. Membership is the
// point: it isolates org-scoping from the authority check, which would
// otherwise reject the grant for the wrong reason.
func (f *fixture) seedForeignInstance(t *testing.T) (orgID, instID uuid.UUID) {
	t.Helper()
	orgID, wsID, instID := uuid.New(), uuid.New(), uuid.New()
	mustExec(t, f.db, f.ctx, &domain.Org{
		ID: orgID, Name: "Other", Slug: "other-" + orgID.String()[:8]})
	mustExec(t, f.db, f.ctx, &domain.Workspace{
		ID: wsID, GithubOwner: "own-" + wsID.String()[:8], OrgID: orgID})
	mustExec(t, f.db, f.ctx, &domain.StrategyInstance{
		ID: instID, WorkspaceID: wsID, Name: "Other Inst"})
	f.org.add(orgID, f.userID)
	return orgID, instID
}

// TestRevokeIsOrgScoped: a token id is an opaque UUID carrying no evidence of
// ownership, so revocation must be scoped or one org's admin can revoke
// another org's credential by guessing or observing an id.
func TestRevokeIsOrgScoped(t *testing.T) {
	f := newFixture(t)
	res := f.mint(t, domain.TokenPermissionRead)

	otherOrg, _ := f.seedForeignInstance(t)

	err := f.svc.Revoke(f.ctx, otherOrg, res.Token.ID)
	if err == nil {
		t.Fatal("a foreign org revoked this token")
	}
	var ae *apperror.AppError
	if !errors.As(err, &ae) || ae.Code != apperror.ErrTokenNotFound.Code {
		t.Fatalf("error = %v, want ErrTokenNotFound (%d)", err, apperror.ErrTokenNotFound.Code)
	}

	// The decisive half: the token still works. An error return would be
	// cosmetic if the UPDATE had landed anyway.
	if _, err := f.svc.Resolve(f.ctx, res.Plaintext); err != nil {
		t.Fatalf("token was revoked despite the error: %v", err)
	}

	// The owning org can still revoke it, so the scoping is not simply broken.
	if err := f.svc.Revoke(f.ctx, f.orgID, res.Token.ID); err != nil {
		t.Fatalf("owning org could not revoke: %v", err)
	}
}

// TestMintRejectsGrantOutsideOrg: the token row is filed under OrgID and every
// org-scoped query trusts that column, so a grant reaching into another org
// would be invisible and unrevokable from the org that owns the data.
func TestMintRejectsGrantOutsideOrg(t *testing.T) {
	f := newFixture(t)
	_, foreignInst := f.seedForeignInstance(t)

	_, err := f.svc.Mint(f.ctx, accesstoken.MintParams{
		OrgID: f.orgID, UserID: f.userID, Name: "cross-org",
		Grants: []accesstoken.GrantRequest{
			{InstanceID: foreignInst, Permission: domain.TokenPermissionRead},
		},
	})
	if err == nil {
		t.Fatal("minted a token whose grant points outside its own org")
	}
	var ae *apperror.AppError
	if !errors.As(err, &ae) || ae.Code != apperror.ErrInstanceNotFound.Code {
		t.Fatalf("error = %v, want ErrInstanceNotFound (%d)", err, apperror.ErrInstanceNotFound.Code)
	}

	// A mixed request must fail whole, not partially commit the valid grant.
	_, err = f.svc.Mint(f.ctx, accesstoken.MintParams{
		OrgID: f.orgID, UserID: f.userID, Name: "mixed",
		Grants: []accesstoken.GrantRequest{
			{InstanceID: f.instID, Permission: domain.TokenPermissionRead},
			{InstanceID: foreignInst, Permission: domain.TokenPermissionRead},
		},
	})
	if err == nil {
		t.Fatal("minted a token with one in-org and one out-of-org grant")
	}
	toks, err := f.svc.List(f.ctx, f.orgID)
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	if len(toks) != 0 {
		t.Errorf("a rejected mint left %d token(s) behind", len(toks))
	}
}
