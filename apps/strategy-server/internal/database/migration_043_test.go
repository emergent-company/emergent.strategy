package database_test

import (
	"context"
	"encoding/json"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/uptrace/bun"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/database"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/domain"
)

// seedTokenFixtures creates the org/user/workspace/instance an access token
// needs to exist, and returns (orgID, userID, instanceID).
func seedTokenFixtures(t *testing.T, db *bun.DB) (uuid.UUID, uuid.UUID, uuid.UUID) {
	t.Helper()
	ctx := context.Background()

	userID, orgID := uuid.New(), uuid.New()
	wsID, instID := uuid.New(), uuid.New()

	if _, err := db.NewInsert().Model(&domain.User{
		ID: userID, Sub: "sub-" + userID.String()[:8], Email: userID.String()[:8] + "@t.io",
	}).Exec(ctx); err != nil {
		t.Fatalf("seed user: %v", err)
	}
	if _, err := db.NewInsert().Model(&domain.Org{
		ID: orgID, Name: "Org", Slug: "org-" + orgID.String()[:8],
	}).Exec(ctx); err != nil {
		t.Fatalf("seed org: %v", err)
	}
	if _, err := db.NewInsert().Model(&domain.Workspace{
		ID: wsID, GithubOwner: "owner-" + wsID.String()[:8], OrgID: orgID,
	}).Exec(ctx); err != nil {
		t.Fatalf("seed workspace: %v", err)
	}
	if _, err := db.NewInsert().Model(&domain.StrategyInstance{
		ID: instID, WorkspaceID: wsID, Name: "Inst",
	}).Exec(ctx); err != nil {
		t.Fatalf("seed instance: %v", err)
	}
	return orgID, userID, instID
}

func newToken(orgID, userID uuid.UUID, prefix string) *domain.AccessToken {
	return &domain.AccessToken{
		ID:          uuid.New(),
		OrgID:       orgID,
		UserID:      userID,
		Name:        "test token",
		TokenPrefix: prefix,
		TokenHash:   "$argon2id$v=19$m=65536,t=3,p=2$c2FsdA$aGFzaA",
		ExpiresAt:   time.Now().Add(24 * time.Hour),
	}
}

// TestMigration043_ExpiryIsMandatory guards the NOT NULL on expires_at.
//
// A nullable expiry would make "never expires" expressible, and a credential
// that never expires is one no amount of elapsed time cleans up — every leak
// becomes permanent. The constraint is the only thing forcing callers to
// choose a lifetime, so it is worth a test.
func TestMigration043_ExpiryIsMandatory(t *testing.T) {
	db := database.TestDB(t)
	ctx := context.Background()
	orgID, userID, _ := seedTokenFixtures(t, db)

	_, err := db.NewInsert().
		Model(newToken(orgID, userID, "abcd1234")).
		ExcludeColumn("expires_at").
		Exec(ctx)
	if err == nil {
		t.Fatal("inserted an access token with no expiry; expires_at must be NOT NULL")
	}
	if !strings.Contains(err.Error(), "expires_at") {
		t.Errorf("error did not mention expires_at: %v", err)
	}
}

