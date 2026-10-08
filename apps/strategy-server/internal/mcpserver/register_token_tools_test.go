package mcpserver_test

import (
	"context"
	"encoding/json"
	"strings"
	"testing"

	"github.com/google/uuid"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/accesstoken"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/org"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/domain"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/mcpserver"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/web"
)

// buildTokenSvc returns services with the access-token service wired, plus a
// seeded instance and the org that owns it.
//
// seedInstance already grants web.DevUser the org_admin role, which is what
// the token tools require.
func buildTokenSvc(t *testing.T) (svc mcpserver.Services, orgID, instID uuid.UUID) {
	t.Helper()
	svc = buildSvc(t)
	db := svc.Strategy.DB()
	svc.AccessToken = accesstoken.NewService(db, org.NewService(db))

	wsID, instID := seedInstance(t, svc, "tok-"+uuid.New().String()[:8], map[string]any{
		"north_star": map[string]any{"vision": "v"},
	})

	// seedInstance returns the workspace, not the org that owns it.
	if err := db.NewSelect().TableExpr("workspaces").Column("org_id").
		Where("id = ?", wsID).Scan(context.Background(), &orgID); err != nil {
		t.Fatalf("resolve org for workspace: %v", err)
	}
	return svc, orgID, instID
}

func grantsJSON(t *testing.T, instID uuid.UUID, perm string) string {
	t.Helper()
	b, err := json.Marshal([]map[string]string{
		{"instance_id": instID.String(), "permission": perm},
	})
	if err != nil {
		t.Fatalf("marshal grants: %v", err)
	}
	return string(b)
}

// TestMintAccessToken_HappyPath also pins the contract that matters most: the
// plaintext is returned, and it actually authenticates.
func TestMintAccessToken_HappyPath(t *testing.T) {
	svc, orgID, instID := buildTokenSvc(t)
	c := newMCPClient(t, svc)
	c.activateAllTools()

	var out struct {
		ID        string `json:"id"`
		Name      string `json:"name"`
		Token     string `json:"token"`
		Warning   string `json:"warning"`
		ExpiresAt string `json:"expires_at"`
		Grants    []struct {
			InstanceID string `json:"instance_id"`
			Permission string `json:"permission"`
		} `json:"grants"`
	}
	c.call(1, "mint_access_token", map[string]any{
		"org_id": orgID.String(),
		"name":   "Acme read-only",
		"grants": grantsJSON(t, instID, "read"),
	}).assertOK().decode(&out)

	if out.Token == "" {
		t.Fatal("no plaintext returned; the token would be unusable")
	}
	if !strings.HasPrefix(out.Token, "est_") {
		t.Errorf("token %q lacks the est_ prefix the middleware routes on", out.Token)
	}
	if out.Warning == "" {
		t.Error("no warning that the plaintext is unrecoverable")
	}
	if len(out.Grants) != 1 || out.Grants[0].Permission != "read" {
		t.Errorf("grants = %+v, want one read grant", out.Grants)
	}

	// The decisive assertion: the returned string is a working credential.
	res, err := svc.AccessToken.Resolve(context.Background(), out.Token)
	if err != nil {
		t.Fatalf("the minted token does not authenticate: %v", err)
	}
	if len(res.Grants) != 1 || res.Grants[0].InstanceID != instID {
		t.Errorf("resolved grants = %+v, want one grant for %s", res.Grants, instID)
	}
}

// TestMintAccessToken_PlaintextNotStored guards the central property of the
// scheme: the server keeps a hash, not the credential.
func TestMintAccessToken_PlaintextNotStored(t *testing.T) {
	svc, orgID, instID := buildTokenSvc(t)
	c := newMCPClient(t, svc)
	c.activateAllTools()

	var out struct {
		ID    string `json:"id"`
		Token string `json:"token"`
	}
	c.call(1, "mint_access_token", map[string]any{
		"org_id": orgID.String(),
		"name":   "t",
		"grants": grantsJSON(t, instID, "read"),
	}).assertOK().decode(&out)

	var hash string
	if err := svc.Strategy.DB().NewSelect().TableExpr("access_tokens").
		Column("token_hash").Where("id = ?", out.ID).
		Scan(context.Background(), &hash); err != nil {
		t.Fatalf("read stored hash: %v", err)
	}
	if strings.Contains(hash, out.Token) {
		t.Fatal("the stored hash contains the plaintext token")
	}
	if !strings.HasPrefix(hash, "$argon2id$") {
		t.Errorf("stored value %q is not an argon2id PHC string", hash)
	}
}

