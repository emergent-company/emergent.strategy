// Package web provides HTTP middleware and route registration for strategy-server.
package web

import (
	"context"
	"log/slog"
	"strings"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/accesstoken"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/audit"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/auth"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/langs"
)

// User represents the authenticated caller on a request.
type User struct {
	ID    uuid.UUID
	Sub   string
	Email string
	Name  string
}

type userKey struct{}

// InstanceGrant binds a credential to one strategy instance with a permission.
type InstanceGrant struct {
	InstanceID uuid.UUID
	Permission string // PermissionRead | PermissionWrite
}

// Permission values for an InstanceGrant.
const (
	PermissionRead  = "read"
	PermissionWrite = "write"
)

// Principal is the authenticated caller together with what it may do.
//
// Identity alone is no longer sufficient to answer an authorisation question.
// With two credential types — interactive Zitadel sessions and long-lived
// access tokens — authority is a property of the *credential*, not only of the
// user: the same person may hold a read-only token scoped to one instance and
// a full session. Handlers must therefore ask "may this caller write to this
// instance?" rather than "who is this?", which only a type carrying capability
// can answer.
//
// Grants semantics:
//   - nil/empty Grants means "no narrowing" — fall back to org membership.
//     This is the interactive-session case.
//   - Non-empty Grants means the credential is restricted to exactly those
//     instances. Grants narrow authority and never widen it, so an org_admin
//     using a read-scoped token is still read-only.
type Principal struct {
	User     *User
	TokenID  *uuid.UUID // nil for interactive sessions
	Grants   []InstanceGrant
	ReadOnly bool
}

// GrantFor returns the grant for the given instance and whether one exists.
func (p *Principal) GrantFor(instanceID uuid.UUID) (InstanceGrant, bool) {
	for _, g := range p.Grants {
		if g.InstanceID == instanceID {
			return g, true
		}
	}
	return InstanceGrant{}, false
}

// Scoped reports whether this principal's authority is narrowed by grants.
func (p *Principal) Scoped() bool { return len(p.Grants) > 0 }

// PrincipalFromContext returns the authenticated principal, or nil.
func PrincipalFromContext(ctx context.Context) *Principal {
	p, _ := ctx.Value(userKey{}).(*Principal)
	return p
}

// ContextWithPrincipal returns a context carrying the given Principal.
func ContextWithPrincipal(ctx context.Context, p *Principal) context.Context {
	return context.WithValue(ctx, userKey{}, p)
}

// UserFromContext returns the authenticated user from ctx, or nil if not authenticated.
//
// Retained so the existing call sites keep working unchanged; it is the
// identity half of PrincipalFromContext.
func UserFromContext(ctx context.Context) *User {
	p := PrincipalFromContext(ctx)
	if p == nil {
		return nil
	}
	return p.User
}

// ContextWithUser returns a context carrying the given User as an unscoped,
// full-capability Principal. Use ContextWithPrincipal when the credential
// carries grants.
func ContextWithUser(ctx context.Context, u *User) context.Context {
	if u == nil {
		return ContextWithPrincipal(ctx, nil)
	}
	return ContextWithPrincipal(ctx, &Principal{User: u})
}

// DevUser is the user injected in dev mode (auth disabled).
var DevUser = &User{
	ID:    uuid.MustParse("00000000-0000-0000-0000-000000000001"),
	Sub:   "dev",
	Email: "dev@strategy.local",
	Name:  "Dev User",
}

// DevPrincipal is the principal injected in dev mode (auth disabled).
//
// Dev mode is deliberately an *explicit, present* principal with wide
// authority rather than an absent one: authorisation fails closed, and
// "nobody is here" must mean deny. Its authority still comes from real org
// membership (seeded at startup by EnsureDevMembershipForAllOrgs), not from
// bypassing the check.
var DevPrincipal = &Principal{User: DevUser}

// EnsureUserFunc is called after successful token introspection to
// create or update the user record in the database. Set by cmd_serve.go.
type EnsureUserFunc func(ctx context.Context, sub, email, name string) (uuid.UUID, error)

// TokenResolver authenticates a long-lived access token.
//
// Declared as a narrow interface here rather than importing the concrete
// service: middleware needs one method, and depending on the whole service
// would drag a database into every middleware test.
type TokenResolver interface {
	Resolve(ctx context.Context, plaintext string) (*accesstoken.Resolved, error)
}