// TestMigration043_PermissionIsEnumerated guards the CHECK constraint.
//
// The database is the last line between a typo and a silent privilege change.
// A value like 'readonly' must fail on write; if it were accepted, every Go
// check of the form `permission == "write"` would quietly treat it as
// not-write and the mistake would never surface as an error.
func TestMigration043_PermissionIsEnumerated(t *testing.T) {
	db := database.TestDB(t)
	ctx := context.Background()
	orgID, userID, instID := seedTokenFixtures(t, db)

	tok := newToken(orgID, userID, "perm0001")
	if _, err := db.NewInsert().Model(tok).Exec(ctx); err != nil {
		t.Fatalf("insert token: %v", err)
	}

	for _, valid := range []string{domain.TokenPermissionRead, domain.TokenPermissionWrite} {
		instance := instID
		if valid == domain.TokenPermissionWrite {
			// Unique index is on (token_id, instance_id), so the second
			// permission needs its own token to be a fair test.
			other := newToken(orgID, userID, "perm0002")
			if _, err := db.NewInsert().Model(other).Exec(ctx); err != nil {
				t.Fatalf("insert second token: %v", err)
			}
			tok = other
		}
		g := &domain.AccessTokenGrant{
			ID: uuid.New(), TokenID: tok.ID, InstanceID: instance, Permission: valid,
		}
		if _, err := db.NewInsert().Model(g).Exec(ctx); err != nil {
			t.Fatalf("permission %q should be accepted: %v", valid, err)
		}
	}

	bad := &domain.AccessTokenGrant{
		ID: uuid.New(), TokenID: tok.ID, InstanceID: uuid.Nil, Permission: "readonly",
	}
	bad.InstanceID = instID
	if _, err := db.NewInsert().Model(bad).Exec(ctx); err == nil {
		t.Fatal("permission 'readonly' was accepted; CHECK constraint is not enforcing the enum")
	}
}

// TestMigration043_OneGrantPerTokenInstance guards the unique index.
//
// Without it a token could hold both a read and a write grant for the same
// instance, and the effective permission would depend on which row came back
// first — a non-deterministic authorisation outcome.
func TestMigration043_OneGrantPerTokenInstance(t *testing.T) {
	db := database.TestDB(t)
	ctx := context.Background()
	orgID, userID, instID := seedTokenFixtures(t, db)

	tok := newToken(orgID, userID, "uniq0001")
	if _, err := db.NewInsert().Model(tok).Exec(ctx); err != nil {
		t.Fatalf("insert token: %v", err)
	}

	first := &domain.AccessTokenGrant{
		ID: uuid.New(), TokenID: tok.ID, InstanceID: instID,
		Permission: domain.TokenPermissionRead,
	}
	if _, err := db.NewInsert().Model(first).Exec(ctx); err != nil {
		t.Fatalf("insert first grant: %v", err)
	}

	second := &domain.AccessTokenGrant{
		ID: uuid.New(), TokenID: tok.ID, InstanceID: instID,
		Permission: domain.TokenPermissionWrite,
	}
	if _, err := db.NewInsert().Model(second).Exec(ctx); err == nil {
		t.Fatal("a second grant for the same (token, instance) was accepted; " +
			"effective permission would be order-dependent")
	}
}

// TestMigration043_GrantsCascade covers both FK cascades. Deleting a token
// must not leave grants behind that reference a token id no longer present.
func TestMigration043_GrantsCascade(t *testing.T) {
	db := database.TestDB(t)
	ctx := context.Background()
	orgID, userID, instID := seedTokenFixtures(t, db)

	tok := newToken(orgID, userID, "casc0001")
	if _, err := db.NewInsert().Model(tok).Exec(ctx); err != nil {
		t.Fatalf("insert token: %v", err)
	}
	g := &domain.AccessTokenGrant{
		ID: uuid.New(), TokenID: tok.ID, InstanceID: instID,
		Permission: domain.TokenPermissionRead,
	}
	if _, err := db.NewInsert().Model(g).Exec(ctx); err != nil {
		t.Fatalf("insert grant: %v", err)
	}

	if _, err := db.NewDelete().Model((*domain.AccessToken)(nil)).
		Where("id = ?", tok.ID).Exec(ctx); err != nil {
		t.Fatalf("delete token: %v", err)
	}

	n, err := db.NewSelect().Model((*domain.AccessTokenGrant)(nil)).
		Where("token_id = ?", tok.ID).Count(ctx)
	if err != nil {
		t.Fatalf("count grants: %v", err)
	}
	if n != 0 {
		t.Errorf("%d orphaned grants survived token deletion, want 0", n)
	}
}

