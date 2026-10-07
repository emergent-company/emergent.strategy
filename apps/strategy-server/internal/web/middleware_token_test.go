package web

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/accesstoken"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/audit"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/domain"
)

// fakeResolver is a TokenResolver that answers from a fixed map.
type fakeResolver struct {
	byToken map[string]*accesstoken.Resolved
	calls   int
}

func (f *fakeResolver) Resolve(_ context.Context, plaintext string) (*accesstoken.Resolved, error) {
	f.calls++
	if r, ok := f.byToken[plaintext]; ok {
		return r, nil
	}
	return nil, errors.New("invalid token")
}

// captured records what the downstream handler saw.
type captured struct {
	ran       bool
	principal *Principal
	actor     *uuid.UUID
	tokenID   *uuid.UUID
	source    audit.Source
}

// runRequest sends one request through AuthMiddleware and reports what
// reached the handler.
func runRequest(t *testing.T, mw echo.MiddlewareFunc, authHeader string) (*httptest.ResponseRecorder, *captured) {
	t.Helper()
	e := echo.New()
	req := httptest.NewRequest(http.MethodPost, "/mcp", nil)
	if authHeader != "" {
		req.Header.Set("Authorization", authHeader)
	}
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)

	got := &captured{}
	h := mw(func(c echo.Context) error {
		ctx := c.Request().Context()
		got.ran = true
		got.principal = PrincipalFromContext(ctx)
		got.actor = audit.ActorFromContext(ctx)
		got.tokenID = audit.TokenFromContext(ctx)
		got.source = audit.SourceFromContext(ctx)
		return c.String(http.StatusOK, "ok")
	})

	if err := h(c); err != nil {
		// Echo returns errors rather than writing them in this harness.
		var he *echo.HTTPError
		if errors.As(err, &he) {
			rec.Code = he.Code
		} else {
			t.Fatalf("unexpected non-HTTP error: %v", err)
		}
	}
	return rec, got
}

func TestAuthMiddleware_AccessTokenAuthenticates(t *testing.T) {
	userID, tokenID, instID := uuid.New(), uuid.New(), uuid.New()
	plaintext := accesstoken.Prefix + "validtokenvalue123456"

	resolver := &fakeResolver{byToken: map[string]*accesstoken.Resolved{
		plaintext: {
			TokenID: tokenID,
			UserID:  userID,
			OrgID:   uuid.New(),
			Grants: []domain.AccessTokenGrant{
				{InstanceID: instID, Permission: domain.TokenPermissionRead},
			},
		},
	}}

	// introspector is nil: a valid est_ token must never need it.
	mw := AuthMiddleware(true, nil, nil, resolver)
	rec, got := runRequest(t, mw, "Bearer "+plaintext)

	if !got.ran {
		t.Fatalf("handler did not run; status %d", rec.Code)
	}
	if got.principal == nil {
		t.Fatal("no principal reached the handler")
	}
	if got.principal.User.ID != userID {
		t.Errorf("user ID = %v, want %v", got.principal.User.ID, userID)
	}
	if got.principal.TokenID == nil || *got.principal.TokenID != tokenID {
		t.Errorf("principal TokenID = %v, want %v", got.principal.TokenID, tokenID)
	}
	if !got.principal.Scoped() {
		t.Error("a token principal must be scoped, or grants will not narrow anything")
	}
	if !got.principal.ReadOnly {
		t.Error("a token whose only grant is read must be ReadOnly")
	}

	// Audit trail: actor is the owner, plus which credential was used.
	if got.actor == nil || *got.actor != userID {
		t.Errorf("audit actor = %v, want %v", got.actor, userID)
	}
	if got.tokenID == nil || *got.tokenID != tokenID {
		t.Errorf("audit token id = %v, want %v — without it, a leaked token's "+
			"activity is indistinguishable from its owner's own work",
			got.tokenID, tokenID)
	}
	if got.source != audit.SourceMCPToken {
		t.Errorf("audit source = %q, want %q", got.source, audit.SourceMCPToken)
	}
}

// TestAuthMiddleware_WriteGrantIsNotReadOnly is the counterpart: ReadOnly must
// be derived from the grants, not hard-coded.
func TestAuthMiddleware_WriteGrantIsNotReadOnly(t *testing.T) {
	plaintext := accesstoken.Prefix + "writetokenvalue123456"
	resolver := &fakeResolver{byToken: map[string]*accesstoken.Resolved{
		plaintext: {
			TokenID: uuid.New(), UserID: uuid.New(), OrgID: uuid.New(),
			Grants: []domain.AccessTokenGrant{
				{InstanceID: uuid.New(), Permission: domain.TokenPermissionRead},
				{InstanceID: uuid.New(), Permission: domain.TokenPermissionWrite},
			},
		},
	}}

	_, got := runRequest(t, AuthMiddleware(true, nil, nil, resolver), "Bearer "+plaintext)
	if got.principal == nil {
		t.Fatal("no principal")
	}
	if got.principal.ReadOnly {
		t.Error("a token holding a write grant must not be ReadOnly")
	}
	if len(got.principal.Grants) != 2 {
		t.Errorf("got %d grants, want 2", len(got.principal.Grants))
	}
}

func TestAuthMiddleware_InvalidAccessToken401s(t *testing.T) {
	resolver := &fakeResolver{byToken: map[string]*accesstoken.Resolved{}}

	cases := map[string]string{
		"unknown token": accesstoken.Prefix + "doesnotexist1234567890",
		"empty secret":  accesstoken.Prefix,
	}
	for name, tok := range cases {
		t.Run(name, func(t *testing.T) {
			rec, got := runRequest(t, AuthMiddleware(true, nil, nil, resolver), "Bearer "+tok)
			if got.ran {
				t.Error("handler ran for an invalid token")
			}
			if rec.Code != http.StatusUnauthorized {
				t.Errorf("status = %d, want 401", rec.Code)
			}
		})
	}
}