// authenticateAccessToken resolves an est_ token and continues the chain with
// a scoped Principal.
//
// Any resolution failure is a flat 401 with no detail. The service already
// collapses unknown/expired/revoked into one error so the response cannot be
// used to probe which tokens exist; this preserves that at the HTTP layer.
func authenticateAccessToken(c echo.Context, resolver TokenResolver, next echo.HandlerFunc, token string) error {
	if resolver == nil {
		// Token presented but the feature is not wired. Deny — treating an
		// unconfigured resolver as "no opinion" and falling through to the
		// IdP path would send our credential to Zitadel.
		slog.ErrorContext(c.Request().Context(),
			"access token presented but no resolver is configured; denying")
		return echo.ErrUnauthorized
	}

	resolved, err := resolver.Resolve(c.Request().Context(), token)
	if err != nil {
		return echo.ErrUnauthorized
	}

	grants := make([]InstanceGrant, 0, len(resolved.Grants))
	writable := false
	for _, g := range resolved.Grants {
		grants = append(grants, InstanceGrant{
			InstanceID: g.InstanceID,
			Permission: g.Permission,
		})
		if g.AllowsWrite() {
			writable = true
		}
	}

	principal := &Principal{
		User:    &User{ID: resolved.UserID},
		TokenID: &resolved.TokenID,
		Grants:  grants,
		// ReadOnly is true unless *some* grant permits writing. The
		// per-instance grant still governs each individual call; this flag
		// is the cheap short-circuit for the write gate, so it must not be
		// set merely because the owner is an org admin.
		ReadOnly: !writable,
	}

	ctx := ContextWithPrincipal(c.Request().Context(), principal)
	ctx = audit.ContextWithActor(ctx, resolved.UserID)
	ctx = audit.ContextWithToken(ctx, resolved.TokenID)
	// Overrides the source set by AuditMiddleware, which cannot know how the
	// request authenticated.
	ctx = audit.ContextWithSource(ctx, audit.SourceMCPToken)
	c.SetRequest(c.Request().WithContext(ctx))
	return next(c)
}

// AuthMiddleware returns an Echo middleware that enforces authentication.
//
// When authEnabled is false (development), requests pass through with DevPrincipal
// injected. When authEnabled is true, the Bearer token is routed by its prefix:
// tokens starting with est_ are our own long-lived access tokens and are resolved
// locally; everything else is introspected via Zitadel. Unauthenticated requests
// get 401.
func AuthMiddleware(authEnabled bool, introspector *auth.Introspector, ensureUser EnsureUserFunc, resolver TokenResolver) echo.MiddlewareFunc {
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			// Skip auth for health check and the public self-model
			// discovery endpoint — a discovery route must be reachable
			// before any auth handshake, matching 21st-bot's own
			// /.well-known/21st-app.json precedent.
			switch c.Request().URL.Path {
			case "/health", "/.well-known/strategy-server-selfmodel.json", "/.well-known/strategy-server-agents.json":
				return next(c)
			}

			if !authEnabled {
				// Dev pass-through: inject a stable dev principal so handlers
				// always have one. Authorisation fails closed on a missing
				// principal, so this injection is what keeps dev mode working
				// — it is not cosmetic.
				ctx := ContextWithPrincipal(c.Request().Context(), DevPrincipal)
				ctx = audit.ContextWithActor(ctx, DevUser.ID)
				c.SetRequest(c.Request().WithContext(ctx))
				return next(c)
			}

			// Extract bearer token.
			authHeader := c.Request().Header.Get("Authorization")
			if !strings.HasPrefix(authHeader, "Bearer ") {
				return echo.ErrUnauthorized
			}
			token := strings.TrimPrefix(authHeader, "Bearer ")

			// Access tokens are ours, not Zitadel's. This branch must come
			// before introspection: sending one of our tokens to the IdP
			// would disclose a live credential to a third party and return
			// "inactive" regardless.
			if strings.HasPrefix(token, accesstoken.Prefix) {
				return authenticateAccessToken(c, resolver, next, token)
			}

			if introspector == nil {
				return echo.ErrUnauthorized
			}

			// Introspect the token.
			result, err := introspector.Introspect(c.Request().Context(), token)
			if err != nil || !result.Active {
				return echo.ErrUnauthorized
			}

			// Ensure user record exists.
			var userID uuid.UUID
			if ensureUser != nil {
				uid, err := ensureUser(c.Request().Context(), result.Sub, result.Email, result.Name)
				if err != nil {
					return echo.ErrUnauthorized
				}
				userID = uid
			}

			user := &User{
				ID:    userID,
				Sub:   result.Sub,
				Email: result.Email,
				Name:  result.Name,
			}

			ctx := ContextWithUser(c.Request().Context(), user)
			ctx = audit.ContextWithActor(ctx, user.ID)
			c.SetRequest(c.Request().WithContext(ctx))
			return next(c)
		}
	}
}

// AuditMiddleware returns an Echo middleware that sets the audit source from the
// request path prefix. MCP requests arrive at /mcp, web requests at everything else.
func AuditMiddleware() echo.MiddlewareFunc {
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			source := audit.SourceWeb
			if len(c.Request().URL.Path) >= 4 && c.Request().URL.Path[:4] == "/mcp" {
				source = audit.SourceMCP
			}
			ctx := audit.ContextWithSource(c.Request().Context(), source)
			c.SetRequest(c.Request().WithContext(ctx))
			return next(c)
		}
	}
}

// LangMiddleware returns the i18n locale detection middleware.
func LangMiddleware() echo.MiddlewareFunc {
	return langs.Middleware()
}