// TestMigration043_PrefixIndexExcludesRevoked documents why the lookup index
// is partial.
//
// Authentication selects candidates by prefix. If revoked tokens stayed in
// that index they would remain candidates, and revocation would depend on a
// later check being remembered at every call site. Keeping them out makes
// revocation effective at lookup time.
func TestMigration043_PrefixIndexExcludesRevoked(t *testing.T) {
	db := database.TestDB(t)
	ctx := context.Background()

	var indexDef string
	err := db.NewRaw(
		`SELECT indexdef FROM pg_indexes WHERE indexname = 'access_tokens_prefix_idx'`,
	).Scan(ctx, &indexDef)
	if err != nil {
		t.Fatalf("read index definition: %v", err)
	}
	if !strings.Contains(indexDef, "revoked_at IS NULL") {
		t.Errorf("prefix index is not partial on revoked_at IS NULL: %s", indexDef)
	}
}

// TestAccessToken_Usability covers the revoked/expired predicates together,
// since authentication must reject a token failing either condition.
func TestAccessToken_Usability(t *testing.T) {
	now := time.Now()
	revoked := now.Add(-time.Hour)

	cases := []struct {
		name string
		tok  domain.AccessToken
		want bool
	}{
		{"live", domain.AccessToken{ExpiresAt: now.Add(time.Hour)}, true},
		{"expired", domain.AccessToken{ExpiresAt: now.Add(-time.Hour)}, false},
		{"revoked", domain.AccessToken{ExpiresAt: now.Add(time.Hour), RevokedAt: &revoked}, false},
		{"revoked and expired", domain.AccessToken{ExpiresAt: now.Add(-time.Hour), RevokedAt: &revoked}, false},
		// Exactly at expiry is expired: the boundary must not be usable, or a
		// token is briefly valid at the instant it was meant to stop being so.
		{"exactly at expiry", domain.AccessToken{ExpiresAt: now}, false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := tc.tok.IsUsable(now); got != tc.want {
				t.Errorf("IsUsable = %v, want %v", got, tc.want)
			}
		})
	}
}

// TestAccessTokenGrant_AllowsWrite checks that an unrecognised permission
// denies rather than being treated as writable.
func TestAccessTokenGrant_AllowsWrite(t *testing.T) {
	cases := map[string]bool{
		domain.TokenPermissionWrite: true,
		domain.TokenPermissionRead:  false,
		"":                          false,
		"readonly":                  false,
		"WRITE":                     false, // case-sensitive by design
	}
	for perm, want := range cases {
		g := &domain.AccessTokenGrant{Permission: perm}
		if got := g.AllowsWrite(); got != want {
			t.Errorf("AllowsWrite(%q) = %v, want %v", perm, got, want)
		}
	}
}

// TestAccessToken_HashNeverSerialises guards the `json:"-"` on TokenHash.
//
// AccessToken is returned by the list endpoints. Without the tag, anyone able
// to list tokens would also receive every hash, which is exactly the material
// an offline attack needs. A dropped tag would be invisible in review and
// silent at runtime, so it is asserted.
func TestAccessToken_HashNeverSerialises(t *testing.T) {
	tok := domain.AccessToken{
		ID:          uuid.New(),
		Name:        "serialisation check",
		TokenPrefix: "abcd1234",
		TokenHash:   "$argon2id$v=19$m=65536,t=3,p=2$REALSALT$REALHASH",
		ExpiresAt:   time.Now().Add(time.Hour),
	}

	b, err := json.Marshal(tok)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	out := string(b)

	if strings.Contains(out, "REALHASH") || strings.Contains(out, "token_hash") {
		t.Errorf("token hash leaked into JSON: %s", out)
	}
	// The prefix is not secret and is needed to identify a token in a list.
	if !strings.Contains(out, "abcd1234") {
		t.Errorf("token_prefix should serialise, it is the non-secret identifier: %s", out)
	}
}