// TestListAccessTokens_NeverLeaksSecrets is the test that matters for 7.3.
//
// It asserts on the raw response text rather than a decoded struct: a decode
// would only inspect fields we remembered to declare, which is precisely the
// mistake that would let a hash through.
func TestListAccessTokens_NeverLeaksSecrets(t *testing.T) {
	svc, orgID, instID := buildTokenSvc(t)
	c := newMCPClient(t, svc)
	c.activateAllTools()

	var minted struct {
		Token string `json:"token"`
	}
	c.call(1, "mint_access_token", map[string]any{
		"org_id": orgID.String(),
		"name":   "listed",
		"grants": grantsJSON(t, instID, "read"),
	}).assertOK().decode(&minted)

	var hash string
	if err := svc.Strategy.DB().NewSelect().TableExpr("access_tokens").
		Column("token_hash").Where("org_id = ?", orgID).
		Scan(context.Background(), &hash); err != nil {
		t.Fatalf("read stored hash: %v", err)
	}

	body := c.call(2, "list_access_tokens", map[string]any{
		"org_id": orgID.String(),
	}).assertOK().text

	if strings.Contains(body, minted.Token) {
		t.Error("list_access_tokens returned the token plaintext")
	}
	if strings.Contains(body, hash) {
		t.Error("list_access_tokens returned the token hash")
	}
	if strings.Contains(body, "token_hash") {
		t.Error("list_access_tokens exposed a token_hash field")
	}
	// It must still be useful: the prefix lets a human match a row to a
	// credential they hold.
	if !strings.Contains(body, "token_prefix") {
		t.Error("list_access_tokens omitted token_prefix, so rows cannot be identified")
	}
	if !strings.Contains(body, "listed") {
		t.Error("list_access_tokens did not return the token that was just minted")
	}
}

// TestListAccessTokens_InactiveFiltering: a revoked token must not vanish
// entirely, or an audit cannot answer "what was revoked, and when".
func TestListAccessTokens_InactiveFiltering(t *testing.T) {
	svc, orgID, instID := buildTokenSvc(t)
	c := newMCPClient(t, svc)
	c.activateAllTools()

	var minted struct {
		ID string `json:"id"`
	}
	c.call(1, "mint_access_token", map[string]any{
		"org_id": orgID.String(), "name": "doomed",
		"grants": grantsJSON(t, instID, "read"),
	}).assertOK().decode(&minted)

	c.call(2, "revoke_access_token", map[string]any{
		"org_id": orgID.String(), "token_id": minted.ID,
	}).assertOK()

	if body := c.call(3, "list_access_tokens", map[string]any{
		"org_id": orgID.String(),
	}).assertOK().text; strings.Contains(body, "doomed") {
		t.Error("a revoked token appears in the default listing")
	}

	body := c.call(4, "list_access_tokens", map[string]any{
		"org_id": orgID.String(), "include_inactive": true,
	}).assertOK().text
	if !strings.Contains(body, "doomed") {
		t.Error("include_inactive did not surface the revoked token")
	}
	if !strings.Contains(body, "revoked") {
		t.Error("the revoked token is not marked with its status")
	}
}