// TestAuthMiddleware_TokenNeverReachesIntrospector is the important isolation
// property: our own credential must not be sent to Zitadel.
//
// A nil introspector would panic on use, so the test passing proves the est_
// branch short-circuits before introspection. The resolver call count
// confirms the token went down the local path instead.
func TestAuthMiddleware_TokenNeverReachesIntrospector(t *testing.T) {
	plaintext := accesstoken.Prefix + "secretvalue1234567890"
	resolver := &fakeResolver{byToken: map[string]*accesstoken.Resolved{
		plaintext: {
			TokenID: uuid.New(), UserID: uuid.New(), OrgID: uuid.New(),
			Grants: []domain.AccessTokenGrant{
				{InstanceID: uuid.New(), Permission: domain.TokenPermissionRead},
			},
		},
	}}

	_, got := runRequest(t, AuthMiddleware(true, nil, nil, resolver), "Bearer "+plaintext)
	if !got.ran {
		t.Fatal("handler did not run")
	}
	if resolver.calls != 1 {
		t.Errorf("resolver called %d times, want 1", resolver.calls)
	}
}

// TestAuthMiddleware_NoResolverDenies covers the misconfiguration case. An
// unwired resolver must not fall through to the Zitadel path, which would
// send our credential to a third party.
func TestAuthMiddleware_NoResolverDenies(t *testing.T) {
	rec, got := runRequest(t,
		AuthMiddleware(true, nil, nil, nil),
		"Bearer "+accesstoken.Prefix+"anything1234567890ab")

	if got.ran {
		t.Error("handler ran with no resolver configured")
	}
	if rec.Code != http.StatusUnauthorized {
		t.Errorf("status = %d, want 401", rec.Code)
	}
}

// TestAuthMiddleware_NonTokenBearerUsesZitadelPath proves the prefix check
// routes rather than hijacks. A non-est_ token with a nil introspector must
// 401 via the introspection path, not be treated as an access token.
func TestAuthMiddleware_NonTokenBearerUsesZitadelPath(t *testing.T) {
	resolver := &fakeResolver{byToken: map[string]*accesstoken.Resolved{}}

	rec, got := runRequest(t,
		AuthMiddleware(true, nil, nil, resolver),
		"Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.fake.jwt")

	if got.ran {
		t.Error("handler ran for an unintrospectable token")
	}
	if rec.Code != http.StatusUnauthorized {
		t.Errorf("status = %d, want 401", rec.Code)
	}
	if resolver.calls != 0 {
		t.Errorf("resolver was called %d times for a non-est_ token; the prefix "+
			"check is matching too broadly", resolver.calls)
	}
}

func TestAuthMiddleware_MissingOrMalformedHeader401s(t *testing.T) {
	resolver := &fakeResolver{byToken: map[string]*accesstoken.Resolved{}}
	mw := AuthMiddleware(true, nil, nil, resolver)

	for name, header := range map[string]string{
		"absent":     "",
		"not bearer": "Basic dXNlcjpwYXNz",
		"bare token": accesstoken.Prefix + "notprefixedwithbearer",
	} {
		t.Run(name, func(t *testing.T) {
			rec, got := runRequest(t, mw, header)
			if got.ran {
				t.Error("handler ran without a valid Authorization header")
			}
			if rec.Code != http.StatusUnauthorized {
				t.Errorf("status = %d, want 401", rec.Code)
			}
		})
	}
}

// TestAuthMiddleware_DevModeStillInjectsPrincipal guards the dev path against
// regression from the token work. Authorisation fails closed, so losing this
// injection would deny every request in dev.
func TestAuthMiddleware_DevModeStillInjectsPrincipal(t *testing.T) {
	_, got := runRequest(t, AuthMiddleware(false, nil, nil, nil), "")

	if !got.ran {
		t.Fatal("handler did not run in dev mode")
	}
	if got.principal == nil || got.principal.User == nil {
		t.Fatal("dev mode did not inject a principal")
	}
	if got.principal.User.ID != DevUser.ID {
		t.Errorf("dev principal user = %v, want %v", got.principal.User.ID, DevUser.ID)
	}
	if got.principal.Scoped() {
		t.Error("the dev principal must be unscoped")
	}
	if got.principal.ReadOnly {
		t.Error("the dev principal must not be read-only")
	}
}

// TestAuthMiddleware_HealthAndDiscoveryBypassAuth confirms the public routes
// still skip auth after the token branch was added.
func TestAuthMiddleware_HealthAndDiscoveryBypassAuth(t *testing.T) {
	mw := AuthMiddleware(true, nil, nil, nil)

	for _, path := range []string{
		"/health",
		"/.well-known/strategy-server-selfmodel.json",
		"/.well-known/strategy-server-agents.json",
	} {
		t.Run(path, func(t *testing.T) {
			e := echo.New()
			req := httptest.NewRequest(http.MethodGet, path, nil)
			rec := httptest.NewRecorder()
			c := e.NewContext(req, rec)

			ran := false
			h := mw(func(c echo.Context) error {
				ran = true
				return c.String(http.StatusOK, "ok")
			})
			if err := h(c); err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if !ran {
				t.Error("public route was blocked by auth")
			}
		})
	}
}