// TestRevokeAccessToken_EndsAccess: the response saying "revoked" is worth
// nothing unless the credential actually stops working.
func TestRevokeAccessToken_EndsAccess(t *testing.T) {
	svc, orgID, instID := buildTokenSvc(t)
	c := newMCPClient(t, svc)
	c.activateAllTools()

	var out struct {
		ID    string `json:"id"`
		Token string `json:"token"`
	}
	c.call(1, "mint_access_token", map[string]any{
		"org_id": orgID.String(), "name": "temp",
		"grants": grantsJSON(t, instID, "read"),
	}).assertOK().decode(&out)

	if _, err := svc.AccessToken.Resolve(context.Background(), out.Token); err != nil {
		t.Fatalf("token did not work before revocation: %v", err)
	}

	c.call(2, "revoke_access_token", map[string]any{
		"org_id": orgID.String(), "token_id": out.ID,
	}).assertOK()

	if _, err := svc.AccessToken.Resolve(context.Background(), out.Token); err == nil {
		t.Fatal("the token still authenticates after revocation")
	}

	// Revoking twice reports not-found rather than silently succeeding.
	c.call(3, "revoke_access_token", map[string]any{
		"org_id": orgID.String(), "token_id": out.ID,
	}).assertError()
}

// TestTokenTools_RequireOrgAdmin — a plain member must not administer
// credentials for the whole org.
func TestTokenTools_RequireOrgAdmin(t *testing.T) {
	svc, orgID, instID := buildTokenSvc(t)
	ctx := context.Background()

	// Demote the dev user from admin to viewer.
	if _, err := svc.Strategy.DB().NewUpdate().TableExpr("org_memberships").
		Set("role = ?", "org_viewer").
		Where("org_id = ? AND user_id = ?", orgID, web.DevUser.ID).
		Exec(ctx); err != nil {
		t.Fatalf("demote dev user: %v", err)
	}

	c := newMCPClient(t, svc)
	c.activateAllTools()

	for i, tc := range []struct {
		tool string
		args map[string]any
	}{
		{"mint_access_token", map[string]any{
			"org_id": orgID.String(), "name": "nope",
			"grants": grantsJSON(t, instID, "read")}},
		{"list_access_tokens", map[string]any{"org_id": orgID.String()}},
		{"revoke_access_token", map[string]any{
			"org_id": orgID.String(), "token_id": uuid.New().String()}},
	} {
		t.Run(tc.tool, func(t *testing.T) {
			r := c.call(10+i, tc.tool, tc.args).assertError()
			if !strings.Contains(r.text, "org_admin") {
				t.Errorf("denial does not name the missing role: %s", r.text)
			}
		})
	}
}

// TestTokenTools_DeniedToTokenAuthenticatedCallers is task 7.5, and the most
// important test in this file.
//
// If a token could mint tokens, a leaked read-only token would be a route to
// a write token, and every scope restriction would be advisory. The write
// gate already blocks mint and revoke, so this uses a *write*-scoped token —
// which passes the gate — to prove the denial comes from the authorisation
// check and not from the read-only class.
func TestTokenTools_DeniedToTokenAuthenticatedCallers(t *testing.T) {
	svc, orgID, instID := buildTokenSvc(t)

	p := tokenPrincipal(instID, web.PermissionWrite)
	if p.ReadOnly {
		t.Fatal("this test needs a non-read-only principal to bypass the write gate")
	}

	c := newMCPClientAs(t, svc, p)
	c.activateAllTools()

	for i, tc := range []struct {
		tool string
		args map[string]any
	}{
		{"mint_access_token", map[string]any{
			"org_id": orgID.String(), "name": "escalation",
			"grants": grantsJSON(t, instID, "write")}},
		{"list_access_tokens", map[string]any{"org_id": orgID.String()}},
		{"revoke_access_token", map[string]any{
			"org_id": orgID.String(), "token_id": uuid.New().String()}},
	} {
		t.Run(tc.tool, func(t *testing.T) {
			r := c.call(20+i, tc.tool, tc.args).assertError()
			if !strings.Contains(r.text, "access tokens cannot manage access tokens") {
				t.Errorf("denied for the wrong reason: %s", r.text)
			}
		})
	}

	// No token was created by any of the above.
	var n int
	if err := svc.Strategy.DB().NewSelect().TableExpr("access_tokens").
		ColumnExpr("count(*)").Where("org_id = ?", orgID).
		Scan(context.Background(), &n); err != nil {
		t.Fatalf("count tokens: %v", err)
	}
	if n != 0 {
		t.Errorf("a token-authenticated caller created %d token(s)", n)
	}
}

// TestTokenTools_CrossOrgDenied: org membership, not the org_id argument,
// decides what the caller can see.
func TestTokenTools_CrossOrgDenied(t *testing.T) {
	svc, _, instID := buildTokenSvc(t)
	ctx := context.Background()

	foreignOrg := seedOrgWithoutDevMembership(t, svc.Strategy.DB(), ctx)

	c := newMCPClient(t, svc)
	c.activateAllTools()

	c.call(1, "list_access_tokens", map[string]any{
		"org_id": foreignOrg.String(),
	}).assertError()

	c.call(2, "mint_access_token", map[string]any{
		"org_id": foreignOrg.String(), "name": "cross",
		"grants": grantsJSON(t, instID, "read"),
	}).assertError()
}

// TestMintAccessToken_GrantValidation covers the argument parsing, where a
// quietly-wrong default would be a security bug rather than a usability one.
func TestMintAccessToken_GrantValidation(t *testing.T) {
	svc, orgID, instID := buildTokenSvc(t)
	c := newMCPClient(t, svc)
	c.activateAllTools()

	bad := []struct {
		name   string
		grants string
		expect string
	}{
		{"not json", "instance-1:read", "JSON array"},
		{"empty array", "[]", "at least one grant"},
		{"bad uuid", `[{"instance_id":"nope","permission":"read"}]`, "invalid instance_id"},
		{"bad permission", `[{"instance_id":"` + instID.String() + `","permission":"admin"}]`, "read' or 'write'"},
	}
	for i, tc := range bad {
		t.Run(tc.name, func(t *testing.T) {
			r := c.call(30+i, "mint_access_token", map[string]any{
				"org_id": orgID.String(), "name": "x", "grants": tc.grants,
			}).assertError()
			if !strings.Contains(r.text, tc.expect) {
				t.Errorf("error %q does not mention %q", r.text, tc.expect)
			}
		})
	}

	// An omitted permission defaults to read, never write. The default must
	// fall on the safe side of the one distinction this subsystem exists for.
	var out struct {
		Grants []struct {
			Permission string `json:"permission"`
		} `json:"grants"`
	}
	c.call(40, "mint_access_token", map[string]any{
		"org_id": orgID.String(), "name": "defaulted",
		"grants": `[{"instance_id":"` + instID.String() + `"}]`,
	}).assertOK().decode(&out)
	if len(out.Grants) != 1 || out.Grants[0].Permission != domain.TokenPermissionRead {
		t.Errorf("omitted permission produced %+v, want read", out.Grants)
	}
}

// TestMintAccessToken_ExpiryBounds: expiry is the main limit on a leaked
// token's usefulness, so an unbounded one must not be reachable.
func TestMintAccessToken_ExpiryBounds(t *testing.T) {
	svc, orgID, instID := buildTokenSvc(t)
	c := newMCPClient(t, svc)
	c.activateAllTools()

	r := c.call(1, "mint_access_token", map[string]any{
		"org_id": orgID.String(), "name": "forever",
		"grants":     grantsJSON(t, instID, "read"),
		"expires_at": "2099-01-01T00:00:00Z",
	}).assertError()
	if !strings.Contains(r.text, "maximum lifetime") {
		t.Errorf("error %q does not explain the cap", r.text)
	}

	c.call(2, "mint_access_token", map[string]any{
		"org_id": orgID.String(), "name": "past",
		"grants":     grantsJSON(t, instID, "read"),
		"expires_at": "2020-01-01T00:00:00Z",
	}).assertError()

	c.call(3, "mint_access_token", map[string]any{
		"org_id": orgID.String(), "name": "malformed",
		"grants":     grantsJSON(t, instID, "read"),
		"expires_at": "next tuesday",
	}).assertError()
}
